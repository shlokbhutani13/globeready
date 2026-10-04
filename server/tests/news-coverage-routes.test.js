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
