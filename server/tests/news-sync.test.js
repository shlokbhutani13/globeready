import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import { classifyCandidate } from "../src/news/classifier.js";
import { defaultNewsSources } from "../src/news/default-sources.js";
import { createNewsSync } from "../src/news/sync-news.js";
import { createDemoStore } from "../src/store.js";

const fixedClock = () => new Date("2026-09-14T12:00:00.000Z");
const source = {
  id: "federal-register",
  adapter: "fixture",
  url: "https://www.federalregister.gov/api/v1/documents.json",
  allowedHosts: ["www.federalregister.gov", "www.govinfo.gov"],
  verified: true,
  publisher: "Federal Register",
};

function officialCandidate(overrides = {}) {
  return {
    externalId: "2026-10001",
    canonicalUrl: "https://www.federalregister.gov/documents/2026/09/14/2026-10001/student-rule",
    officialPdfUrl: "https://www.govinfo.gov/content/pkg/FR-2026-09-14/pdf/2026-10001.pdf",
    title: "F-1 grace period reduced to 30 days",
    publisher: "Department of Homeland Security",
    publishedAt: "2026-09-14",
    updatedAt: null,
    effectiveAt: "2026-10-01",
    sourceDocumentType: "Rule",
    docketNumber: "ICEB-2026-0001",
    regulationIdNumber: "1653-AA95",
    excerpt: "The official rule reduces the F-1 grace period to 30 days.",
    normalizedText: "The official rule reduces the F-1 grace period to 30 days.",
    ...overrides,
  };
}

function createLeaseStore(store, { acquire = true } = {}) {
  const events = [];
  store.leases = {
    async acquire(key, owner, expiresAt) {
      events.push({ type: "acquire", key, owner, expiresAt });
      return acquire;
    },
    async release(key, owner) {
      events.push({ type: "release", key, owner });
    },
    async renew(key, owner, expiresAt) {
      events.push({ type: "renew", key, owner, expiresAt });
      return true;
    },
  };
  return events;
}

function fixtureSync({
  candidates = [officialCandidate()],
  collect,
  fetch,
  classifier = classifyCandidate,
  summarizer,
  snapshotStore,
  robotsPolicy,
  sourceOverride = {},
  leaseAcquire = true,
} = {}) {
  const store = createDemoStore();
  const leaseEvents = createLeaseStore(store, { acquire: leaseAcquire });
  const snapshotWrites = [];
  const snapshots = snapshotStore || {
    isPrivate: true,
    async save(sourceId, contentHash, content) {
      snapshotWrites.push({ sourceId, contentHash, content });
      return { path: `news-source-snapshots/${sourceId}/${contentHash}.txt` };
    },
  };
  const fetched = { status: 200, text: "fixture body", etag: '"v1"', lastModified: null, notModified: false };
  const sync = createNewsSync({
    store,
    adapters: {
      fixture: {
        async collect(sourceInput, fetchedInput) {
          if (collect) return collect(sourceInput, fetchedInput);
          if (fetchedInput !== fetched) throw new Error("adapter did not receive fetched source content");
          return candidates;
        },
      },
    },
    fetchSource: fetch || (async () => fetched),
    classifier,
    summarizer,
    snapshotStore: snapshots,
    robotsPolicy,
    sources: [{ ...source, ...sourceOverride }],
    clock: fixedClock,
  });
  return { sync, store, leaseEvents, snapshotWrites, fetched };
}

describe("news source synchronization", () => {
  test("publishes verified high-impact source data and withholds the generated summary", async () => {
    const generatedSummary = "Generated explanation that must stay private until review.";
    const summarizer = {
      async summarize() {
        return {
          ok: true,
          reviewRequired: true,
          publishable: false,
          draft: {
            plainLanguageSummary: generatedSummary,
            urgency: "high",
            impactAreas: ["status"],
            visaTypes: ["f-1"],
            topics: ["status"],
            actions: [{ label: "Read the rule", sourceUrl: officialCandidate().canonicalUrl }],
          },
        };
      },
    };
    const { sync, store } = fixtureSync({ summarizer });

    const result = await sync.syncSource("federal-register");
    const [item] = await store.news.listPublished({});
    const [review] = await store.reviewQueue.listGlobal();

    expect(result).toMatchObject({
      candidates: 1,
      created: 1,
      changed: 0,
      unchanged: 0,
      reviewRequired: 1,
      errors: [],
    });
    expect(item).toMatchObject({
      editorialState: "published-source-only",
      title: officialCandidate().title,
      sourceExcerpt: officialCandidate().excerpt,
      plainLanguageSummary: "",
      documentType: "final-rule",
      legalState: "scheduled",
      urgency: "high",
      relevance: "relevant",
    });
    expect(JSON.stringify(item)).not.toContain(generatedSummary);
    expect(item).not.toHaveProperty("snapshotPath");
    expect(item).not.toHaveProperty("classifierConfidence");
    expect(item).not.toHaveProperty("classifierMatchedTerms");
    expect(review).toMatchObject({
      newsItemId: item.id,
      editorialState: "review-required",
      highImpact: true,
      draft: { plainLanguageSummary: generatedSummary },
    });
    expect(review).not.toHaveProperty("reviewedAt");
  });

  test("publishes a future-dated rule as scheduled despite effective language", async () => {
    const { sync, store } = fixtureSync({
      candidates: [officialCandidate({
        title: "F-1 rule takes effect immediately",
        normalizedText: "The final rule takes effect immediately for F-1 students.",
        effectiveAt: "2026-10-01",
      })],
    });

    await sync.syncSource("federal-register");

    await expect(store.news.listPublished({})).resolves.toEqual([
      expect.objectContaining({ legalState: "scheduled", effectiveAt: "2026-10-01" }),
    ]);
  });

  test("does not publish a source-only item without a nonblank publisher", async () => {
    const { sync, store } = fixtureSync({
      candidates: [officialCandidate({ publisher: "" })],
      sourceOverride: { publisher: "" },
    });

    const result = await sync.syncSource("federal-register");

    expect(result).toMatchObject({ created: 1, reviewRequired: 1 });
    await expect(store.news.listPublished({})).resolves.toEqual([]);
    await expect(store.reviewQueue.listGlobal()).resolves.toEqual([
      expect.objectContaining({ reason: "missing-publisher" }),
    ]);
  });

  test("rejects malformed classifier output outside the closed bounded schema", async () => {
    const malformed = {
      documentType: "notice",
      legalState: "informational",
      urgency: "low",
      relevance: "relevant",
      highImpact: false,
      needsHumanReview: false,
      topic: "general",
      topics: ["general", 7],
      visaTypes: [],
      confidence: Number.NaN,
      matchedTerms: [],
      explanation: "bad",
      editorialState: "approved",
    };
    const { sync, store } = fixtureSync({ classifier: async () => malformed });

    const result = await sync.syncSource("federal-register");

    expect(result.errors).toEqual([expect.objectContaining({ stage: "classify" })]);
    await expect(store.news.listPublished({})).resolves.toEqual([]);
  });

  test("dry run reports estimated writes without changing any store", async () => {
    const { sync, store, leaseEvents, snapshotWrites } = fixtureSync();

    const result = await sync.syncSource("federal-register", { dryRun: true });

    expect(result).toMatchObject({
      candidates: 1,
      created: 1,
      changed: 0,
      unchanged: 0,
      reviewRequired: 1,
      errors: [],
    });
    expect(result.estimatedWrites).toBeGreaterThan(0);
    expect(await store.news.listPublished({})).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toEqual([]);
    expect(leaseEvents).toEqual([]);
    expect(snapshotWrites).toEqual([]);
  });

  test("dry run compares current state and reports prospective counts without summary calls", async () => {
    let currentCandidate = officialCandidate();
    const summarizer = { summarize: vi.fn() };
    const { sync, store, snapshotWrites } = fixtureSync({
      collect: async () => [currentCandidate],
      summarizer,
    });
    await sync.syncSource("federal-register");
    summarizer.summarize.mockClear();
    const runCount = (await store.newsRuns.listGlobal()).length;
    const reviewCount = (await store.reviewQueue.listGlobal()).length;
    snapshotWrites.length = 0;

    const unchanged = await sync.syncSource("federal-register", { dryRun: true });
    currentCandidate = officialCandidate({ normalizedText: "Changed official F-1 status text." });
    const changed = await sync.syncSource("federal-register", { dryRun: true });

    expect(unchanged).toMatchObject({ created: 0, changed: 0, unchanged: 1, reviewRequired: 0 });
    expect(changed).toMatchObject({ created: 0, changed: 1, unchanged: 0, reviewRequired: 1 });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(snapshotWrites).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toHaveLength(runCount);
    expect(await store.reviewQueue.listGlobal()).toHaveLength(reviewCount);
  });

  test("keeps repeated source runs idempotent", async () => {
    const { sync, store } = fixtureSync();

    const first = await sync.syncSource("federal-register");
    const second = await sync.syncSource("federal-register");
    const [item] = await store.news.listPublished({});

    expect(first).toMatchObject({ created: 1, changed: 0, unchanged: 0, reviewRequired: 1 });
    expect(second).toMatchObject({ created: 0, changed: 0, unchanged: 1, reviewRequired: 0 });
    expect(await store.news.listPublished({})).toHaveLength(1);
    expect(await store.news.revisions(item.id)).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
  });

  test("recovers a missing deterministic review after a post-upsert review failure", async () => {
    const { sync, store } = fixtureSync();
    const realUpsert = store.reviewQueue.upsert.bind(store.reviewQueue);
    let fail = true;
    store.reviewQueue.upsert = async (...args) => {
      if (fail) {
        fail = false;
        throw new Error("review store unavailable");
      }
      return realUpsert(...args);
    };

    const first = await sync.syncSource("federal-register");
    const second = await sync.syncSource("federal-register");
    const third = await sync.syncSource("federal-register");

    expect(first.errors).toEqual([expect.objectContaining({ stage: "review" })]);
    expect(second).toMatchObject({ unchanged: 1, reviewRequired: 1, errors: [] });
    expect(third).toMatchObject({ unchanged: 1, reviewRequired: 0, errors: [] });
    expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
  });

  test("does not duplicate deterministic reviews for repeated classification failures", async () => {
    const { sync, store } = fixtureSync({ classifier: async () => { throw new Error("bad classifier"); } });

    await sync.syncSource("federal-register");
    await sync.syncSource("federal-register");

    expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
  });

  test("isolates a candidate classification failure and records a partial run", async () => {
    const good = officialCandidate();
    const bad = officialCandidate({ externalId: "bad", title: "Broken candidate" });
    const classifier = (candidate, options) => {
      if (candidate.title === "Broken candidate") throw new Error("classification unavailable");
      return classifyCandidate(candidate, options);
    };
    const { sync, store, leaseEvents } = fixtureSync({ candidates: [good, bad], classifier });

    const result = await sync.syncSource("federal-register");
    const [run] = await store.newsRuns.listGlobal();

    expect(result).toMatchObject({ candidates: 2, created: 1, errors: [expect.objectContaining({ stage: "classify" })] });
    expect(await store.news.listPublished({})).toHaveLength(1);
    expect(run).toMatchObject({ status: "partial", success: false, itemCount: 2, errorCount: 1 });
    expect(leaseEvents.map((event) => event.type)).toEqual(["acquire", "release"]);
  });

  test("preserves the last good item and records failure when a later source fetch fails", async () => {
    let fails = false;
    const { sync, store } = fixtureSync({
      fetch: async () => {
        if (fails) throw new Error("source timeout");
        return { status: 200, text: "fixture body", etag: '"v1"', notModified: false };
      },
      collect: async (_source, fetched) => {
        if (fetched.text !== "fixture body") throw new Error("wrong fetched content");
        return [officialCandidate()];
      },
    });
    await sync.syncSource("federal-register");
    fails = true;

    const failed = await sync.syncSource("federal-register");
    const runs = await store.newsRuns.listGlobal();

    expect(failed).toMatchObject({ candidates: 0, created: 0, status: "failed", errors: [expect.objectContaining({ stage: "fetch" })] });
    expect(await store.news.listPublished({})).toEqual([
      expect.objectContaining({ title: officialCandidate().title }),
    ]);
    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "failed", success: false, errorCount: 1 }),
      expect.objectContaining({ status: "success", success: true, errorCount: 0 }),
    ]));
  });

  test("persists validators, handles 304 truthfully, and resets failure backoff on success", async () => {
    const requests = [];
    let response = { status: 200, text: "fixture body", etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT", notModified: false };
    const { sync, store } = fixtureSync({
      collect: async () => [officialCandidate()],
      fetch: async (input) => {
        requests.push(input);
        if (response instanceof Error) throw response;
        return response;
      },
    });
    await sync.syncSource("federal-register");
    response = new Error("temporary");
    const firstFailure = await sync.syncSource("federal-register");
    const secondFailure = await sync.syncSource("federal-register");
    const thirdFailure = await sync.syncSource("federal-register");
    const fourthFailure = await sync.syncSource("federal-register");
    response = { status: 304, text: "", etag: null, lastModified: null, notModified: true };
    const recovered = await sync.syncSource("federal-register");
    const state = await store.newsSources.get("federal-register");
    const runs = await store.newsRuns.listGlobal();

    expect(requests[1]).toMatchObject({ etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT" });
    expect(secondFailure.status).toBe("failed");
    expect(firstFailure.status).toBe("failed");
    expect(thirdFailure.status).toBe("failed");
    expect(fourthFailure.status).toBe("failed");
    expect(runs.find((run) => run.consecutiveFailures === 1)?.nextRetry).toBe("2026-09-14T12:15:00.000Z");
    expect(runs.find((run) => run.status === "failed" && run.consecutiveFailures === 2)?.nextRetry)
      .toBe("2026-09-14T13:00:00.000Z");
    expect(runs.find((run) => run.consecutiveFailures === 3)?.nextRetry).toBe("2026-09-14T18:00:00.000Z");
    expect(runs.find((run) => run.consecutiveFailures === 4)?.nextRetry).toBe("2026-09-15T00:00:00.000Z");
    expect(recovered.status).toBe("success");
    expect(state).toMatchObject({ etag: '"v1"', consecutiveFailures: 0 });
    expect(runs.find((run) => run.httpStatus === 304)).toMatchObject({
      httpStatus: 304,
      notModified: true,
      success: true,
      nextRetry: null,
    });
  });

  test("routes paginated Federal Register JSON through secure source fetching with truthful metadata", async () => {
    const fixture = JSON.parse(await readFile(new URL("./fixtures/federal-register-results.json", import.meta.url), "utf8"));
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        status: 200,
        finalUrl: "https://www.federalregister.gov/api/v1/documents.json?page=1",
        contentType: "application/json",
        text: JSON.stringify({ ...fixture, next_page_url: "https://www.federalregister.gov/api/v1/documents.json?page=2" }),
        etag: '"page-1"',
        lastModified: null,
        notModified: false,
      })
      .mockResolvedValueOnce({
        status: 200,
        finalUrl: "https://www.federalregister.gov/api/v1/documents.json?page=2",
        contentType: "application/json",
        text: JSON.stringify({ results: [], next_page_url: null }),
        etag: '"page-2"',
        lastModified: null,
        notModified: false,
      });
    const store = createDemoStore();
    const snapshots = { isPrivate: true, async save(_id, hash) { return { path: `news-source-snapshots/federal-register/${hash}.txt` }; } };
    const sync = createNewsSync({ store, fetchSource: fetch, snapshotStore: snapshots, sources: [defaultNewsSources[0]], clock: fixedClock });

    const result = await sync.syncSource("federal-register");
    const [run] = await store.newsRuns.listGlobal();

    expect(result.candidates).toBe(fixture.results.length);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].url).toContain("conditions%5Bagencies%5D%5B%5D=homeland-security-department");
    expect(fetch.mock.calls[1][0].url).toContain("page=2");
    expect(run.httpResponses).toEqual([
      expect.objectContaining({ status: 200, etag: '"page-1"' }),
      expect.objectContaining({ status: 200, etag: '"page-2"' }),
    ]);
  });

  test("does not overwrite a reviewed item when changed content fails classification", async () => {
    let currentCandidate = officialCandidate();
    const classifier = (candidate, options) => {
      if (candidate.title === "Changed source text") throw new Error("classification unavailable");
      return classifyCandidate(candidate, options);
    };
    const { sync, store } = fixtureSync({
      collect: async () => [currentCandidate],
      classifier,
    });
    await sync.syncSource("federal-register");
    const [published] = await store.news.listPublished({});
    const review = await store.reviewQueue.create({ newsItemId: published.id });
    await store.news.approve(published.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-14T13:00:00.000Z",
      summary: "Reviewed summary",
      reviewId: review.id,
    });
    currentCandidate = officialCandidate({
      title: "Changed source text",
      normalizedText: "Changed source text that cannot be classified.",
    });

    const result = await sync.syncSource("federal-register");

    expect(result.errors).toEqual([expect.objectContaining({ stage: "classify" })]);
    expect(await store.news.listPublished({})).toEqual([
      expect.objectContaining({
        title: officialCandidate().title,
        editorialState: "approved",
        plainLanguageSummary: "Reviewed summary",
      }),
    ]);
    expect(await store.reviewQueue.listGlobal()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceKey: "federal-register:2026-10001",
        editorialState: "review-required",
        reason: "classification-failed",
      }),
    ]));
  });

  test("clears private approval evidence when approved source content changes", async () => {
    let currentCandidate = officialCandidate();
    const { sync, store } = fixtureSync({ collect: async () => [currentCandidate] });
    await sync.syncSource("federal-register");
    const [published] = await store.news.listPublished({});
    const review = await store.reviewQueue.create({ newsItemId: published.id });
    await store.news.approve(published.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-14T13:00:00.000Z",
      summary: "Reviewed summary",
      reviewId: review.id,
      approvalEvidence: { ticket: "private-1" },
    });

    const [approvedPublic] = await store.news.listPublished({});
    expect(approvedPublic).not.toHaveProperty("reviewerUid");
    expect(approvedPublic).not.toHaveProperty("reviewId");
    currentCandidate = officialCandidate({ normalizedText: "Updated official F-1 grace period text." });
    await sync.syncSource("federal-register");

    const updated = await store.news.get(published.id);
    expect(updated).toMatchObject({ editorialState: "published-source-only", plainLanguageSummary: "" });
    expect(updated).not.toHaveProperty("reviewerUid");
    expect(updated).not.toHaveProperty("reviewedAt");
    expect(updated).not.toHaveProperty("reviewId");
    expect(updated).not.toHaveProperty("approvalEvidence");
  });

  test("withholds an off-registry candidate URL from source-only publication", async () => {
    const { sync, store } = fixtureSync({
      candidates: [officialCandidate({ canonicalUrl: "https://attacker.example/student-rule", officialPdfUrl: "" })],
    });

    const result = await sync.syncSource("federal-register");
    const [review] = await store.reviewQueue.listGlobal();

    expect(result).toMatchObject({ created: 1, reviewRequired: 1 });
    expect(await store.news.listPublished({})).toEqual([]);
    expect(review).toMatchObject({ editorialState: "review-required", reason: "unverified-source-url" });
  });

  test("blocks a robots-governed source before fetch when policy denies its path", async () => {
    let fetched = false;
    const { sync, store, leaseEvents } = fixtureSync({
      sourceOverride: { respectRobotsTxt: true },
      robotsPolicy: { async isAllowed() { return false; } },
      fetch: async () => {
        fetched = true;
        throw new Error("fetch must not run");
      },
    });

    const result = await sync.syncSource("federal-register");
    const [run] = await store.newsRuns.listGlobal();

    expect(fetched).toBe(false);
    expect(result).toMatchObject({ status: "failed", errors: [expect.objectContaining({ stage: "robots" })] });
    expect(run).toMatchObject({ status: "failed", success: false });
    expect(leaseEvents.map((event) => event.type)).toEqual(["acquire", "release"]);
  });

  test("automatically fails closed on robots for every discovered edu source", async () => {
    let fetched = false;
    const { sync } = fixtureSync({
      sourceOverride: {
        id: "campus",
        url: "https://international.example.edu/news",
        allowedHosts: ["international.example.edu"],
        sourceType: "university",
      },
      fetch: async () => { fetched = true; return { status: 200, text: "" }; },
    });

    const result = await sync.syncSource("campus");

    expect(fetched).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ stage: "robots" })]);
  });

  test("requires a private snapshot store for non-dry-run publication", async () => {
    const { sync, store } = fixtureSync({ snapshotStore: { async save() { return { path: "public/file" }; } } });

    const result = await sync.syncSource("federal-register");

    expect(result.errors).toEqual([expect.objectContaining({ stage: "snapshot" })]);
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("blocks only the affected candidate when a private snapshot write fails", async () => {
    const { sync, store } = fixtureSync({
      candidates: [
        officialCandidate({ externalId: "bad-snapshot", normalizedText: "F-1 bad snapshot filing fee update." }),
        officialCandidate({ externalId: "good-snapshot" }),
      ],
      snapshotStore: {
        isPrivate: true,
        async save(_sourceId, hash, content) {
          if (content.includes("bad snapshot")) throw new Error("private store unavailable");
          return { path: `news-source-snapshots/federal-register/${hash}.txt` };
        },
      },
    });

    const result = await sync.syncSource("federal-register");

    expect(result.errors).toEqual([expect.objectContaining({ stage: "snapshot" })]);
    expect(await store.news.listPublished({})).toHaveLength(1);
  });

  test("links exact docket transitions without merging records that share only a title", async () => {
    let candidates = [officialCandidate({ externalId: "proposal", sourceDocumentType: "Proposed Rule", effectiveAt: null })];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    await sync.syncSource("federal-register");
    candidates = [officialCandidate({ externalId: "final", sourceDocumentType: "Final Rule" })];
    await sync.syncSource("federal-register");
    const proposalAfterFinal = await store.news.getBySourceKey("federal-register:proposal");
    const finalAfterProposal = await store.news.getBySourceKey("federal-register:final");
    expect(proposalAfterFinal).toMatchObject({
      legalState: "superseded",
      supersededByIds: [finalAfterProposal.id],
      relatedIds: [finalAfterProposal.id],
    });
    expect(finalAfterProposal).toMatchObject({
      supersedesIds: [proposalAfterFinal.id],
      relatedIds: [proposalAfterFinal.id],
    });
    candidates = [officialCandidate({
      externalId: "delay",
      sourceDocumentType: "Notice",
      title: "F-1 rule delayed",
      normalizedText: "The F-1 duration of status rule is delayed.",
    })];
    await sync.syncSource("federal-register");
    expect(await store.news.getBySourceKey("federal-register:final")).toMatchObject({ legalState: "delayed" });
    candidates = [officialCandidate({
      externalId: "withdrawal",
      sourceDocumentType: "Notice",
      title: "F-1 rule withdrawal",
      normalizedText: "The F-1 duration of status rule is withdrawn.",
    })];
    await sync.syncSource("federal-register");
    expect(await store.news.getBySourceKey("federal-register:final")).toMatchObject({ legalState: "withdrawn" });
    candidates = [officialCandidate({ externalId: "unrelated", docketNumber: "OTHER-1", regulationIdNumber: "", sourceDocumentType: "Correction" })];
    await sync.syncSource("federal-register");

    const unrelated = await store.news.getBySourceKey("federal-register:unrelated");
    expect(unrelated.relatedIds).toEqual([]);
  });

  test("links an explicit source relation without weak metadata", async () => {
    let candidates = [officialCandidate({ externalId: "original", docketNumber: "", regulationIdNumber: "" })];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    await sync.syncSource("federal-register");
    candidates = [officialCandidate({
      externalId: "correction",
      relatedExternalId: "original",
      docketNumber: "",
      regulationIdNumber: "",
      sourceDocumentType: "Correction",
    })];
    await sync.syncSource("federal-register");

    const original = await store.news.getBySourceKey("federal-register:original");
    const correction = await store.news.getBySourceKey("federal-register:correction");
    expect(original).toMatchObject({ legalState: "superseded", supersededByIds: [correction.id] });
    expect(correction).toMatchObject({ supersedesIds: [original.id], relatedIds: [original.id] });
  });

  test("renews the persistent lease and aborts safely if ownership is lost", async () => {
    const { sync, store } = fixtureSync({
      fetch: async (_source, { signal } = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (signal?.aborted) throw signal.reason;
        return { status: 200, text: "fixture body", notModified: false };
      },
    });
    store.leases.renew = vi.fn().mockResolvedValue(false);
    const shortSync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async (_source, { signal } = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (signal?.aborted) throw signal.reason;
        return { status: 200, text: "fixture body", notModified: false };
      },
      snapshotStore: { isPrivate: true, async save(_id, hash) { return { path: `news-source-snapshots/federal-register/${hash}.txt` }; } },
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const result = await shortSync.syncSource("federal-register");

    expect(store.leases.renew).toHaveBeenCalled();
    expect(result.errors).toEqual([expect.objectContaining({ stage: "lease" })]);
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("keeps a second worker out after the nominal TTL while the first heartbeat is active", async () => {
    const store = createDemoStore();
    let fetches = 0;
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async () => {
        fetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 55));
        return { status: 200, text: "fixture body", notModified: false };
      },
      snapshotStore: { isPrivate: true, async save(_id, hash) { return { path: `news-source-snapshots/federal-register/${hash}.txt` }; } },
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const first = sync.syncSource("federal-register");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const second = await sync.syncSource("federal-register");
    const completed = await first;

    expect(second).toMatchObject({ status: "skipped", errors: [expect.objectContaining({ stage: "lease" })] });
    expect(completed.status).toBe("success");
    expect(fetches).toBe(1);
  });

  test("does not fetch when another worker holds the source lease", async () => {
    let fetched = false;
    const { sync, store, leaseEvents } = fixtureSync({
      leaseAcquire: false,
      fetch: async () => {
        fetched = true;
        return { status: 200, text: "fixture body", notModified: false };
      },
    });

    const result = await sync.syncSource("federal-register");

    expect(fetched).toBe(false);
    expect(result).toMatchObject({ status: "skipped", errors: [expect.objectContaining({ stage: "lease" })] });
    expect(await store.newsRuns.listGlobal()).toEqual([]);
    expect(leaseEvents.map((event) => event.type)).toEqual(["acquire"]);
  });

  test("defines the required verified federal source coverage", () => {
    expect(defaultNewsSources.map(({ id }) => id)).toEqual([
      "federal-register",
      "uscis",
      "ice-sevp",
      "study-in-the-states",
      "state-visa-news",
      "state-travel-rss",
      "cbp",
      "irs",
      "ssa",
      "labor",
      "white-house",
    ]);
    for (const registered of defaultNewsSources) {
      const url = new URL(registered.url);
      expect(registered.verified).toBe(true);
      expect(url.protocol).toBe("https:");
      expect(registered.allowedHosts).toContain(url.hostname);
    }
  });

  test("refuses a disabled pending registry source", async () => {
    const pending = defaultNewsSources.find((entry) => entry.enabled === false);
    const store = createDemoStore();
    const sync = createNewsSync({
      store,
      fetchSource: vi.fn(),
      snapshotStore: { isPrivate: true, async save() { throw new Error("unused"); } },
      sources: [pending],
    });

    await expect(sync.syncSource(pending.id)).rejects.toThrow(/disabled|pending/i);
  });
});
