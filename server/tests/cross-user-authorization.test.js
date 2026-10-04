import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

// Tokens name the owner, so the verified identity is the only way to act as a student.
const auth = {
  async verifyIdToken(token) {
    if (token.startsWith("student-") || token === "local-admin") {
      return { uid: token, auth_time: Math.floor(Date.now() / 1000), admin: token === "local-admin" };
    }
    throw new Error("invalid token");
  },
};

function setup(extra = {}) {
  const store = createDemoStore();
  const app = createApp({ store, auth, adminUids: ["local-admin"], ...extra });
  return { store, app };
}

const as = (token) => `Bearer ${token}`;

describe("a student cannot act on another student's records", () => {
  test("tasks: another student cannot edit, complete, or delete a task by its ID", async () => {
    const { app } = setup();
    const created = await request(app).post("/api/tasks").set("Authorization", as("student-a"))
      .send({ title: "A's private task", dueDate: "2026-11-01" }).expect(201);
    const id = created.body.data.id;

    await request(app).patch(`/api/tasks/${id}`).set("Authorization", as("student-b"))
      .send({ completed: true }).expect(404);
    await request(app).delete(`/api/tasks/${id}`).set("Authorization", as("student-b")).expect(404);

    const own = await request(app).get("/api/tasks").set("Authorization", as("student-a")).expect(200);
    expect(own.body.data[0]).toMatchObject({ title: "A's private task", completed: false });
    const other = await request(app).get("/api/tasks").set("Authorization", as("student-b")).expect(200);
    expect(other.body.data).toEqual([]);
  });

  test("profile: each student reads and writes only their own profile", async () => {
    const { app } = setup();
    await request(app).put("/api/profile").set("Authorization", as("student-a"))
      .send({ fullName: "Alice Private", university: "Example University" }).expect(200);
    const bob = await request(app).get("/api/profile").set("Authorization", as("student-b")).expect(200);
    expect(JSON.stringify(bob.body)).not.toContain("Alice Private");
  });

  test("resources: a student cannot delete another student's saved resource", async () => {
    const { app } = setup();
    const created = await request(app).post("/api/resources").set("Authorization", as("student-a"))
      .send({ title: "Guide", url: "https://studyinthestates.dhs.gov/students/maintaining-status" }).expect(201);
    await request(app).delete(`/api/resources/${created.body.data.id}`).set("Authorization", as("student-b")).expect(404);
  });

  test("saved updates: another student cannot unsave or read my saved items", async () => {
    const { store, app } = setup();
    const item = { id: "news-1", title: "Public", editorialState: "published-source-only", urgency: "medium" };
    await store.news.upsert("news-key-1", item);
    await request(app).post("/api/news/news-1/save").set("Authorization", as("student-a")).expect(201);
    await request(app).delete("/api/news/news-1/save").set("Authorization", as("student-b")).expect(404);
    const bob = await request(app).get("/api/news/preferences").set("Authorization", as("student-b")).expect(200);
    expect(JSON.stringify(bob.body)).not.toContain("news-1");
  });

  test("notifications: a sync for one student never creates or exposes another student's reminders", async () => {
    const { store, app } = setup();
    await store.tasks.create("student-a", { title: "Overdue", dueDate: "2000-01-01", completed: false, priority: "high" });
    await request(app).post("/api/notifications/sync").set("Authorization", as("student-b")).expect(200);
    const bob = await store.notifications.list("student-b");
    expect(bob).toEqual([]);
  });

  test("documents: another student cannot index, read, or delete a document by its ID", async () => {
    const { store, app } = setup();
    const document = await store.documents.create("student-a", {
      name: "i20.pdf", contentType: "application/pdf", storagePath: "users/student-a/documents/doc1/i20.pdf",
    });
    await request(app).post(`/api/documents/${document.id}/index`).set("Authorization", as("student-b")).expect(404);
    await request(app).delete(`/api/documents/${document.id}`).set("Authorization", as("student-b")).expect(404);
    const bob = await request(app).get("/api/documents").set("Authorization", as("student-b")).expect(200);
    expect(bob.body.data).toEqual([]);
    expect(await store.documents.list("student-a")).toHaveLength(1);
  });

  test("assistant: a student cannot read another student's conversation by its ID", async () => {
    const { app } = setup();
    const created = await request(app).post("/api/assistant").set("Authorization", as("student-a"))
      .send({ question: "How long is my travel signature valid?" }).expect(200);
    const conversationId = created.body.data.conversationId;
    await request(app).get(`/api/assistant/conversations/${conversationId}/messages`)
      .set("Authorization", as("student-b")).expect(404);
    await request(app).post("/api/assistant").set("Authorization", as("student-b"))
      .send({ question: "Continue that conversation please", conversationId }).expect(404);
  });

  test("export: contains only the requesting student's data", async () => {
    const { store, app } = setup();
    await store.tasks.create("student-a", { title: "A-only-marker", dueDate: "2026-12-01", completed: false });
    await store.tasks.create("student-b", { title: "B-only-marker", dueDate: "2026-12-01", completed: false });
    const response = await request(app).get("/api/account/export").set("Authorization", as("student-a")).expect(200);
    const text = JSON.stringify(response.body);
    expect(text).toContain("A-only-marker");
    expect(text).not.toContain("B-only-marker");
    expect(text).not.toMatch(/student-b/);
  });

  test("account deletion removes only the requesting student's data", async () => {
    const deleted = [];
    const { store, app } = setup({
      account: {
        deleteStoragePrefix: async (uid) => { deleted.push(uid); },
        deleteAuthUser: async (uid) => { deleted.push(`auth:${uid}`); },
      },
    });
    await store.tasks.create("student-a", { title: "A gone", dueDate: "2026-12-01", completed: false });
    await store.tasks.create("student-b", { title: "B stays", dueDate: "2026-12-01", completed: false });
    await request(app).delete("/api/account").set("Authorization", as("student-a"))
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);
    expect(deleted).toEqual(["student-a", "auth:student-a"]);
    expect(await store.tasks.list("student-a")).toEqual([]);
    expect((await store.tasks.list("student-b")).map((task) => task.title)).toEqual(["B stays"]);
  });
});

describe("task edits are validated", () => {
  test("a non-text or blank title is refused instead of blanking the task", async () => {
    const { store, app } = setup();
    const task = await store.tasks.create("student-a", { title: "Keep title", dueDate: "2026-12-01", completed: false });
    await request(app).patch(`/api/tasks/${task.id}`).set("Authorization", as("student-a"))
      .send({ title: ["not", "text"] }).expect(422);
    await request(app).patch(`/api/tasks/${task.id}`).set("Authorization", as("student-a"))
      .send({ title: "   " }).expect(422);
    expect((await store.tasks.list("student-a"))[0].title).toBe("Keep title");
  });
});

describe("administration and scheduler boundaries", () => {
  test("an ordinary student cannot reach admin news routes", async () => {
    const { app } = setup();
    await request(app).get("/api/admin/news/review").set("Authorization", as("student-a")).expect(403);
    await request(app).post("/api/admin/news/sources").set("Authorization", as("student-a")).send({}).expect(403);
  });

  test("an administrator can reach the admin news routes", async () => {
    const { app } = setup();
    await request(app).get("/api/admin/news/review").set("Authorization", as("local-admin")).expect(200);
  });

  test("the scheduler endpoint refuses requests without the shared secret", async () => {
    const { app } = setup({ schedulerSecret: "scheduler-secret-0123456789" });
    await request(app).post("/api/internal/news/sync").send({ sourceIds: [], dryRun: true }).expect(401);
    await request(app).post("/api/internal/news/sync")
      .set("Authorization", "Bearer wrong-secret-value-000")
      .send({ sourceIds: [], dryRun: true }).expect(401);
  });

  test("the scheduler endpoint is unavailable when no secret is configured", async () => {
    const { app } = setup({ schedulerSecret: undefined });
    await request(app).post("/api/internal/news/sync")
      .set("Authorization", "Bearer any-secret-value-0000")
      .send({ sourceIds: [], dryRun: true }).expect(503);
  });
});

describe("identity cannot be forged or inherited", () => {
  test("when real authentication is configured, the demo identity header is ignored", async () => {
    const { app } = setup({ demoMode: true });
    await request(app).get("/api/tasks").set("x-demo-user", "student-a").expect(401);
  });

  test("a token for a different student never yields this student's records", async () => {
    const { store, app } = setup();
    await store.tasks.create("student-a", { title: "A", dueDate: "2026-12-01", completed: false });
    const response = await request(app).get("/api/tasks").set("Authorization", as("student-b")).expect(200);
    expect(response.body.data).toEqual([]);
  });

  test("an unverifiable token is rejected rather than trusted as a student ID", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/tasks").set("Authorization", "Bearer forged-token-value").expect(401);
    expect(response.body.error.code).toBe("invalid_token");
  });
});
