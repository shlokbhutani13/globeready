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
      services: { auth: false, ai: false },
    });
  });
});
