import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

const CONFIRMATION = "DELETE MY ACCOUNT";
const NOW = Date.parse("2026-10-03T12:00:00Z");

// A stand-in for Firebase Admin's verifyIdToken: the bearer token is JSON.
const fakeAuth = {
  async verifyIdToken(token) {
    return JSON.parse(token);
  },
};
const bearer = (uid, authTimeMs = NOW) => `Bearer ${JSON.stringify({
  uid,
  email: `${uid}@example.edu`,
  auth_time: Math.floor(authTimeMs / 1000),
})}`;

async function seed(store, uid, label) {
  await store.profiles.set(uid, { fullName: `${label} Student`, university: `${label} University`, universityId: `${label}-u` });
  await store.newsPreferences.set(uid, { topics: ["status"], digestFrequency: "weekly", emailRemindersEnabled: true });
  await store.tasks.create(uid, { title: `${label} task`, dueDate: "2026-11-01", completed: false });
  await store.documents.create(uid, { id: `${label}-doc`, name: `${label}-passport.pdf`, storagePath: `users/${uid}/documents/${label}-doc/p.pdf`, contentType: "application/pdf" });
  await store.ragChunks.replace(uid, `${label}-doc`, [{ index: 0, page: 1, text: `${label} private passport text.`, documentName: `${label}-passport.pdf` }]);
  await store.savedNews.create(uid, { newsItemId: `${label}-news` });
  await store.notifications.create(uid, { title: `${label} reminder`, read: false });
  await store.resources.create(uid, { title: `${label} guide`, url: "https://studyinthestates.dhs.gov/" });
  const conversation = await store.conversations.create(uid, { title: `${label} question` });
  await store.conversationMessages.create(uid, conversation.id, { role: "user", text: `${label} private question` });
  await store.reviewQueue.create({ type: "source-suggestion", submittedBy: uid, status: "pending", canonicalUrl: `https://${label}.edu/` });
}

describe("account export", () => {
  let store;
  let app;

  beforeEach(async () => {
    store = createDemoStore();
    app = createApp({ store, auth: fakeAuth, assistant: null, clock: () => new Date(NOW) });
    await seed(store, "student-a", "alpha");
    await seed(store, "student-b", "beta");
  });

  test("requires an authenticated session", async () => {
    await request(app).get("/api/account/export").expect(401);
  });

  test("contains only the authenticated student's data and no internal fields", async () => {
    const response = await request(app)
      .get("/api/account/export")
      .set("Authorization", bearer("student-a"))
      .expect(200);

    const body = response.body;
    expect(body.schemaVersion).toBe(1);
    expect(body.profile.fullName).toBe("alpha Student");
    expect(body.documents[0].pages).toEqual([{ page: 1, text: "alpha private passport text." }]);
    expect(body.conversations[0].messages[0].text).toBe("alpha private question");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("beta");
    expect(serialized).not.toContain("storagePath");
    expect(serialized).not.toContain("embedding");
    expect(response.headers["content-disposition"]).toMatch(/attachment/);
  });
});

describe("account deletion", () => {
  let store;
  let deleteStoragePrefix;
  let deleteAuthUser;
  let app;

  beforeEach(async () => {
    store = createDemoStore();
    deleteStoragePrefix = vi.fn(async () => {});
    deleteAuthUser = vi.fn(async () => {});
    app = createApp({
      store,
      auth: fakeAuth,
      assistant: null,
      clock: () => new Date(NOW),
      account: { deleteStoragePrefix, deleteAuthUser },
    });
    await seed(store, "student-a", "alpha");
    await seed(store, "student-b", "beta");
  });

  test("refuses to delete without the exact confirmation phrase", async () => {
    await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a"))
      .send({ confirmation: "yes" })
      .expect(422);
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(await store.profiles.get("student-a")).not.toBeNull();
  });

  test("refuses deletion from a stale sign-in and removes nothing", async () => {
    const response = await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a", NOW - 60 * 60_000))
      .send({ confirmation: CONFIRMATION })
      .expect(403);

    expect(response.body.error.code).toBe("recent_login_required");
    expect(await store.profiles.get("student-a")).not.toBeNull();
    expect(deleteStoragePrefix).not.toHaveBeenCalled();
  });

  test("removes every user-owned resource of the requesting student", async () => {
    await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a"))
      .send({ confirmation: CONFIRMATION })
      .expect(200);

    expect(await store.profiles.get("student-a")).toBeNull();
    expect(await store.newsPreferences.get("student-a")).toBeNull();
    expect(await store.tasks.list("student-a")).toEqual([]);
    expect(await store.documents.list("student-a")).toEqual([]);
    expect(await store.ragChunks.list("student-a")).toEqual([]);
    expect(await store.savedNews.list("student-a")).toEqual([]);
    expect(await store.notifications.list("student-a")).toEqual([]);
    expect(await store.resources.list("student-a")).toEqual([]);
    expect(await store.conversations.list("student-a")).toEqual([]);
    expect(await store.conversationMessages.list("student-a", "missing")).toEqual([]);
  });

  test("deletes the student's storage objects and Firebase Auth identity", async () => {
    await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a"))
      .send({ confirmation: CONFIRMATION })
      .expect(200);

    expect(deleteStoragePrefix).toHaveBeenCalledWith("student-a");
    expect(deleteStoragePrefix).not.toHaveBeenCalledWith("student-b");
    expect(deleteAuthUser).toHaveBeenCalledWith("student-a");
  });

  test("does not affect another student's data, storage, or identity", async () => {
    await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a"))
      .send({ confirmation: CONFIRMATION })
      .expect(200);

    expect((await store.profiles.get("student-b")).fullName).toBe("beta Student");
    expect(await store.tasks.list("student-b")).toHaveLength(1);
    expect(await store.documents.list("student-b")).toHaveLength(1);
    expect(await store.ragChunks.list("student-b")).toHaveLength(1);
    expect(await store.savedNews.list("student-b")).toHaveLength(1);
    expect(await store.notifications.list("student-b")).toHaveLength(1);
    expect(await store.resources.list("student-b")).toHaveLength(1);
    expect(await store.conversations.list("student-b")).toHaveLength(1);
    expect(deleteAuthUser).not.toHaveBeenCalledWith("student-b");
  });

  test("keeps the deleted student's review submissions but removes their identity from them", async () => {
    await request(app)
      .delete("/api/account")
      .set("Authorization", bearer("student-a"))
      .send({ confirmation: CONFIRMATION })
      .expect(200);

    const reviews = await store.reviewQueue.listGlobal();
    const alpha = reviews.find((review) => review.canonicalUrl === "https://alpha.edu/");
    const beta = reviews.find((review) => review.canonicalUrl === "https://beta.edu/");
    expect(alpha.submittedBy).toBeNull();
    expect(beta.submittedBy).toBe("student-b");
  });

  test("reports that the auth identity was not deleted when Firebase Admin is not configured", async () => {
    const demoApp = createApp({ store, auth: null, assistant: null, clock: () => new Date(NOW) });

    const response = await request(demoApp)
      .delete("/api/account")
      .set("x-demo-user", "student-b")
      .send({ confirmation: CONFIRMATION })
      .expect(200);

    expect(response.body.data.authIdentity).toBe("not-configured");
  });
});
