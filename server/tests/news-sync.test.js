import { describe, expect, test } from "vitest";

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

  test("dry run reports estimated writes without changing any store", async () => {
    const { sync, store, leaseEvents, snapshotWrites } = fixtureSync();

    const result = await sync.syncSource("federal-register", { dryRun: true });

    expect(result).toMatchObject({ candidates: 1, errors: [] });
    expect(result.estimatedWrites).toBeGreaterThan(0);
    expect(await store.news.listPublished({})).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toEqual([]);
    expect(leaseEvents).toEqual([]);
    expect(snapshotWrites).toEqual([]);
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
});
