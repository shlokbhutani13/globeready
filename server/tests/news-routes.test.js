import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createUserRateLimiter } from "../src/rate-limit.js";
import { createDemoStore } from "../src/store.js";

function publishedItem(overrides = {}) {
  return {
    sourceId: "federal-register",
    title: "Employment notice",
    publisher: "Federal Register",
    canonicalUrl: "https://www.federalregister.gov/documents/1",
    contentHash: "a".repeat(64),
    sourceVerified: true,
    editorialState: "published-source-only",
    legalState: "final",
    urgency: "high",
    topics: ["employment"],
    visaTypes: ["f-1"],
    universityIds: ["unc"],
    publishedAt: "2026-09-12",
    normalizedText: "private source text",
    classifierExplanation: "private reasoning",
    ...overrides,
  };
}

describe("authenticated news routes", () => {
  let store;
  let app;

  beforeEach(() => {
    store = createDemoStore();
    app = createApp({ store, auth: null, assistant: null });
  });

  const demo = (method, path, uid = "student-a") =>
    request(app)[method](path).set("x-demo-user", uid);

  test("lists published news with bounded filters and returns public projections", async () => {
    const { item } = await store.news.upsert("source:1", publishedItem());
    await store.news.upsert("source:2", publishedItem({
      title: "Travel notice",
      contentHash: "b".repeat(64),
      topics: ["travel-entry"],
    }));

    const response = await demo("get", "/api/news?topic=employment&visaType=f-1&universityId=unc&limit=1")
      .expect(200);

    expect(response.body.data.items).toEqual([expect.objectContaining({ id: item.id, title: "Employment notice" })]);
    expect(response.body.data.items[0]).not.toHaveProperty("normalizedText");
    expect(response.body.data.items[0]).not.toHaveProperty("classifierExplanation");
    expect(response.body.data).toHaveProperty("nextCursor");
  });

  test("rejects unknown, malformed, and oversized filters", async () => {
    await demo("get", "/api/news?topic=employment&unknown=yes").expect(422);
    await demo("get", "/api/news?topic=not-a-topic").expect(422);
    await demo("get", "/api/news?limit=51").expect(422);
    await demo("get", `/api/news?cursor=${"x".repeat(4097)}`).expect(422);
  });

  test("gets and saves only a currently published item per user", async () => {
    const published = (await store.news.upsert("source:published", publishedItem())).item;
    const privateItem = (await store.news.upsert("source:private", publishedItem({
      contentHash: "c".repeat(64),
      editorialState: "review-required",
    }))).item;

    const fetched = await demo("get", `/api/news/${published.id}`).expect(200);
    expect(fetched.body.data.id).toBe(published.id);
    expect(fetched.body.data).not.toHaveProperty("contentHash");

    await demo("post", `/api/news/${published.id}/save`).expect(201);
    await demo("post", `/api/news/${published.id}/save`).expect(200);
    expect(await store.savedNews.list("student-a")).toHaveLength(1);
    expect(await store.savedNews.list("student-b")).toHaveLength(0);

    await demo("get", `/api/news/${privateItem.id}`).expect(404);
    await demo("post", `/api/news/${privateItem.id}/save`).expect(404);
    await demo("delete", `/api/news/${published.id}/save`).expect(204);
  });

  test("validates preferences with a closed bounded schema", async () => {
    const saved = await demo("put", "/api/news/preferences").send({
      visaTypes: ["f-1", "j-1"],
      homeCountries: ["IN", "CA"],
      universityIds: ["unc"],
      topics: ["employment", "travel-entry"],
      digestFrequency: "weekly",
      pushEnabled: false,
    }).expect(200);
    expect(saved.body.data).toMatchObject({ visaTypes: ["f-1", "j-1"], digestFrequency: "weekly" });
    expect((await demo("get", "/api/news/preferences").expect(200)).body.data).toMatchObject({
      homeCountries: ["IN", "CA"],
      pushEnabled: false,
    });

    await demo("put", "/api/news/preferences").send({ visaTypes: ["f-1"], admin: true }).expect(422);
    await demo("put", "/api/news/preferences").send({ visaTypes: ["visitor"] }).expect(422);
    await demo("put", "/api/news/preferences").send({ homeCountries: ["india"] }).expect(422);
    await demo("put", "/api/news/preferences").send({ homeCountries: ["ZZ"] }).expect(422);
    await demo("put", "/api/news/preferences").send({ topics: Array(21).fill("general") }).expect(422);
  });

  test("accepts one canonical official source suggestion without fetching it", async () => {
    const response = await demo("post", "/api/news/source-suggestions").send({
      url: "https://international.unc.edu/alerts",
      universityId: "unc",
    }).expect(201);

    expect(response.body.data).toMatchObject({ status: "pending", trusted: false, type: "source-suggestion" });
    expect(await store.reviewQueue.get(response.body.data.id)).toMatchObject({
      submittedBy: "student-a",
      canonicalUrl: "https://international.unc.edu/alerts",
    });
    await demo("post", "/api/news/source-suggestions").send({
      url: "https://international.unc.edu/alerts#fragment",
    }).expect(422);
    await demo("post", "/api/news/source-suggestions").send({ url: "https://example.com/news" }).expect(422);
    await demo("post", "/api/news/source-suggestions").send({
      url: "https://international.unc.edu/alerts",
      secondUrl: "https://registrar.unc.edu/",
    }).expect(422);
  });

  test("rate-limits source suggestions separately", async () => {
    const limited = createApp({
      store,
      auth: null,
      assistant: null,
      sourceSuggestionLimiter: createUserRateLimiter({ limit: 1 }),
    });
    const suggestion = (url) => request(limited).post("/api/news/source-suggestions")
      .set("x-demo-user", "student-a").send({ url });

    await suggestion("https://international.unc.edu/one").expect(201);
    await suggestion("https://international.unc.edu/two").expect(429);
  });

  test("rate-limits public news queries independently from suggestions", async () => {
    const limited = createApp({
      store,
      auth: null,
      assistant: null,
      newsQueryLimiter: createUserRateLimiter({ limit: 1 }),
      sourceSuggestionLimiter: createUserRateLimiter({ limit: 2 }),
    });
    await request(limited).get("/api/news").set("x-demo-user", "student-a").expect(200);
    await request(limited).get("/api/news").set("x-demo-user", "student-a").expect(429);
    await request(limited).post("/api/news/source-suggestions").set("x-demo-user", "student-a")
      .send({ url: "https://international.unc.edu/one" }).expect(201);
  });

  test("creates one verification-pending connector for a saved official university domain", async () => {
    const first = await demo("put", "/api/profile").send({
      fullName: "Maya Singh",
      university: "UNC Chapel Hill",
      universityId: "unc",
      officialUniversityDomain: "international.unc.edu",
    }).expect(200);
    await demo("put", "/api/profile").send({
      fullName: "Maya Singh",
      university: "UNC Chapel Hill",
      universityId: "unc",
      officialUniversityDomain: "international.unc.edu",
    }).expect(200);

    expect(first.body.data).toMatchObject({
      universityId: "unc",
      officialUniversityDomain: "international.unc.edu",
    });
    expect(await store.newsSources.listGlobal()).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^university-[a-f0-9]{32}$/u),
        verificationState: "verification-pending",
        verified: false,
        allowedHosts: ["international.unc.edu"],
      }),
    ]);
    await demo("put", "/api/profile").send({
      universityId: "unc",
      officialUniversityDomain: "evil.example",
    }).expect(422);
  });
});
