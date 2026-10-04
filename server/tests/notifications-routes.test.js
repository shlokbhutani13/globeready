import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

describe("POST /api/notifications/sync", () => {
  let app;
  let store;

  beforeEach(() => {
    store = createDemoStore();
    app = createApp({ store, auth: null, assistant: null });
  });

  const demo = (method, path) => request(app)[method](path).set("x-demo-user", "student-a");

  test("requires authentication", async () => {
    await request(app).post("/api/notifications/sync").expect(401);
  });

  test("creates an in-app notification for an overdue, incomplete task", async () => {
    await store.tasks.create("student-a", { title: "Pay the SEVIS fee", dueDate: "2000-01-01", completed: false });

    const response = await demo("post", "/api/notifications/sync").expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].title).toMatch(/Pay the SEVIS fee/);
  });

  test("never syncs or exposes another user's tasks as notifications", async () => {
    await store.tasks.create("student-b", { title: "B's private task", dueDate: "2000-01-01", completed: false });

    const response = await demo("post", "/api/notifications/sync").expect(200);

    expect(response.body.data).toHaveLength(0);
    expect(await store.notifications.list("student-b")).toHaveLength(0);
  });

  test("running sync twice does not duplicate the reminder", async () => {
    await store.tasks.create("student-a", { title: "Renew passport", dueDate: "2000-01-01", completed: false });

    await demo("post", "/api/notifications/sync").expect(200);
    const second = await demo("post", "/api/notifications/sync").expect(200);

    expect(second.body.data).toHaveLength(0);
    expect(await store.notifications.list("student-a")).toHaveLength(1);
  });
});
