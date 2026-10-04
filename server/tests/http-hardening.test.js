import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";
import { createDemoStore } from "../src/store.js";

const origin = "https://app.globeready-prod.test";

function appWith(options = {}) {
  return createApp({ store: createDemoStore(), auth: null, demoMode: true, clientOrigins: [origin], ...options });
}

describe("public HTTP boundary", () => {
  test("every response carries the security headers and no framework banner", async () => {
    const response = await request(appWith()).get("/api/health/live").expect(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["strict-transport-security"]).toMatch(/max-age=/);
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  test("a valid inbound request ID is echoed and an unsafe one is replaced", async () => {
    const echoed = await request(appWith()).get("/api/health/live").set("X-Request-Id", "req-12345678").expect(200);
    expect(echoed.headers["x-request-id"]).toBe("req-12345678");

    const replaced = await request(appWith()).get("/api/health/live").set("X-Request-Id", "bad id with spaces!").expect(200);
    expect(replaced.headers["x-request-id"]).not.toBe("bad id with spaces!");
    expect(replaced.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("CORS allows only the configured origin", async () => {
    const allowed = await request(appWith()).get("/api/health/live").set("Origin", origin).expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(origin);

    const denied = await request(appWith()).get("/api/health/live").set("Origin", "https://evil.example.test").expect(200);
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("a preflight from the allowed origin permits the methods and headers the client uses", async () => {
    const response = await request(appWith())
      .options("/api/tasks")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);
    expect(response.headers["access-control-allow-methods"]).toMatch(/PATCH/);
    expect(response.headers["access-control-allow-headers"]).toMatch(/Authorization/i);
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  test("malformed JSON is a normalized 400 with no internal detail", async () => {
    const response = await request(appWith())
      .post("/api/tasks")
      .set("x-demo-user", "student-a")
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(response.body).toEqual({ error: { code: "invalid_json", message: "The request body is not valid JSON." } });
    expect(JSON.stringify(response.body)).not.toMatch(/at |stack|SyntaxError/);
  });

  test("a body sent without application/json is refused with 415", async () => {
    const response = await request(appWith())
      .post("/api/tasks")
      .set("x-demo-user", "student-a")
      .set("Content-Type", "text/plain")
      .send("title=hello")
      .expect(415);
    expect(response.body.error.code).toBe("unsupported_media_type");
  });

  test("an oversized body is refused with 413 before any handler runs", async () => {
    const response = await request(appWith())
      .post("/api/tasks")
      .set("x-demo-user", "student-a")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ title: "x".repeat(200_000) }))
      .expect(413);
    expect(response.body.error.code).toBe("payload_too_large");
  });

  test("a JSON scalar body is refused rather than treated as an object", async () => {
    await request(appWith())
      .post("/api/tasks")
      .set("x-demo-user", "student-a")
      .set("Content-Type", "application/json")
      .send("\"just a string\"")
      .expect(400);
  });

  test("an unknown route returns a normalized 404", async () => {
    const response = await request(appWith()).get("/api/does-not-exist").expect(404);
    expect(response.body).toEqual({ error: { code: "not_found", message: "Route not found." } });
  });

  test("a missing body on a write is handled as an empty object, not a crash", async () => {
    const response = await request(appWith()).post("/api/tasks").set("x-demo-user", "student-a").expect(422);
    expect(response.body.error.code).toBe("invalid_task");
  });

  test("an internal failure never exposes its message or stack to the client", async () => {
    const brokenStore = createDemoStore();
    brokenStore.tasks.list = async () => {
      throw new Error("database password is hunter2 at /srv/internal/path");
    };
    const response = await request(appWith({ store: brokenStore })).get("/api/tasks").set("x-demo-user", "student-a").expect(500);
    expect(response.body).toEqual({ error: { code: "internal_error", message: "The request could not be completed." } });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|srv|password/);
  });

  test("no clients are allowed when no origin is configured", async () => {
    const response = await request(appWith({ clientOrigins: [] })).get("/api/health/live").set("Origin", origin).expect(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("health separates liveness, readiness, mode, and version", () => {
  test("liveness reports only that the process is running", async () => {
    const response = await request(appWith({ readiness: () => false })).get("/api/health/live").expect(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  test("readiness reflects the readiness signal and returns 503 when not ready", async () => {
    await request(appWith({ readiness: () => true })).get("/api/health/ready").expect(200, { status: "ready" });
    await request(appWith({ readiness: () => false })).get("/api/health/ready").expect(503, { status: "not_ready" });
  });

  test("local-user operation reports its own mode rather than live", async () => {
    const response = await request(appWith({
      runtimeMode: "local-user",
      demoMode: false,
      auth: { verifyIdToken: async () => ({ uid: "local-student" }) },
    })).get("/api/health").expect(200);
    expect(response.body.mode).toBe("local-user");
    expect(response.body.services.auth).toBe(true);
  });

  test("the health summary exposes the build version but no secrets or paths", async () => {
    const response = await request(appWith({ version: "2.0.0", buildId: "abc123" })).get("/api/health").expect(200);
    expect(response.body).toEqual({
      ok: true, mode: "demo", version: "2.0.0", build: "abc123", services: { auth: false, ai: false },
    });
  });
});

describe("structured request logging", () => {
  function capture() {
    const lines = [];
    const logger = createLogger({ level: "debug", write: (line) => lines.push(line) });
    return { lines, logger };
  }

  test("each request produces one structured line with the route template, status, and latency", async () => {
    const { lines, logger } = capture();
    await request(appWith({ logger })).get("/api/health/live").set("X-Request-Id", "log-req-0001").expect(200);
    const entry = lines.map((line) => JSON.parse(line)).find((item) => item.event === "http.request");
    expect(entry).toMatchObject({ severity: "INFO", requestId: "log-req-0001", method: "GET", status: 200 });
    expect(typeof entry.latencyMs).toBe("number");
    expect(entry.route).toBe("/api/health/live");

    lines.length = 0;
    await request(appWith({ logger })).get("/api/missing/123456").expect(404);
    const unmatched = lines.map((line) => JSON.parse(line)).find((item) => item.event === "http.request");
    expect(unmatched).toMatchObject({ status: 404, route: "unmatched" });
  });

  test("the logged route is a template, so IDs in the path never reach the logs", async () => {
    const { lines, logger } = capture();
    await request(appWith({ logger })).get("/api/tasks/secret-task-identifier-123").set("x-demo-user", "student-a").expect(404);
    const text = lines.join("\n");
    expect(text).not.toContain("secret-task-identifier-123");
  });

  test("authorization headers, tokens, and request bodies never appear in logs", async () => {
    const { lines, logger } = capture();
    const app = appWith({
      logger,
      auth: { verifyIdToken: async () => { throw new Error("bad signature with token-material"); } },
      demoMode: false,
    });
    await request(app)
      .post("/api/assistant")
      .set("Authorization", "Bearer SUPER-SECRET-ID-TOKEN")
      .set("Content-Type", "application/json")
      .send({ question: "Private question about my passport number X1234567" })
      .expect(401);
    const text = lines.join("\n");
    expect(text).not.toContain("SUPER-SECRET-ID-TOKEN");
    expect(text).not.toContain("passport");
    expect(text).not.toContain("token-material");
  });
});
