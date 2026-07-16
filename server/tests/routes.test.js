import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createUserRateLimiter } from "../src/rate-limit.js";
import { createDemoStore } from "../src/store.js";

describe("application routes", () => {
  let app;

  beforeEach(() => {
    app = createApp({ store: createDemoStore(), auth: null, assistant: null });
  });

  const demo = (method, path) =>
    request(app)[method](path).set("x-demo-user", "student-a");

  test("updates and reads the student profile", async () => {
    await demo("put", "/api/profile")
      .send({ fullName: "Maya Singh", university: "UNC Chapel Hill", homeCountry: "India" })
      .expect(200);

    const response = await demo("get", "/api/profile").expect(200);
    expect(response.body.data.university).toBe("UNC Chapel Hill");
  });

  test("creates, completes, and deletes a task", async () => {
    const created = await demo("post", "/api/tasks")
      .send({ title: "Review I-20", priority: "high", dueDate: "2026-08-10" })
      .expect(201);

    const completed = await demo("patch", `/api/tasks/${created.body.data.id}`)
      .send({ completed: true })
      .expect(200);
    expect(completed.body.data.completed).toBe(true);

    await demo("delete", `/api/tasks/${created.body.data.id}`).expect(204);
  });

  test("rejects unsupported document types", async () => {
    const response = await demo("post", "/api/documents")
      .send({ name: "script.exe", contentType: "application/octet-stream", size: 100 })
      .expect(422);

    expect(response.body.error.code).toBe("invalid_document");
  });

  test("returns a sourced demo assistant response without Gemini", async () => {
    const response = await demo("post", "/api/assistant")
      .send({ question: "How should I prepare for an SSN appointment?" })
      .expect(200);

    expect(response.body.data.mode).toBe("demo");
    expect(response.body.data.sources.length).toBeGreaterThan(0);
    expect(response.body.data.disclaimer).toMatch(/official/i);
  });

  test("limits repeated AI requests per user", async () => {
    const limitedApp = createApp({
      store: createDemoStore(),
      auth: null,
      assistant: null,
      aiLimiter: createUserRateLimiter({ limit: 1, windowMs: 60_000 }),
    });

    await request(limitedApp)
      .post("/api/assistant")
      .set("x-demo-user", "student-a")
      .send({ question: "How should I prepare for an SSN appointment?" })
      .expect(200);

    const response = await request(limitedApp)
      .post("/api/assistant")
      .set("x-demo-user", "student-a")
      .send({ question: "What documents should I bring?" })
      .expect(429);

    expect(response.body.error.code).toBe("rate_limit_exceeded");
  });
});
