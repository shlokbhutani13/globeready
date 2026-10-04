import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";

describe("health", () => {
  test("reports demo capability when external services are unavailable", async () => {
    const response = await request(createApp({ auth: null, assistant: null }))
      .get("/api/health")
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      mode: "demo",
      version: expect.any(String),
      build: "unset",
      services: { auth: false, ai: false },
    });
  });

  test("reports authentication and AI capability independently", async () => {
    const response = await request(createApp({
      auth: { verifyIdToken: async () => ({ uid: "student-a" }) },
      assistant: { mode: "demo", answer: async () => ({}), analyzeDocument: async () => ({}) },
    }))
      .get("/api/health")
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      mode: "production",
      version: expect.any(String),
      build: "unset",
      services: { auth: true, ai: false },
    });
  });
});
