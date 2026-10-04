import request from "supertest";
import express from "express";
import { describe, expect, test } from "vitest";

import { createMemoryRateLimitStore, createUserRateLimiter } from "../src/rate-limit.js";

function limitedApp(limiter) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = req.get("x-user") ? { uid: req.get("x-user") } : undefined;
    next();
  });
  app.get("/limited", limiter, (_req, res) => res.json({ ok: true }));
  app.use((error, _req, res, _next) => res.status(500).json({ error: { code: "internal_error" } }));
  return app;
}

describe("rate limiting", () => {
  test("refuses requests beyond the limit with 429 and Retry-After", async () => {
    const app = limitedApp(createUserRateLimiter({ limit: 2, windowMs: 60_000 }));
    await request(app).get("/limited").set("x-user", "a").expect(200);
    await request(app).get("/limited").set("x-user", "a").expect(200);
    const response = await request(app).get("/limited").set("x-user", "a").expect(429);
    expect(response.body.error.code).toBe("rate_limit_exceeded");
    expect(Number(response.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  test("each student has an independent budget", async () => {
    const app = limitedApp(createUserRateLimiter({ limit: 1, windowMs: 60_000 }));
    await request(app).get("/limited").set("x-user", "a").expect(200);
    await request(app).get("/limited").set("x-user", "b").expect(200);
    await request(app).get("/limited").set("x-user", "a").expect(429);
  });

  test("the window resets after it elapses", async () => {
    let now = 0;
    const store = createMemoryRateLimitStore({ now: () => now });
    const limiter = createUserRateLimiter({ limit: 1, windowMs: 1_000, store });
    const app = limitedApp(limiter);
    await request(app).get("/limited").set("x-user", "a").expect(200);
    await request(app).get("/limited").set("x-user", "a").expect(429);
    now = 1_500;
    await request(app).get("/limited").set("x-user", "a").expect(200);
  });

  test("the store contract can be replaced by a shared backend without changing callers", async () => {
    const calls = [];
    const store = {
      scope: "test-shared",
      async increment(key, windowMs) {
        calls.push({ key, windowMs });
        return { count: 1, resetAt: Date.now() + windowMs };
      },
    };
    const app = limitedApp(createUserRateLimiter({ limit: 5, store }));
    await request(app).get("/limited").set("x-user", "student-z").expect(200);
    expect(calls).toEqual([{ key: "uid:student-z", windowMs: 60_000 }]);
  });

  test("a failing store fails closed with an error, not an allowed request", async () => {
    const store = { async increment() { throw new Error("backend down"); } };
    const app = limitedApp(createUserRateLimiter({ limit: 5, store }));
    await request(app).get("/limited").set("x-user", "a").expect(500);
  });

  test("a limit must be a positive integer", () => {
    expect(() => createUserRateLimiter({ limit: 0 })).toThrow(/positive integer/);
    expect(() => createUserRateLimiter({ limit: 1.5 })).toThrow(/positive integer/);
  });
});
