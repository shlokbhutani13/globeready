import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { validateApprovalDraft } from "../src/news/approval-policy.js";
import { createUserRateLimiter } from "../src/rate-limit.js";
import { createDemoStore } from "../src/store.js";

function liveAuth(claims) {
  return { verifyIdToken: vi.fn(async () => ({ uid: "user-1", ...claims })) };
}

function baseApp(options = {}) {
  return createApp({ store: createDemoStore(), assistant: null, ...options });
}

test("validates approval drafts against an exact snapshot identity", () => {
  const contentHash = "a".repeat(64);
  const path = `news-source-snapshots/official/${contentHash}.txt`;
  const item = {
    id: "item-1", sourceId: "official", contentHash, currentRevisionId: "revision-1",
    editorialState: "review-required", snapshotPath: path, snapshotCommitId: "commit-1",
    sourceVerified: true, canonicalUrl: "https://www.uscis.gov/notice", title: "Official notice",
  };
  const review = {
    id: "review-1", newsItemId: item.id, sourceId: item.sourceId, contentHash,
    revisionId: item.currentRevisionId, editorialState: "review-required", status: "pending",
    draft: {
      plainLanguageSummary: "Instructions remain available.", urgency: "high",
      impactAreas: ["status"], visaTypes: ["f-1"], topics: ["status"],
      actions: [{ label: "Review", sourceUrl: item.canonicalUrl }],
    },
  };
  const snapshot = {
    sourceId: item.sourceId, contentHash, path, commitId: item.snapshotCommitId,
    text: "Instructions remain available.", verifiedDomains: ["www.uscis.gov"],
  };

  expect(validateApprovalDraft({ item, review, snapshot })).toEqual(review.draft);
  expect(() => validateApprovalDraft({
    item,
    review,
    snapshot: { ...snapshot, path: `news-source-snapshots/other/${contentHash}.txt` },
  })).toThrow(/snapshot|identity/i);
});

describe("admin authorization", () => {
  test("accepts an admin claim or an exact configured UID", async () => {
    const claimed = baseApp({ auth: liveAuth({ admin: true }) });
    await request(claimed).get("/api/admin/news/health").set("authorization", "Bearer token").expect(200);

    const configured = baseApp({ auth: liveAuth({ uid: "configured-admin" }), adminUids: ["configured-admin"] });
    await request(configured).get("/api/admin/news/health").set("authorization", "Bearer token").expect(200);
  });

  test("rejects ordinary, anonymous, and malformed configured identities", async () => {
    const ordinary = baseApp({ auth: liveAuth({ uid: "ordinary" }), adminUids: ["admin"] });
    await request(ordinary).get("/api/admin/news/health").set("authorization", "Bearer token").expect(403);
    await request(ordinary).get("/api/admin/news/health").expect(401);

    const malformed = baseApp({ auth: liveAuth({ uid: "admin" }), adminUids: "admin,,other" });
    await request(malformed).get("/api/admin/news/health").set("authorization", "Bearer token").expect(403);
  });

  test("does not grant production admin access through demo headers", async () => {
    const app = baseApp({ auth: liveAuth({ uid: "ordinary" }), adminUids: ["demo-admin"] });
    await request(app).get("/api/admin/news/health")
      .set("x-demo-user", "demo-admin")
      .set("authorization", "Bearer token")
      .expect(403);
  });
});

describe("admin news routes", () => {
  test("rate-limits admin mutations separately from health reads", async () => {
    const app = createApp({
      store: createDemoStore(),
      auth: liveAuth({ admin: true }),
      assistant: null,
      adminMutationLimiter: createUserRateLimiter({ limit: 1 }),
    });
    const admin = (method, path) => request(app)[method](path).set("authorization", "Bearer token");
    await admin("get", "/api/admin/news/health").expect(200);
    await admin("post", "/api/admin/news/sources").send({
      id: "one", publisher: "One", adapter: "feed", url: "https://one.edu/feed.xml",
      allowedHosts: ["one.edu"], verified: true, enabled: true,
    }).expect(201);
    await admin("post", "/api/admin/news/sources").send({
      id: "two", publisher: "Two", adapter: "feed", url: "https://two.edu/feed.xml",
      allowedHosts: ["two.edu"], verified: true, enabled: true,
    }).expect(429);
  });

  test("lists, creates, updates, and dry-runs registered sources", async () => {
    const store = createDemoStore();
    const syncSource = vi.fn(async (id, options) => ({ id, ...options, status: "success" }));
    const app = createApp({
      store,
      auth: liveAuth({ admin: true }),
      assistant: null,
      newsSync: { syncSource },
    });
    const admin = (method, path) => request(app)[method](path).set("authorization", "Bearer token");

    await admin("post", "/api/admin/news/sources").send({
      id: "unc-international",
      publisher: "UNC International Student and Scholar Services",
      adapter: "feed",
      url: "https://international.unc.edu/feed.xml",
      allowedHosts: ["international.unc.edu"],
      acceptedContentTypes: ["application/rss+xml"],
      sourceType: "university",
      universityId: "unc",
      verified: true,
      enabled: false,
    }).expect(201);
    expect((await admin("get", "/api/admin/news/sources").expect(200)).body.data.items)
      .toContainEqual(expect.objectContaining({ id: "unc-international" }));
    await admin("patch", "/api/admin/news/sources/unc-international").send({ enabled: true }).expect(200);
    await admin("post", "/api/admin/news/sources/unc-international/run").send({ dryRun: true }).expect(200);
    expect(syncSource).toHaveBeenCalledWith("unc-international", { dryRun: true });
    await admin("post", "/api/admin/news/sources/federal-register/run").send({ dryRun: true }).expect(200);
    expect(syncSource).toHaveBeenCalledWith("federal-register", { dryRun: true });
    await admin("post", "/api/admin/news/sources/unc-international/run").send({ dryRun: false }).expect(503);

    await admin("post", "/api/admin/news/sources").send({
      id: "mismatch",
      publisher: "Mismatch",
      adapter: "feed",
      url: "https://international.unc.edu/feed.xml",
      allowedHosts: ["registrar.unc.edu"],
      verified: true,
      enabled: true,
    }).expect(422);
    await admin("post", "/api/admin/news/sources").send({
      id: "missing-boundary",
      publisher: "Missing",
      adapter: "feed",
      verified: true,
      enabled: true,
    }).expect(422);
    await admin("post", "/api/admin/news/sources").send({
      id: "bad-host",
      publisher: "Bad host",
      adapter: "feed",
      url: "https://international.unc.edu/feed.xml",
      allowedHosts: ["international..unc.edu"],
      verified: true,
      enabled: true,
    }).expect(422);
  });

  test("approves only a current source-bound stored draft and appends a private audit record", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("official", {
      verified: true,
      enabled: true,
      allowedHosts: ["www.uscis.gov"],
    });
    const item = (await store.news.upsert("official:1", {
      sourceId: "official",
      title: "USCIS updates an employment deadline",
      publisher: "USCIS",
      sourceExcerpt: "The deadline is 2026-10-01.",
      normalizedText: "The deadline is 2026-10-01. Review https://www.uscis.gov/notice.",
      publishedAt: "2026-09-12",
      canonicalUrl: "https://www.uscis.gov/notice",
      contentHash: "a".repeat(64),
      sourceVerified: true,
      snapshotPath: `news-source-snapshots/official/${"a".repeat(64)}.txt`,
      snapshotCommitId: "commit-1",
      editorialState: "review-required",
    })).item;
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      sourceId: "official",
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "pending",
      reason: "high-impact",
      draft: {
        plainLanguageSummary: "The deadline is 2026-10-01.",
        urgency: "high",
        impactAreas: ["employment"],
        visaTypes: ["f-1"],
        topics: ["employment"],
        actions: [{ label: "Review official instructions", sourceUrl: "https://www.uscis.gov/notice" }],
      },
    });
    const snapshotStore = {
      readCommitted: vi.fn(async () => "The deadline is 2026-10-01. Review https://www.uscis.gov/notice."),
    };
    const app = createApp({
      store,
      auth: liveAuth({ admin: true }),
      assistant: null,
      snapshotStore,
      clock: () => new Date("2026-09-23T12:00:00.000Z"),
    });

    const response = await request(app).patch(`/api/admin/news/review/${review.id}`)
      .set("authorization", "Bearer token")
      .send({ decision: "approve" })
      .expect(200);
    expect(response.body.data).toMatchObject({ editorialState: "approved", plainLanguageSummary: "The deadline is 2026-10-01." });
    expect(snapshotStore.readCommitted).toHaveBeenCalledWith({
      path: item.snapshotPath,
      commitId: item.snapshotCommitId,
    });
    const records = await store.reviewAudit.listGlobal();
    expect(records).toContainEqual(expect.objectContaining({
      decision: "approve",
      reviewerUid: "user-1",
      newsItemId: item.id,
    }));
    expect((await store.news.listPublished({}))[0]).not.toHaveProperty("reviewerUid");
    expect((await store.news.listPublished({}))[0]).not.toHaveProperty("approvalEvidence");
    expect((await store.news.listPublished({}))[0]).not.toHaveProperty("summaryProvenance");
  });

  test("uses immutable registered verification fields when stored source state only has health data", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("official", { lastRunStatus: "success" });
    const item = (await store.news.upsert("official:registry", {
      sourceId: "official",
      title: "Official notice",
      publisher: "USCIS",
      sourceExcerpt: "Instructions remain available.",
      normalizedText: "Instructions remain available.",
      canonicalUrl: "https://www.uscis.gov/notice",
      contentHash: "a".repeat(64),
      sourceVerified: true,
      snapshotPath: `news-source-snapshots/official/${"a".repeat(64)}.txt`,
      snapshotCommitId: "commit-1",
      editorialState: "review-required",
    })).item;
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      sourceId: "official",
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "pending",
      reason: "high-impact",
      draft: {
        plainLanguageSummary: "Instructions remain available.",
        urgency: "high",
        impactAreas: ["status"],
        visaTypes: ["f-1"],
        topics: ["status"],
        actions: [{ label: "Review", sourceUrl: "https://www.uscis.gov/notice" }],
      },
    });
    const app = createApp({
      store,
      auth: liveAuth({ admin: true }),
      assistant: null,
      registeredNewsSources: [{ id: "official", verified: true, allowedHosts: ["www.uscis.gov"] }],
      snapshotStore: { readCommitted: vi.fn(async () => "Instructions remain available.") },
    });
    await request(app).patch(`/api/admin/news/review/${review.id}`)
      .set("authorization", "Bearer token").send({ decision: "approve" }).expect(200);
  });

  test("fails closed for stale, unsafe, unsupported, or unverifiable approval drafts", async () => {
    const cases = [
      { name: "stale", review: { contentHash: "b".repeat(64) } },
      { name: "unsafe URL", draft: { actions: [{ label: "Open", sourceUrl: "https://evil.example/" }] } },
      { name: "explicit port", draft: { actions: [{ label: "Open", sourceUrl: "https://www.uscis.gov:443/notice" }] } },
      { name: "unsupported date", draft: { plainLanguageSummary: "The deadline is 2027-01-01." } },
      { name: "missing snapshot", item: { snapshotCommitId: null } },
      { name: "consumed review", review: { status: "consumed" } },
    ];

    for (const scenario of cases) {
      const store = createDemoStore();
      await store.newsSources.upsert("official", { verified: true, allowedHosts: ["www.uscis.gov"] });
      const item = (await store.news.upsert(`official:${scenario.name}`, {
        sourceId: "official",
        title: "Current notice",
        publisher: "USCIS",
        sourceExcerpt: "The deadline is 2026-10-01.",
        normalizedText: "The deadline is 2026-10-01.",
        canonicalUrl: "https://www.uscis.gov/notice",
        contentHash: "a".repeat(64),
        currentRevisionId: "revision-1",
        sourceVerified: true,
        snapshotPath: `news-source-snapshots/official/${"a".repeat(64)}.txt`,
        snapshotCommitId: "commit-1",
        editorialState: "review-required",
        ...(scenario.item || {}),
      })).item;
      const draft = {
        plainLanguageSummary: "The deadline is 2026-10-01.",
        urgency: "high",
        impactAreas: ["employment"],
        visaTypes: ["f-1"],
        topics: ["employment"],
        actions: [{ label: "Review", sourceUrl: "https://www.uscis.gov/notice" }],
        ...(scenario.draft || {}),
      };
      const review = await store.reviewQueue.create({
        newsItemId: item.id,
        sourceId: "official",
        contentHash: item.contentHash,
        revisionId: item.currentRevisionId,
        editorialState: "review-required",
        status: "pending",
        reason: "high-impact",
        draft,
        ...(scenario.review || {}),
      });
      const app = createApp({
        store,
        auth: liveAuth({ admin: true }),
        assistant: null,
        snapshotStore: { readCommitted: vi.fn(async () => "The deadline is 2026-10-01.") },
      });
      await request(app).patch(`/api/admin/news/review/${review.id}`)
        .set("authorization", "Bearer token").send({ decision: "approve" }).expect(409);
      expect((await store.news.get(item.id)).editorialState).toBe("review-required");
    }
  });

  test("rejects entity-obfuscated URI syntax and relative-time claims even when source text contains them", async () => {
    for (const plainLanguageSummary of [
      "Open h&colon;&sol;&sol;evil.example for details.",
      "Open https：／／evil.example for details.",
      "Open ftp://evil.example for details.",
      "Open https://www.uscis.gov/notice, then ftp://evil.example for details.",
      "The deadline is tomorrow.",
      "The deadline is two business days from now.",
      "The deadline is the following day.",
    ]) {
      const store = createDemoStore();
      await store.newsSources.upsert("official", { verified: true, allowedHosts: ["www.uscis.gov"] });
      const item = (await store.news.upsert(`official:${plainLanguageSummary}`, {
        sourceId: "official",
        title: "Current notice",
        publisher: "USCIS",
        sourceExcerpt: "The deadline is tomorrow.",
        normalizedText: "The deadline is tomorrow.",
        canonicalUrl: "https://www.uscis.gov/notice",
        contentHash: "a".repeat(64),
        sourceVerified: true,
        snapshotPath: `news-source-snapshots/official/${"a".repeat(64)}.txt`,
        snapshotCommitId: "commit-1",
        editorialState: "review-required",
      })).item;
      const review = await store.reviewQueue.create({
        newsItemId: item.id,
        sourceId: "official",
        contentHash: item.contentHash,
        revisionId: item.currentRevisionId,
        editorialState: "review-required",
        status: "pending",
        reason: "high-impact",
        draft: {
          plainLanguageSummary,
          urgency: "high",
          impactAreas: ["employment"],
          visaTypes: ["f-1"],
          topics: ["employment"],
          actions: [{ label: "Review", sourceUrl: "https://www.uscis.gov/notice" }],
        },
      });
      const app = createApp({
        store,
        auth: liveAuth({ admin: true }),
        assistant: null,
        snapshotStore: { readCommitted: vi.fn(async () => "The deadline is tomorrow.") },
      });
      await request(app).patch(`/api/admin/news/review/${review.id}`)
        .set("authorization", "Bearer token").send({ decision: "approve" }).expect(409);
      expect((await store.news.get(item.id)).editorialState).toBe("review-required");
    }
  });

  test("binds the committed snapshot path to the current source ID and content hash", async () => {
    for (const snapshotPath of [
      `news-source-snapshots/other/${"a".repeat(64)}.txt`,
      `news-source-snapshots/official/${"b".repeat(64)}.txt`,
    ]) {
      const store = createDemoStore();
      await store.newsSources.upsert("official", { verified: true, allowedHosts: ["www.uscis.gov"] });
      const item = (await store.news.upsert(`official:${snapshotPath}`, {
        sourceId: "official",
        title: "Current notice",
        publisher: "USCIS",
        sourceExcerpt: "Instructions remain available.",
        normalizedText: "Instructions remain available.",
        canonicalUrl: "https://www.uscis.gov/notice",
        contentHash: "a".repeat(64),
        sourceVerified: true,
        snapshotPath,
        snapshotCommitId: "commit-1",
        editorialState: "review-required",
      })).item;
      const review = await store.reviewQueue.create({
        newsItemId: item.id, sourceId: "official", contentHash: item.contentHash,
        revisionId: item.currentRevisionId, editorialState: "review-required", status: "pending",
        reason: "high-impact",
        draft: {
          plainLanguageSummary: "Instructions remain available.", urgency: "high",
          impactAreas: ["status"], visaTypes: ["f-1"], topics: ["status"],
          actions: [{ label: "Review", sourceUrl: "https://www.uscis.gov/notice" }],
        },
      });
      const readCommitted = vi.fn(async () => "Instructions remain available.");
      const app = createApp({
        store, auth: liveAuth({ admin: true }), assistant: null,
        snapshotStore: { readCommitted },
      });
      await request(app).patch(`/api/admin/news/review/${review.id}`)
        .set("authorization", "Bearer token").send({ decision: "approve" }).expect(409);
      expect(readCommitted).not.toHaveBeenCalled();
    }
  });

  test("rejects a pending review without publishing its draft and audits the decision", async () => {
    const store = createDemoStore();
    const item = (await store.news.upsert("official:rejected", {
      sourceId: "official",
      title: "Notice",
      contentHash: "a".repeat(64),
      editorialState: "review-required",
    })).item;
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "pending",
      reason: "high-impact",
      draft: { plainLanguageSummary: "Private draft", actions: [] },
    });
    const app = createApp({ store, auth: liveAuth({ admin: true }), assistant: null });
    await request(app).patch(`/api/admin/news/review/${review.id}`)
      .set("authorization", "Bearer token").send({ decision: "reject" }).expect(200);
    expect(await store.news.listPublished({})).toEqual([]);
    expect(await store.reviewQueue.get(review.id)).toMatchObject({ status: "rejected" });
  });

  test("rejects or resolves source suggestions without entering news approval", async () => {
    for (const decision of ["reject", "resolve"]) {
      const store = createDemoStore();
      const suggestion = await store.reviewQueue.create({
        type: "source-suggestion",
        canonicalUrl: "https://international.unc.edu/alerts",
        submittedBy: "student-a",
        trusted: false,
        status: "pending",
      });
      const approve = vi.spyOn(store.news, "approve");
      const app = createApp({ store, auth: liveAuth({ admin: true }), assistant: null });
      await request(app).patch(`/api/admin/news/review/${suggestion.id}`)
        .set("authorization", "Bearer token").send({ decision }).expect(200);
      expect(await store.reviewQueue.get(suggestion.id)).toMatchObject({
        status: decision === "reject" ? "rejected" : "resolved",
      });
      expect(approve).not.toHaveBeenCalled();
      expect(await store.reviewAudit.listGlobal()).toContainEqual(expect.objectContaining({
        reviewId: suggestion.id,
        decision,
      }));
    }
  });
});

describe("scheduler authorization and sync", () => {
  test("accepts only the exact scheduler secret and at most 20 registered sources", async () => {
    const store = createDemoStore();
    await store.newsSources.upsert("source-1", { enabled: true });
    const syncSource = vi.fn(async (id, { dryRun }) => ({ sourceId: id, dryRun, status: "success" }));
    const app = createApp({
      store,
      auth: null,
      assistant: null,
      schedulerSecret: "sync-test-secret",
      newsSync: { syncSource },
    });

    const accepted = await request(app).post("/api/internal/news/sync")
      .set("authorization", "Bearer sync-test-secret")
      .send({ sourceIds: ["source-1"], dryRun: true })
      .expect(200);
    expect(accepted.body.data.results).toEqual([expect.objectContaining({ sourceId: "source-1", dryRun: true })]);
    await request(app).post("/api/internal/news/sync")
      .set("authorization", "Bearer wrong-secret")
      .send({ sourceIds: ["source-1"], dryRun: true }).expect(401);
    await request(app).post("/api/internal/news/sync")
      .set("authorization", "Bearer sync-test-secret")
      .send({ sourceIds: Array.from({ length: 21 }, (_, index) => `source-${index}`), dryRun: true }).expect(422);
    await request(app).post("/api/internal/news/sync")
      .set("authorization", "Bearer sync-test-secret")
      .send({ sourceIds: ["unknown"], dryRun: true }).expect(422);
  });

  test("fails closed for missing or malformed scheduler configuration and keeps live sync disabled", async () => {
    for (const schedulerSecret of [undefined, "", "short\nsecret"]) {
      const app = baseApp({ schedulerSecret, newsSync: { syncSource: vi.fn() } });
      await request(app).post("/api/internal/news/sync")
        .set("authorization", "Bearer anything").send({ sourceIds: [], dryRun: true }).expect(503);
    }

    const app = baseApp({
      schedulerSecret: "sync-test-secret",
      newsSync: { syncSource: vi.fn() },
      newsSyncEnabled: false,
    });
    await request(app).post("/api/internal/news/sync")
      .set("authorization", "Bearer sync-test-secret")
      .send({ sourceIds: [], dryRun: false }).expect(503);
  });
});
