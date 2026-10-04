import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import { classifyCandidate } from "../src/news/classifier.js";
import { defaultNewsSources } from "../src/news/default-sources.js";
import { createSnapshotStore } from "../src/news/snapshots.js";
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

function atomicSnapshotStore({ save, discard = async () => {}, readCommitted } = {}) {
  const committed = new Map();
  return {
    isPrivate: true,
    supportsFencing: true,
    commitProtocol: "atomic-fenced-snapshot-v1",
    async discard(snapshot) {
      committed.delete(`${snapshot.path}\0${snapshot.commitId}`);
      return discard(snapshot);
    },
    async save(sourceId, hash, content, options) {
      const result = await save(sourceId, hash, content, options);
      const snapshot = result && {
        committed: true,
        commitId: `test-commit-${hash}`,
        ...result,
      };
      if (snapshot) committed.set(`${snapshot.path}\0${snapshot.commitId}`, content.replace(/\s+/gu, " ").trim());
      return snapshot;
    },
    async readCommitted(snapshot) {
      if (readCommitted) return readCommitted(snapshot);
      const content = committed.get(`${snapshot.path}\0${snapshot.commitId}`);
      if (content === undefined) throw new Error("A matching committed snapshot marker is required.");
      return content;
    },
  };
}

function createLeaseStore(store, { acquire = true } = {}) {
  const events = [];
  const leases = store.leases;
  const original = {
    acquire: leases.acquire.bind(leases),
    release: leases.release.bind(leases),
    renew: leases.renew.bind(leases),
    owns: leases.owns.bind(leases),
  };
  Object.assign(leases, {
    async acquire(key, owner, expiresAt) {
      events.push({ type: "acquire", key, owner, expiresAt });
      return acquire ? original.acquire(key, owner, expiresAt) : false;
    },
    async release(key, owner) {
      events.push({ type: "release", key, owner });
      return original.release(key, owner);
    },
    async renew(key, owner, expiresAt) {
      events.push({ type: "renew", key, owner, expiresAt });
      return original.renew(key, owner, expiresAt);
    },
    async owns(key, owner) {
      return original.owns(key, owner);
    },
  });
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
  const snapshots = snapshotStore || atomicSnapshotStore({
    async save(sourceId, contentHash, content, { fence } = {}) {
      await fence.assertOwned();
      snapshotWrites.push({ sourceId, contentHash, content });
      return { path: `news-source-snapshots/${sourceId}/${contentHash}.txt` };
    },
  });
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
  return { sync, store, leaseEvents, snapshotWrites, snapshotStore: snapshots, fetched };
}

async function createValidatedReview(store, newsItemId, summary = "Reviewed summary") {
  const item = await store.news.get(newsItemId);
  const evidence = {
    contentHash: item.contentHash,
    revisionId: item.currentRevisionId,
    sourceId: item.sourceId ?? null,
    snapshotPath: item.snapshotPath ?? null,
    sourceVerified: true,
    snapshotCommitId: item.snapshotCommitId ?? null,
    validatedAt: "2026-09-14T13:00:00.000Z",
  };
  return store.reviewQueue.create({
    newsItemId,
    contentHash: item.contentHash,
    revisionId: item.currentRevisionId,
    editorialState: "review-required",
    status: "validated",
    reason: "editorial-review",
    draft: { plainLanguageSummary: summary, actions: [] },
    validationEvidence: evidence,
  });
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
    expect(item).not.toHaveProperty("snapshotCommitId");
    expect(item).not.toHaveProperty("classifierConfidence");
    expect(item).not.toHaveProperty("classifierMatchedTerms");
    expect((await store.news.listInternal())[0]).toMatchObject({
      snapshotPath: expect.stringMatching(/^news-source-snapshots\//u),
      snapshotCommitId: expect.stringMatching(/^test-commit-/u),
    });
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

  test.each(["final", "informational"])(
    "public sync keeps future-dated source legal state %s scheduled",
    async (sourceLegalState) => {
      const { sync, store } = fixtureSync({ candidates: [officialCandidate({ sourceLegalState })] });

      await sync.syncSource("federal-register");

      await expect(store.news.listPublished({})).resolves.toEqual([
        expect.objectContaining({ legalState: "scheduled", effectiveAt: "2026-10-01" }),
      ]);
    },
  );

  test("withholds a negated OPT non-change notice from substantive source-only publication", async () => {
    const { sync, store } = fixtureSync({ candidates: [officialCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 program update",
      effectiveAt: null,
      excerpt: "There are no changes to OPT eligibility for F-1 students.",
      normalizedText: "There are no changes to OPT eligibility for F-1 students.",
    })] });

    const result = await sync.syncSource("federal-register");

    expect(result).toMatchObject({ created: 1, reviewRequired: 1 });
    await expect(store.news.listPublished({})).resolves.toEqual([]);
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

    expect(unchanged).toMatchObject({
      created: 0,
      changed: 0,
      unchanged: 1,
      reviewRequired: 0,
      estimatedWrites: 4,
    });
    expect(changed).toMatchObject({
      created: 0,
      changed: 1,
      unchanged: 0,
      reviewRequired: 1,
      estimatedWrites: 5,
    });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(snapshotWrites).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toHaveLength(runCount);
    expect(await store.reviewQueue.listGlobal()).toHaveLength(reviewCount);
  });

  test("dry run recounts a missing deterministic review for unchanged content without mutations", async () => {
    const summarizer = { summarize: vi.fn() };
    const { sync, store, snapshotWrites } = fixtureSync({ summarizer });
    await sync.syncSource("federal-register");
    const [review] = await store.reviewQueue.listGlobal();
    await store.reviewQueue.remove(review.id);
    summarizer.summarize.mockClear();
    snapshotWrites.length = 0;
    const newsBefore = await store.news.getBySourceKey("federal-register:2026-10001");
    const sourceBefore = await store.newsSources.get("federal-register");
    const runCount = (await store.newsRuns.listGlobal()).length;

    const result = await sync.syncSource("federal-register", { dryRun: true });

    // Estimated writes exclude lease lifecycle and include snapshot, news, review, source state, and run.
    expect(result).toMatchObject({ unchanged: 1, reviewRequired: 1, estimatedWrites: 5, errors: [] });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(snapshotWrites).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.news.getBySourceKey("federal-register:2026-10001")).toEqual(newsBefore);
    expect(await store.newsSources.get("federal-register")).toEqual(sourceBefore);
    expect(await store.newsRuns.listGlobal()).toHaveLength(runCount);
  });

  test("dry run applies generated-summary review policy without invoking the summarizer", async () => {
    const travelCandidate = officialCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 student travel guidance",
      excerpt: "F-1 students may travel through a port of entry.",
      normalizedText: "F-1 students may travel through a port of entry.",
      effectiveAt: null,
    });
    const summarizer = {
      summarize: vi.fn().mockResolvedValue({
        ok: true,
        reviewRequired: true,
        publishable: false,
        draft: { plainLanguageSummary: "Source-bound draft." },
      }),
    };
    const { sync, store, snapshotWrites } = fixtureSync({ candidates: [travelCandidate], summarizer });

    const prospective = await sync.syncSource("federal-register", { dryRun: true });

    expect(prospective).toMatchObject({
      created: 1,
      changed: 0,
      unchanged: 0,
      reviewRequired: 1,
      estimatedWrites: 5,
      errors: [],
    });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(snapshotWrites).toEqual([]);
    expect(await store.news.listInternal()).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);

    const live = await sync.syncSource("federal-register");
    const [review] = await store.reviewQueue.listGlobal();
    expect(live).toMatchObject({ created: 1, reviewRequired: 1, estimatedWrites: 5, errors: [] });
    expect(review.reason).toBe("generated-summary");
    expect(summarizer.summarize).toHaveBeenCalledTimes(1);
    await store.reviewQueue.remove(review.id);
    summarizer.summarize.mockClear();

    const recovery = await sync.syncSource("federal-register", { dryRun: true });

    expect(recovery).toMatchObject({ unchanged: 1, reviewRequired: 1, estimatedWrites: 5, errors: [] });
    expect(summarizer.summarize).not.toHaveBeenCalled();
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
  });

  test("reuses one committed snapshot across repeated unchanged source runs", async () => {
    const { sync, store, leaseEvents, snapshotWrites, snapshotStore } = fixtureSync();

    const first = await sync.syncSource("federal-register");
    const second = await sync.syncSource("federal-register");
    const third = await sync.syncSource("federal-register");
    const [item] = await store.news.listPublished({});
    const internal = await store.news.getBySourceKey("federal-register:2026-10001");

    expect(first).toMatchObject({ created: 1, changed: 0, unchanged: 0, reviewRequired: 1 });
    expect(second).toMatchObject({ created: 0, changed: 0, unchanged: 1, reviewRequired: 0 });
    expect(third).toMatchObject({ created: 0, changed: 0, unchanged: 1, reviewRequired: 0 });
    expect(await store.news.listPublished({})).toHaveLength(1);
    expect(await store.news.revisions(item.id)).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
    expect(snapshotWrites).toHaveLength(1);
    await expect(snapshotStore.readCommitted({
      path: internal.snapshotPath,
      commitId: internal.snapshotCommitId,
    })).resolves.toBe(officialCandidate().normalizedText);
    expect(leaseEvents.map(({ type }) => type)).toEqual([
      "acquire", "release", "acquire", "release", "acquire", "release",
    ]);
  });

  test("recovers a missing deterministic review after a post-upsert review failure", async () => {
    const { sync, store, leaseEvents, snapshotWrites, snapshotStore } = fixtureSync();
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
    const firstItem = await store.news.getBySourceKey("federal-register:2026-10001");
    const second = await sync.syncSource("federal-register");
    const third = await sync.syncSource("federal-register");
    const recoveredItem = await store.news.getBySourceKey("federal-register:2026-10001");

    expect(first.errors).toEqual([expect.objectContaining({ stage: "review" })]);
    expect(second).toMatchObject({ unchanged: 1, reviewRequired: 1, errors: [] });
    expect(third).toMatchObject({ unchanged: 1, reviewRequired: 0, errors: [] });
    expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
    expect(recoveredItem.snapshotCommitId).toBe(firstItem.snapshotCommitId);
    expect(snapshotWrites).toHaveLength(1);
    await expect(snapshotStore.readCommitted({
      path: recoveredItem.snapshotPath,
      commitId: recoveredItem.snapshotCommitId,
    })).resolves.toBe(officialCandidate().normalizedText);
    expect(leaseEvents.map(({ type }) => type)).toEqual([
      "acquire", "release", "acquire", "release", "acquire", "release",
    ]);
  });

  test("reconciles an old news marker to an already committed unchanged canonical snapshot", async () => {
    const store = createDemoStore();
    let canonical = null;
    let promotions = 0;
    const snapshots = atomicSnapshotStore({
      async save(sourceId, hash, content, { fence }) {
        await fence.assertOwned();
        if (canonical?.content === content) {
          return { path: canonical.path, commitId: canonical.commitId, reused: true };
        }
        promotions += 1;
        canonical = {
          path: `news-source-snapshots/${sourceId}/${hash}.txt`,
          commitId: `canonical-${promotions}`,
          content,
        };
        return { path: canonical.path, commitId: canonical.commitId };
      },
      async readCommitted({ path, commitId }) {
        if (path !== canonical?.path || commitId !== canonical?.commitId) {
          throw new Error("A matching committed snapshot marker is required.");
        }
        return canonical.content;
      },
    });
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: snapshots,
      sources: [source],
      clock: fixedClock,
    });

    await sync.syncSource("federal-register");
    const stale = await store.news.getBySourceKey("federal-register:2026-10001");
    canonical.commitId = "canonical-from-old-unbound-replay";

    const replay = await sync.syncSource("federal-register");
    const reconciled = await store.news.getBySourceKey("federal-register:2026-10001");

    expect(replay).toMatchObject({ unchanged: 1, errors: [] });
    expect(stale.snapshotCommitId).not.toBe(canonical.commitId);
    expect(reconciled.snapshotCommitId).toBe(canonical.commitId);
    expect(promotions).toBe(1);
    await expect(snapshots.readCommitted({
      path: reconciled.snapshotPath,
      commitId: reconciled.snapshotCommitId,
    })).resolves.toBe(officialCandidate().normalizedText);
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

  test("clears stale validators after a fresh response omits them and retains only across 304", async () => {
    const requests = [];
    const responses = [
      { status: 200, text: "fixture body", etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT", notModified: false },
      { status: 200, text: "fixture body", etag: null, lastModified: null, notModified: false },
      { status: 304, text: "", etag: null, lastModified: null, notModified: true },
    ];
    const { sync, store } = fixtureSync({
      collect: async () => [officialCandidate()],
      fetch: async (input) => {
        requests.push(input);
        return responses.shift();
      },
    });

    const first = await sync.syncSource("federal-register");
    const initial = await store.newsSources.get("federal-register");
    await sync.syncSource("federal-register");
    const cleared = await store.newsSources.get("federal-register");
    await sync.syncSource("federal-register");

    expect(first).toMatchObject({ status: "success", errors: [] });
    expect(initial).toMatchObject({ etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT" });
    expect(requests[1]).toMatchObject({ etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT" });
    expect(cleared).toMatchObject({ etag: null, lastModified: null });
    expect(requests[2]).toMatchObject({ etag: null, lastModified: null });
    expect(await store.newsSources.get("federal-register")).toMatchObject({ etag: null, lastModified: null });
  });

  test("clears stale validators from a fresh 200 even when downstream classification fails", async () => {
    const requests = [];
    const responses = [
      { status: 200, text: "fixture body", etag: '"v1"', lastModified: "Mon, 14 Sep 2026 10:00:00 GMT", notModified: false },
      { status: 200, text: "changed body", etag: null, lastModified: null, notModified: false },
      { status: 304, text: "", etag: null, lastModified: null, notModified: true },
    ];
    let classificationFails = false;
    const { sync, store } = fixtureSync({
      collect: async () => [officialCandidate()],
      classifier: (candidate, options) => {
        if (classificationFails) throw new Error("classifier unavailable");
        return classifyCandidate(candidate, options);
      },
      fetch: async (input) => {
        requests.push(input);
        return responses.shift();
      },
    });
    await sync.syncSource("federal-register");
    classificationFails = true;

    const failed = await sync.syncSource("federal-register");
    const stateAfterFailure = await store.newsSources.get("federal-register");
    classificationFails = false;
    await sync.syncSource("federal-register");

    expect(failed.errors).toEqual([expect.objectContaining({ stage: "classify" })]);
    expect(stateAfterFailure).toMatchObject({ etag: null, lastModified: null, lastRunStatus: "failed" });
    expect(requests[2]).toMatchObject({ etag: null, lastModified: null });
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
    const snapshots = atomicSnapshotStore({
      async save(_id, hash, _content, { fence }) {
        await fence.assertOwned();
        return { path: `news-source-snapshots/federal-register/${hash}.txt` };
      },
    });
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
    const review = await createValidatedReview(store, published.id);
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
    const review = await createValidatedReview(store, published.id);
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

  test("canonicalizes root-dot and IDN host spellings before edu robots detection", async () => {
    let fetched = false;
    const { sync } = fixtureSync({
      sourceOverride: {
        id: "idn-campus",
        url: "https://büro.example.edu./news",
        allowedHosts: ["BÜRO.EXAMPLE.EDU."],
        sourceType: undefined,
      },
      fetch: async () => { fetched = true; return { status: 200, text: "" }; },
    });

    const result = await sync.syncSource("idn-campus");

    expect(fetched).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ stage: "robots" })]);
  });

  test("requires a private snapshot store for non-dry-run publication", async () => {
    const { sync, store } = fixtureSync({ snapshotStore: { async save() { return { path: "public/file" }; } } });

    const result = await sync.syncSource("federal-register");

    expect(result.errors).toEqual([expect.objectContaining({ stage: "snapshot" })]);
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("rejects a private snapshot store that does not support lease fencing", async () => {
    let fetched = false;
    const { sync, store } = fixtureSync({
      snapshotStore: { isPrivate: true, async save() { throw new Error("must not save"); } },
      fetch: async () => { fetched = true; return { status: 200, text: "fixture body", notModified: false }; },
    });

    const result = await sync.syncSource("federal-register");

    expect(fetched).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ stage: "snapshot", message: expect.stringMatching(/fenc/i) })]);
    expect(await store.news.listInternal()).toEqual([]);
  });

  test("rejects a nominally fenced snapshot store without the atomic commit protocol", async () => {
    let fetched = false;
    const { sync, store } = fixtureSync({
      snapshotStore: {
        isPrivate: true,
        supportsFencing: true,
        async save() { throw new Error("must not save"); },
      },
      fetch: async () => { fetched = true; return { status: 200, text: "fixture body", notModified: false }; },
    });

    const result = await sync.syncSource("federal-register");

    expect(fetched).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ stage: "snapshot", message: expect.stringMatching(/atomic|commit protocol/i) })]);
    expect(await store.news.listInternal()).toEqual([]);
  });

  test("blocks only the affected candidate when a private snapshot write fails", async () => {
    const { sync, store } = fixtureSync({
      candidates: [
        officialCandidate({ externalId: "bad-snapshot", normalizedText: "F-1 bad snapshot filing fee update." }),
        officialCandidate({ externalId: "good-snapshot" }),
      ],
      snapshotStore: atomicSnapshotStore({
        async save(_sourceId, hash, content, { fence }) {
          await fence.assertOwned();
          if (content.includes("bad snapshot")) throw new Error("private store unavailable");
          return { path: `news-source-snapshots/federal-register/${hash}.txt` };
        },
      }),
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

  test("does not link an explicit external ID across different sources", async () => {
    const store = createDemoStore();
    const current = { sourceId: "source-a", candidates: [officialCandidate({ externalId: "shared", docketNumber: "", regulationIdNumber: "" })] };
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect(sourceInput) { return current.sourceId === sourceInput.id ? current.candidates : []; } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: atomicSnapshotStore({
        async save(sourceId, hash, _content, { fence }) {
          await fence.assertOwned();
          return { path: `news-source-snapshots/${sourceId}/${hash}.txt` };
        },
      }),
      sources: [
        { ...source, id: "source-a" },
        { ...source, id: "source-b" },
      ],
      clock: fixedClock,
    });
    await sync.syncSource("source-a");
    current.sourceId = "source-b";
    current.candidates = [officialCandidate({
      externalId: "correction",
      relatedExternalId: "shared",
      docketNumber: "",
      regulationIdNumber: "",
      sourceDocumentType: "Correction",
    })];
    await sync.syncSource("source-b");

    const original = await store.news.getBySourceKey("source-a:shared");
    const correction = await store.news.getBySourceKey("source-b:correction");
    expect(original.relatedIds).toEqual([]);
    expect(correction.relatedIds).toEqual([]);
  });

  test("does not link matching docket or RIN identifiers across different sources", async () => {
    const store = createDemoStore();
    const candidatesBySource = new Map([
      ["source-a", [officialCandidate({ externalId: "a" })]],
      ["source-b", [officialCandidate({ externalId: "b", sourceDocumentType: "Correction" })]],
    ]);
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect(sourceInput) { return candidatesBySource.get(sourceInput.id); } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: atomicSnapshotStore({
        async save(sourceId, hash, _content, { fence }) {
          await fence.assertOwned();
          return { path: `news-source-snapshots/${sourceId}/${hash}.txt` };
        },
      }),
      sources: [{ ...source, id: "source-a" }, { ...source, id: "source-b" }],
      clock: fixedClock,
    });

    await sync.syncSource("source-a");
    await sync.syncSource("source-b");

    expect((await store.news.getBySourceKey("source-a:a")).relatedIds).toEqual([]);
    expect((await store.news.getBySourceKey("source-b:b")).relatedIds).toEqual([]);
  });

  test("removes stale old-component edges when an existing item changes its strong identity", async () => {
    let candidates = [];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    const ingest = async (candidate) => {
      candidates = [officialCandidate({ regulationIdNumber: "", relatedExternalId: "", ...candidate })];
      const result = await sync.syncSource("federal-register");
      expect(result.errors).toEqual([]);
    };

    await ingest({ externalId: "old-proposal", docketNumber: "D-1", sourceDocumentType: "Proposed Rule", effectiveAt: null });
    await ingest({ externalId: "mover", docketNumber: "D-1", sourceDocumentType: "Final Rule" });
    await ingest({ externalId: "old-correction", docketNumber: "D-1", sourceDocumentType: "Correction" });
    await ingest({ externalId: "new-proposal", docketNumber: "D-2", sourceDocumentType: "Proposed Rule", effectiveAt: null });
    await ingest({ externalId: "new-correction", docketNumber: "D-2", sourceDocumentType: "Correction" });

    const approvedOldNeighbor = await store.news.getBySourceKey("federal-register:old-proposal");
    const review = await createValidatedReview(store, approvedOldNeighbor.id);
    await store.news.approve(approvedOldNeighbor.id, {
      reviewerUid: "private-editor",
      reviewedAt: "2026-09-14T13:00:00.000Z",
      reviewId: review.id,
      summary: "Approved summary that must be redacted after relation changes.",
      approvalEvidence: { privateTicket: "relation-review" },
    });

    await ingest({
      externalId: "mover",
      docketNumber: "D-2",
      sourceDocumentType: "Final Rule",
      normalizedText: "The official D-2 rule reduces the F-1 grace period to 30 days.",
    });

    const items = await store.news.listInternal();
    const externalById = new Map(items.map((item) => [item.id, item.externalId]));
    const relations = Object.fromEntries(items.map((item) => [
      item.externalId,
      item.relatedIds.map((id) => externalById.get(id)).sort(),
    ]));
    expect(relations["old-proposal"]).toEqual(["old-correction"]);
    expect(relations["old-correction"]).toEqual(["old-proposal"]);
    expect(relations.mover).toEqual(["new-correction", "new-proposal"]);
    expect(relations["new-proposal"]).toEqual(["mover", "new-correction"]);
    expect(relations["new-correction"]).toEqual(["mover", "new-proposal"]);

    const redactedOldNeighbor = await store.news.get(approvedOldNeighbor.id);
    expect(redactedOldNeighbor).toMatchObject({
      editorialState: "published-source-only",
      plainLanguageSummary: "",
      actions: [],
      summaryProvenance: null,
    });
    expect(redactedOldNeighbor).not.toHaveProperty("reviewerUid");
    expect(redactedOldNeighbor).not.toHaveProperty("approvalEvidence");
    expect(await store.news.revisions(approvedOldNeighbor.id)).toContainEqual(expect.objectContaining({
      editorialState: "approved",
      reviewerUid: "private-editor",
      approvalEvidence: expect.objectContaining({ contentHash: approvedOldNeighbor.contentHash }),
    }));

    const moved = await store.news.getBySourceKey("federal-register:mover");
    expect(await store.news.revisions(moved.id)).toContainEqual(expect.objectContaining({
      docketNumber: "D-1",
      relatedIds: expect.arrayContaining([approvedOldNeighbor.id]),
    }));
  });

  test("recomputes a complete relation group identically for every insertion order", async () => {
    const records = {
      proposal: officialCandidate({
        externalId: "proposal",
        sourceDocumentType: "Proposed Rule",
        effectiveAt: null,
        publishedAt: "2026-09-01",
      }),
      final: officialCandidate({
        externalId: "final",
        sourceDocumentType: "Notice",
        sourceLegalState: "final",
        effectiveAt: null,
        publishedAt: "2026-09-02",
      }),
      correction: officialCandidate({
        externalId: "correction",
        sourceDocumentType: "Correction",
        effectiveAt: null,
        publishedAt: "2026-09-03",
      }),
      delay: officialCandidate({
        externalId: "delay",
        sourceDocumentType: "Notice",
        sourceLegalState: "delayed",
        effectiveAt: null,
        publishedAt: "2026-09-04",
      }),
      withdrawal: officialCandidate({
        externalId: "withdrawal",
        sourceDocumentType: "Notice",
        sourceLegalState: "withdrawn",
        effectiveAt: null,
        publishedAt: "2026-09-05",
      }),
    };
    const ingest = async (order) => {
      let candidates = [];
      const { sync, store } = fixtureSync({ collect: async () => candidates });
      for (const key of order) {
        candidates = [records[key]];
        await sync.syncSource("federal-register");
      }
      const items = await store.news.listInternal();
      const externalById = new Map(items.map((item) => [item.id, item.externalId]));
      return Object.fromEntries(items.map((item) => [item.externalId, {
        legalState: item.legalState,
        related: item.relatedIds.map((id) => externalById.get(id)),
        supersedes: item.supersedesIds.map((id) => externalById.get(id)),
        supersededBy: item.supersededByIds.map((id) => externalById.get(id)),
      }]).sort(([left], [right]) => left.localeCompare(right)));
    };

    const forward = await ingest(["proposal", "final", "correction", "delay", "withdrawal"]);
    const reverse = await ingest(["withdrawal", "delay", "correction", "final", "proposal"]);
    const mixed = await ingest(["correction", "proposal", "withdrawal", "final", "delay"]);

    expect(reverse).toEqual(forward);
    expect(mixed).toEqual(forward);
    expect(forward.withdrawal.supersedes).toEqual(["proposal", "final", "correction", "delay"]);
    expect(forward.final).toMatchObject({ legalState: "withdrawn", supersededBy: ["correction", "delay", "withdrawal"] });
  });

  test("orders proposal and final transitions deterministically when the final arrives first", async () => {
    let candidates = [officialCandidate({ externalId: "final-first", sourceDocumentType: "Final Rule" })];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    await sync.syncSource("federal-register");
    candidates = [officialCandidate({ externalId: "proposal-late", sourceDocumentType: "Proposed Rule", effectiveAt: null })];
    await sync.syncSource("federal-register");

    const final = await store.news.getBySourceKey("federal-register:final-first");
    const proposal = await store.news.getBySourceKey("federal-register:proposal-late");
    expect(final).toMatchObject({ supersedesIds: [proposal.id], relatedIds: [proposal.id] });
    expect(proposal).toMatchObject({ legalState: "superseded", supersededByIds: [final.id], relatedIds: [final.id] });
  });

  test.each([
    ["correction", { sourceDocumentType: "Correction" }, "superseded"],
    ["delay", {
      sourceDocumentType: "Notice",
      title: "F-1 rule delayed",
      normalizedText: "The F-1 duration of status rule is delayed.",
    }, "delayed"],
    ["withdrawal", {
      sourceDocumentType: "Notice",
      title: "F-1 rule withdrawn",
      normalizedText: "The F-1 duration of status rule is withdrawn.",
    }, "withdrawn"],
  ])("orders a %s transition deterministically when it arrives before the final", async (externalId, overrides, expectedState) => {
    let candidates = [officialCandidate({ externalId, ...overrides })];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    await sync.syncSource("federal-register");
    candidates = [officialCandidate({ externalId: `final-after-${externalId}`, sourceDocumentType: "Final Rule" })];
    await sync.syncSource("federal-register");

    const successor = await store.news.getBySourceKey(`federal-register:${externalId}`);
    const final = await store.news.getBySourceKey(`federal-register:final-after-${externalId}`);
    expect(successor.supersedesIds).toContain(final.id);
    expect(final).toMatchObject({ legalState: expectedState, supersededByIds: [successor.id] });
  });

  test("relation-driven changes create a revision and clear stale summary and private approval evidence", async () => {
    let candidates = [officialCandidate({ externalId: "proposal", sourceDocumentType: "Proposed Rule", effectiveAt: null })];
    const { sync, store } = fixtureSync({ collect: async () => candidates });
    await sync.syncSource("federal-register");
    const proposal = await store.news.getBySourceKey("federal-register:proposal");
    await store.news.updateInternal(proposal.id, {
      actions: [{ label: "Stale action", sourceUrl: proposal.canonicalUrl }],
      summaryProvenance: { model: "private-model" },
    });
    const review = await createValidatedReview(store, proposal.id);
    await store.news.approve(proposal.id, {
      reviewerUid: "private-editor",
      reviewedAt: "2026-09-14T13:00:00.000Z",
      reviewId: review.id,
      summary: "Stale approved summary",
      approvalEvidence: { privateTicket: "secret" },
    });
    candidates = [officialCandidate({ externalId: "final", sourceDocumentType: "Final Rule" })];

    await sync.syncSource("federal-register");

    const updated = await store.news.get(proposal.id);
    expect(updated).toMatchObject({
      legalState: "superseded",
      editorialState: "published-source-only",
      plainLanguageSummary: "",
      actions: [],
      summaryProvenance: null,
    });
    expect(updated).not.toHaveProperty("reviewerUid");
    expect(updated).not.toHaveProperty("reviewedAt");
    expect(updated).not.toHaveProperty("reviewId");
    expect(updated).not.toHaveProperty("approvalEvidence");
    expect(await store.news.revisions(proposal.id)).toEqual([
      expect.objectContaining({
        editorialState: "approved",
        plainLanguageSummary: "Reviewed summary",
        reviewerUid: "private-editor",
      }),
    ]);
    const [publicProposal] = (await store.news.listPublished({})).filter((item) => item.id === proposal.id);
    expect(publicProposal).not.toHaveProperty("reviewerUid");
    expect(publicProposal).not.toHaveProperty("approvalEvidence");
    expect(publicProposal).not.toHaveProperty("baseLegalState");
  });

  test("renews the persistent lease and aborts safely if ownership is lost", async () => {
    const { sync, store } = fixtureSync({
      fetch: async (_source, { signal } = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (signal?.aborted) throw signal.reason;
        return { status: 200, text: "fixture body", notModified: false };
      },
    });
    store.leases.renew = vi.fn(async (key, owner) => {
      await store.leases.release(key, owner);
      return false;
    });
    const shortSync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async (_source, { signal } = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (signal?.aborted) throw signal.reason;
        return { status: 200, text: "fixture body", notModified: false };
      },
      snapshotStore: atomicSnapshotStore({
        async save(_id, hash, _content, { fence }) {
          await fence.assertOwned();
          return { path: `news-source-snapshots/federal-register/${hash}.txt` };
        },
      }),
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const result = await shortSync.syncSource("federal-register");

    expect(store.leases.renew).toHaveBeenCalled();
    expect(result.errors).toEqual([expect.objectContaining({ stage: "lease" })]);
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("fences a slow news upsert after lease loss and records no success mutations", async () => {
    const store = createDemoStore();
    const originalUpsert = store.news.upsert.bind(store.news);
    store.news.upsert = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return originalUpsert(...args);
    };
    store.leases.renew = vi.fn(async (key, owner) => {
      await store.leases.release(key, owner);
      return false;
    });
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: atomicSnapshotStore({
        async save(_id, hash, _content, { fence }) {
          await fence.assertOwned();
          return { path: `news-source-snapshots/federal-register/${hash}.txt` };
        },
      }),
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const result = await sync.syncSource("federal-register");

    expect(result.status).not.toBe("success");
    expect(result.errors).toEqual([expect.objectContaining({ stage: "lease" })]);
    expect(await store.news.listInternal()).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.newsSources.listGlobal()).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toEqual([]);
  });

  test("lets a compliant slow snapshot store fence its commit after lease loss", async () => {
    const store = createDemoStore();
    const snapshotWrites = [];
    store.leases.renew = vi.fn(async (key, owner) => {
      await store.leases.release(key, owner);
      return false;
    });
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: atomicSnapshotStore({
        async save(sourceId, hash, _content, { fence }) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          await fence.assertOwned();
          snapshotWrites.push(hash);
          return { path: `news-source-snapshots/${sourceId}/${hash}.txt` };
        },
      }),
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const result = await sync.syncSource("federal-register");

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual([expect.objectContaining({ stage: "lease" })]);
    expect(snapshotWrites).toEqual([]);
    expect(await store.news.listInternal()).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.newsSources.listGlobal()).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toEqual([]);
    await expect(store.leases.acquire("news-source:federal-register", "replacement", new Date(Date.now() + 1_000).toISOString()))
      .resolves.toBe(true);
  });

  test("passes cancellation into the production staged snapshot save and leaves no canonical object after lease loss", async () => {
    const store = createDemoStore();
    const files = new Map();
    const promotions = [];
    let saveSignal = null;
    const bucket = {
      file(name) {
        if (!files.has(name)) {
          files.set(name, {
            name,
            content: null,
            metadata: {},
            async save(content, options) {
              saveSignal = options.signal;
              await new Promise((resolve) => setTimeout(resolve, 30));
              this.content = content;
              this.metadata = options.metadata;
            },
            async delete() {
              files.delete(name);
            },
            async getMetadata() { return [this.metadata]; },
            async download() { return [Buffer.from(this.content || "")]; },
          });
        }
        return files.get(name);
      },
      async getFiles() { return [[...files.values()]]; },
    };
    bucket.snapshotCommitAdapter = {
      capability: "atomic-fenced-snapshot-v1",
      async promote(input) {
        await input.fence.assertOwned();
        input.signal?.throwIfAborted();
        promotions.push(input);
        const canonical = bucket.file(input.canonicalPath);
        canonical.content = bucket.file(input.pendingPath).content;
        canonical.metadata = input.metadata;
        return { commitId: input.commitId };
      },
      async rollback({ canonicalPath, commitId }) {
        const canonical = files.get(canonicalPath);
        if (canonical?.metadata?.metadata?.commitId === commitId) files.delete(canonicalPath);
      },
    };
    store.leases.renew = vi.fn(async (key, owner) => {
      await store.leases.release(key, owner);
      return false;
    });
    const sync = createNewsSync({
      store,
      adapters: { fixture: { async collect() { return [officialCandidate()]; } } },
      fetchSource: async () => ({ status: 200, text: "fixture body", notModified: false }),
      snapshotStore: createSnapshotStore({ bucket, clock: fixedClock }),
      sources: [source],
      leaseDurationMs: 20,
      leaseHeartbeatMs: 5,
    });

    const result = await sync.syncSource("federal-register");

    expect(saveSignal).toBeInstanceOf(AbortSignal);
    expect(saveSignal.aborted).toBe(true);
    expect(result).toMatchObject({ status: "failed", errors: [expect.objectContaining({ stage: "lease" })] });
    expect(promotions).toEqual([]);
    expect([...files.values()].filter((file) => file.name.startsWith("news-source-snapshots/")
      && (file.content || file.metadata?.metadata?.snapshotState === "committed"))).toEqual([]);
    expect(await store.news.listInternal()).toEqual([]);
    expect(await store.reviewQueue.listGlobal()).toEqual([]);
    expect(await store.newsSources.listGlobal()).toEqual([]);
    expect(await store.newsRuns.listGlobal()).toEqual([]);
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
      snapshotStore: atomicSnapshotStore({
        async save(_id, hash, _content, { fence }) {
          await fence.assertOwned();
          return { path: `news-source-snapshots/federal-register/${hash}.txt` };
        },
      }),
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
      snapshotStore: { isPrivate: true, supportsFencing: true, async save() { throw new Error("unused"); } },
      sources: [pending],
    });

    await expect(sync.syncSource(pending.id)).rejects.toThrow(/disabled|pending/i);
  });

  test("refuses disabled, unverified, and verification-pending stored sources even in dry-run", async () => {
    for (const state of [
      { enabled: false, verified: true, verificationState: "verified" },
      { enabled: true, verified: false, verificationState: "verified" },
      { enabled: true, verified: true, verificationState: "verification-pending" },
    ]) {
      const store = createDemoStore();
      await store.newsSources.upsert("stored-source", {
        id: "stored-source",
        publisher: "Stored source",
        adapter: "feed",
        url: "https://example.edu/feed.xml",
        allowedHosts: ["example.edu"],
        ...state,
      });
      const fetchSource = vi.fn();
      const sync = createNewsSync({
        store,
        adapters: { feed: { collect: vi.fn() } },
        fetchSource,
        sources: [],
      });

      await expect(sync.syncSource("stored-source", { dryRun: true })).rejects.toThrow(/disabled|verified|pending/i);
      expect(fetchSource).not.toHaveBeenCalled();
    }
  });
});
