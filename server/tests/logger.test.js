import { describe, expect, test } from "vitest";

import { createLogger, sanitizeLogFields } from "../src/logger.js";

describe("structured logger", () => {
  test("writes one parseable JSON object per line with severity, event, and timestamp", () => {
    const lines = [];
    const logger = createLogger({ level: "info", write: (line) => lines.push(line), clock: () => new Date("2026-01-02T03:04:05Z") });
    logger.info("startup.ready", { port: 5051 });
    const entry = JSON.parse(lines[0]);
    expect(entry).toEqual({ timestamp: "2026-01-02T03:04:05.000Z", severity: "INFO", event: "startup.ready", port: 5051 });
  });

  test("messages below the configured level are dropped", () => {
    const lines = [];
    const logger = createLogger({ level: "warn", write: (line) => lines.push(line) });
    logger.debug("noise");
    logger.info("noise");
    logger.warn("kept");
    expect(lines).toHaveLength(1);
  });

  test("an unknown log level is refused at construction", () => {
    expect(() => createLogger({ level: "loud" })).toThrow(/Log level/);
  });

  test("sensitive field names are removed whatever their value", () => {
    const safe = sanitizeLogFields({
      authorization: "Bearer x",
      idToken: "abc",
      password: "p",
      apiKey: "k",
      privateKey: "pk",
      question: "what is my visa",
      excerpt: "passport",
      document: "contents",
      email: "student@example.test",
      profile: { fullName: "A" },
      status: 200,
      route: "/api/tasks/:id",
    });
    expect(safe).toEqual({ status: 200, route: "/api/tasks/:id" });
  });

  test("long strings are truncated and object values are dropped", () => {
    const safe = sanitizeLogFields({ reason: "x".repeat(500), nested: { a: 1 } });
    expect(safe.reason.length).toBeLessThanOrEqual(201);
    expect(safe.nested).toBeUndefined();
  });

  test("errors contribute only their code or name, never their message", () => {
    const error = Object.assign(new Error("secret internal detail"), { code: "auth/user-not-found" });
    expect(sanitizeLogFields({ failure: error })).toEqual({ failure: "auth/user-not-found" });
  });

  test("child loggers add fixed context and never bypass redaction", () => {
    const lines = [];
    const logger = createLogger({ write: (line) => lines.push(line) }).child({ requestId: "r-1", token: "secret" });
    logger.error("boom", { status: 500 });
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ requestId: "r-1", status: 500, severity: "ERROR" });
    expect(entry.token).toBeUndefined();
  });
});
