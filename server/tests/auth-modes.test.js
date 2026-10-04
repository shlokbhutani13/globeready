import request from "supertest";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

const fakeAuth = {
  async verifyIdToken(token) {
    if (token === "valid-token") return { uid: "student-a", auth_time: Math.floor(Date.now() / 1000) };
    throw new Error("invalid token");
  },
};

describe("authentication modes", () => {
  const savedDemoMode = process.env.DEMO_MODE;
  beforeEach(() => { delete process.env.DEMO_MODE; });
  afterEach(() => {
    if (savedDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = savedDemoMode;
  });

  test("explicit demo mode accepts the demo identity header", async () => {
    const app = createApp({ store: createDemoStore(), auth: null, demoMode: true });
    await request(app).get("/api/tasks").set("x-demo-user", "student-a").expect(200);
  });

  test("with demo mode absent, a demo identity header is rejected", async () => {
    const app = createApp({ store: createDemoStore(), auth: null });
    const response = await request(app).get("/api/tasks").set("x-demo-user", "student-a").expect(401);
    expect(response.body.error.code).toBe("authentication_unavailable");
  });

  test("DEMO_MODE=false rejects the demo identity header", async () => {
    process.env.DEMO_MODE = "false";
    const app = createApp({ store: createDemoStore(), auth: null });
    await request(app).get("/api/tasks").set("x-demo-user", "student-a").expect(401);
  });

  test("any value other than exactly 'true' does not enable demo mode", async () => {
    for (const value of ["1", "yes", "TRUE", " true"]) {
      process.env.DEMO_MODE = value;
      const app = createApp({ store: createDemoStore(), auth: null });
      await request(app).get("/api/tasks").set("x-demo-user", "student-a").expect(401);
    }
  });

  test("a forged demo header cannot authenticate when Firebase verification is configured", async () => {
    const app = createApp({ store: createDemoStore(), auth: fakeAuth, demoMode: true });
    await request(app).get("/api/tasks").set("x-demo-user", "victim-uid").expect(401);
    await request(app).get("/api/tasks").set("x-demo-user", "victim-uid").set("x-user-id", "victim-uid").expect(401);
  });

  test("a forged demo header is ignored in live mode even alongside a valid token", async () => {
    const store = createDemoStore();
    const app = createApp({ store, auth: fakeAuth });
    await request(app).get("/api/tasks")
      .set("Authorization", "Bearer valid-token")
      .set("x-demo-user", "victim-uid")
      .expect(200);
    expect(await store.tasks.list("victim-uid")).toEqual([]);
  });

  test("normal Firebase verified-token authentication still works", async () => {
    const store = createDemoStore();
    const app = createApp({ store, auth: fakeAuth });
    await request(app).post("/api/tasks").set("Authorization", "Bearer valid-token")
      .send({ title: "Live task", dueDate: "2026-11-01" }).expect(201);
    expect((await store.tasks.list("student-a")).map((task) => task.title)).toEqual(["Live task"]);
  });

  test("an invalid or missing bearer token is rejected", async () => {
    const app = createApp({ store: createDemoStore(), auth: fakeAuth });
    await request(app).get("/api/tasks").expect(401);
    await request(app).get("/api/tasks").set("Authorization", "Bearer forged").expect(401);
  });

  test("health remains available without authentication", async () => {
    const app = createApp({ store: createDemoStore(), auth: null });
    const response = await request(app).get("/api/health").expect(200);
    expect(response.body.mode).toBe("demo-disabled");
  });
});
