import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

describe("GET /api/news/university-coverage", () => {
  let app;
  let store;

  beforeEach(() => {
    store = createDemoStore();
    app = createApp({ store, auth: null, assistant: null });
  });

  const demo = (method, path) => request(app)[method](path).set("x-demo-user", "student-a");

  test("requires authentication", async () => {
    await request(app).get("/api/news/university-coverage?universityId=unc-chapel-hill").expect(401);
  });

  test("rejects a missing or malformed universityId", async () => {
    const missing = await demo("get", "/api/news/university-coverage").expect(422);
    expect(missing.body.error.code).toBe("invalid_news_request");

    await demo("get", "/api/news/university-coverage?universityId=%20bad").expect(422);
  });

  test("reports no-verified-source for an unknown university", async () => {
    const response = await demo("get", "/api/news/university-coverage?universityId=unknown-u").expect(200);
    expect(response.body.data).toEqual({ state: "no-verified-source", sources: [] });
  });

  test("reports coverage for an admin-registered source and never leaks its URL or adapter", async () => {
    await store.newsSources.upsert("custom-u", {
      publisher: "Custom University",
      universityId: "custom-u",
      verified: true,
      enabled: true,
      url: "https://custom.edu/sitemap.xml",
      allowedHosts: ["custom.edu"],
      adapter: "university-sitemap",
    });

    const response = await demo("get", "/api/news/university-coverage?universityId=custom-u").expect(200);
    expect(response.body.data.state).toBe("covered");
    expect(response.body.data.sources).toEqual([{ publisher: "Custom University", verified: true, enabled: true }]);
    expect(JSON.stringify(response.body.data)).not.toMatch(/sitemap|allowedHosts|adapter/);
  });

  test("does not match a non-university federal source by its source ID", async () => {
    const response = await demo("get", "/api/news/university-coverage?universityId=federal-register").expect(200);
    expect(response.body.data.state).toBe("no-verified-source");
  });
});

describe("GET /api/news/coverage", () => {
  test("shows only a pending state and safe reason for university onboarding", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("pending-u", {
      publisher: "Pending University", sourceType: "university", universityId: "pending-u",
      verified: false, enabled: false,
      onboarding: { state: "verifying", officialDomain: "private.edu", parserContractVersion: "secret-v1" },
      pendingReason: "Verification is in progress.",
    });
    const app = createApp({ store, auth: null, assistant: null });
    const response = await request(app).get("/api/news/coverage")
      .set("x-demo-user", "student-a").expect(200);
    expect(response.body.data.entries).toContainEqual(expect.objectContaining({
      id: "pending-u", status: "pending", safeReason: "Verification is in progress.",
    }));
    expect(JSON.stringify(response.body.data)).not.toMatch(/private\.edu|secret-v1|verifying/);
  });

  test("requires authentication and returns only the safe coverage projection", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("custom-u", {
      publisher: "Custom University",
      authority: "university",
      jurisdiction: "US",
      topics: ["campus-life"],
      universityId: "custom-u",
      verified: true,
      enabled: true,
      cadenceHours: 24,
      url: "https://custom.edu/sitemap.xml",
      allowedHosts: ["custom.edu"],
      adapter: "university-sitemap",
      privateNotes: "never expose",
    });
    await store.newsRuns.create({
      sourceId: "custom-u",
      status: "success",
      endedAt: "2026-10-13T10:00:00.000Z",
      responseValidators: { etag: "private" },
    });
    const app = createApp({
      store,
      auth: null,
      assistant: null,
      clock: () => new Date("2026-10-13T12:00:00.000Z"),
    });

    await request(app).get("/api/news/coverage").expect(401);
    const response = await request(app).get("/api/news/coverage")
      .set("x-demo-user", "student-a")
      .expect(200);

    expect(response.body.data.entries).toContainEqual({
      id: "custom-u",
      publisher: "Custom University",
      authority: "university",
      jurisdiction: "US",
      topics: ["campus-life"],
      universityId: "custom-u",
      status: "active",
      cadenceHours: 24,
      lastSuccessAt: "2026-10-13T10:00:00.000Z",
      safeReason: null,
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(/sitemap|allowedHosts|adapter|never expose|etag/);
  });
});
