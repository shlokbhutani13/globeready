import express from "express";
import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createAuthMiddleware } from "../src/auth.js";

describe("authentication", () => {
  test("rejects a missing bearer token in live mode", async () => {
    const app = express();
    app.get("/protected", createAuthMiddleware({ verifyIdToken: vi.fn() }), (req, res) => {
      res.json({ uid: req.user.uid });
    });

    await request(app).get("/protected").expect(401);
  });

  test("uses an explicit demo identity only in explicit demo mode", async () => {
    const app = express();
    app.get("/protected", createAuthMiddleware(null, { demoMode: true }), (req, res) => {
      res.json({ uid: req.user.uid });
    });

    const response = await request(app)
      .get("/protected")
      .set("x-demo-user", "student-demo")
      .expect(200);

    expect(response.body.uid).toBe("student-demo");
  });

  test("rejects a demo identity header when demo mode is not explicitly enabled", async () => {
    const app = express();
    app.get("/protected", createAuthMiddleware(null), (req, res) => {
      res.json({ uid: req.user.uid });
    });

    await request(app).get("/protected").set("x-demo-user", "student-demo").expect(401);
  });
});
