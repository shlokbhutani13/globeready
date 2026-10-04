import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => vi.useRealTimers());

import { createDemoStore } from "../src/store.js";

describe("demo news store", () => {
  test("deduplicates unchanged news and versions changed news", async () => {
    const store = createDemoStore();
    const first = await store.news.upsert("agency:item-1", {
      title: "Rule",
      contentHash: "one",
      editorialState: "published-source-only",
    });
    const same = await store.news.upsert("agency:item-1", {
      title: "Rule",
      contentHash: "one",
      editorialState: "published-source-only",
    });
    const changed = await store.news.upsert("agency:item-1", {
      title: "Rule corrected",
      contentHash: "two",
      editorialState: "review-required",
    });

    expect(first.created).toBe(true);
    expect(same).toMatchObject({ created: false, changed: false });
    expect(changed).toMatchObject({ created: false, changed: true });
    expect(changed.item.id).toBe(first.item.id);
    expect(await store.news.revisions(first.item.id)).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        newsItemId: first.item.id,
        title: "Rule",
        contentHash: "one",
      }),
    ]);
  });

  test("returns only public-safe published news in urgency and publication order", async () => {
    const store = createDemoStore();
    await store.news.upsert("agency:low", {
      title: "Older notice",
      contentHash: "low",
      editorialState: "published-source-only",
      urgency: "low",
      publishedAt: "2026-07-10",
      normalizedText: "private source",
    });
    await store.news.upsert("agency:urgent", {
      title: "Urgent notice",
      contentHash: "urgent",
      editorialState: "published-source-only",
      urgency: "urgent",
      publishedAt: "2026-07-01",
      classifierExplanation: "private reasoning",
    });
    await store.news.upsert("agency:draft", {
      title: "Draft notice",
      contentHash: "draft",
      editorialState: "review-required",
      urgency: "critical",
      publishedAt: "2026-07-20",
    });

    expect(await store.news.listPublished({})).toEqual([
      expect.objectContaining({ title: "Urgent notice" }),
      expect.objectContaining({ title: "Older notice" }),
    ]);
    expect((await store.news.listPublished({}))[0]).not.toHaveProperty("classifierExplanation");
    expect((await store.news.listPublished({}))[1]).not.toHaveProperty("normalizedText");
    expect((await store.news.listPublished({})).map((item) => item.title)).not.toContain("Draft notice");
  });

  test("does not let ingestion publish direct approvals", async () => {
    const store = createDemoStore();
    const created = await store.news.upsert("agency:approval", {
      title: "Initial notice",
      contentHash: "one",
      editorialState: "approved",
    });
    const changed = await store.news.upsert("agency:approval", {
      title: "Changed notice",
      contentHash: "two",
      editorialState: "approved",
    });

    expect(created.item.editorialState).toBe("review-required");
    expect(changed.item.editorialState).toBe("review-required");
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("requires a matching review record before approving news", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:reviewed", {
      title: "Reviewed notice",
      contentHash: "one",
      editorialState: "review-required",
      normalizedText: "private source text",
    });

    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      summary: "Reviewed summary",
      reviewId: "missing-review",
    })).rejects.toThrow("matching review record");

    const evidence = {
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      sourceVerified: true,
      snapshotCommitId: null,
      validatedAt: "2026-09-12T00:00:00.000Z",
    };
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "validated",
      reason: "editorial-review",
      draft: { plainLanguageSummary: " Reviewed summary ", actions: [] },
      validationEvidence: evidence,
    });
    const approved = await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      reviewId: review.id,
    });

    expect(approved).toMatchObject({
      editorialState: "approved",
      plainLanguageSummary: "Reviewed summary",
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      reviewId: review.id,
    });
    expect(await store.news.listPublished({})).toEqual([
      expect.objectContaining({ title: "Reviewed notice", plainLanguageSummary: "Reviewed summary" }),
    ]);
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "approve", reviewId: review.id, newsItemId: item.id }),
    ]);
    expect(store.reviewAudit).not.toHaveProperty("update");
    expect(store.reviewAudit).not.toHaveProperty("remove");
  });

  test("atomically rejects a current news review and appends immutable audit", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:reject", {
      title: "Rejected notice", contentHash: "one", editorialState: "review-required",
      plainLanguageSummary: "Private draft", actions: [{ label: "Private" }],
    });
    const review = await store.reviewQueue.create({
      newsItemId: item.id, contentHash: item.contentHash, revisionId: item.currentRevisionId,
      editorialState: "review-required", status: "pending", reason: "high-impact",
    });

    const rejected = await store.news.decideReview(item.id, {
      decision: "reject",
      reviewerUid: "editor-1", reviewedAt: "2026-09-12T00:00:00.000Z", reviewId: review.id,
    });

    expect(rejected).toMatchObject({ editorialState: "rejected", plainLanguageSummary: "", actions: [] });
    expect(await store.reviewQueue.get(review.id)).toMatchObject({ status: "rejected", rejectedBy: "editor-1" });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "reject", reviewId: review.id, newsItemId: item.id }),
    ]);
  });

  test("atomically validates and approves a pending review with its audit", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:pending-approval", {
      sourceId: "agency", title: "Current notice", contentHash: "hash-one",
      editorialState: "review-required", snapshotPath: "news-source-snapshots/agency/hash-one.txt",
      snapshotCommitId: "commit-1",
    });
    const review = await store.reviewQueue.create({
      newsItemId: item.id, sourceId: item.sourceId, contentHash: item.contentHash,
      revisionId: item.currentRevisionId, editorialState: "review-required", status: "pending",
      reason: "editorial-review",
    });
    const evidence = {
      contentHash: item.contentHash, revisionId: item.currentRevisionId, sourceId: item.sourceId,
      snapshotPath: item.snapshotPath, snapshotCommitId: item.snapshotCommitId,
      sourceVerified: true, validatedAt: "2026-09-12T00:00:00.000Z",
    };

    const approved = await store.news.decideReview(item.id, {
      decision: "approve", reviewerUid: "editor-1", reviewedAt: evidence.validatedAt,
      reviewId: review.id,
      validation: { draft: { plainLanguageSummary: "Reviewed summary", actions: [] }, evidence },
    });

    expect(approved).toMatchObject({ editorialState: "approved", plainLanguageSummary: "Reviewed summary" });
    expect(await store.reviewQueue.get(review.id)).toMatchObject({
      status: "consumed", validatedBy: "editor-1", consumedBy: "editor-1",
    });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "approve", reviewId: review.id }),
    ]);
  });

  test("rejects approval evidence bound to another snapshot path or source", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:snapshot-mismatch", {
      sourceId: "agency",
      title: "Current notice",
      contentHash: "hash-one",
      editorialState: "review-required",
      snapshotPath: "news-source-snapshots/agency/hash-one.txt",
      snapshotCommitId: "commit-1",
    });
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "validated",
      reason: "editorial-review",
      draft: { plainLanguageSummary: "Reviewed summary", actions: [] },
      validationEvidence: {
        contentHash: item.contentHash,
        revisionId: item.currentRevisionId,
        sourceId: "other-agency",
        snapshotPath: "news-source-snapshots/other-agency/hash-one.txt",
        snapshotCommitId: item.snapshotCommitId,
        sourceVerified: true,
        validatedAt: "2026-09-12T00:00:00.000Z",
      },
    });

    await expect(store.news.decideReview(item.id, {
      decision: "approve",
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      reviewId: review.id,
    })).rejects.toThrow(/validation evidence|snapshot/i);
    expect(await store.news.get(item.id)).toMatchObject({ editorialState: "review-required" });
    expect(await store.reviewAudit.listGlobal()).toEqual([]);
  });

  test("keeps added user-scoped news collections isolated by uid", async () => {
    const store = createDemoStore();
    await store.savedNews.create("student-a", { newsItemId: "item-1" });
    await store.notifications.create("student-a", { title: "New rule" });
    await store.conversationMessages.create("student-a", "conversation-1", { text: "Question" });

    expect(await store.savedNews.list("student-b")).toEqual([]);
    expect(await store.notifications.list("student-b")).toEqual([]);
    expect(await store.conversationMessages.list("student-b", "conversation-1")).toEqual([]);
  });

  test("rejects a stale review and derives revision state from merged values", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:stale-review", {
      title: "Current notice",
      contentHash: "current-hash",
      sourceVerified: true,
      relevance: "relevant",
      editorialState: "review-required",
    });
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      contentHash: "stale-hash",
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "validated",
      reason: "editorial-review",
      draft: { plainLanguageSummary: "Attacker supplied", actions: [] },
      validationEvidence: {
        contentHash: "stale-hash",
        revisionId: item.currentRevisionId,
        sourceVerified: true,
        snapshotCommitId: null,
      },
    });

    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      reviewId: review.id,
      summary: "Caller supplied",
    })).rejects.toThrow("current content revision");

    const revised = await store.news.reviseInternal(item.id, { sourceVerified: false });
    expect(revised).toMatchObject({ sourceVerified: false, editorialState: "review-required" });
  });

  test("demotes approved content when an internal update changes reviewed fields", async () => {
    const store = createDemoStore();
    const { item } = await store.news.upsert("agency:approved-update", {
      title: "Reviewed notice",
      contentHash: "hash-a",
      sourceVerified: true,
      relevance: "relevant",
      editorialState: "review-required",
    });
    const evidence = {
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      sourceVerified: true,
      snapshotCommitId: null,
    };
    const review = await store.reviewQueue.create({
      newsItemId: item.id,
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      editorialState: "review-required",
      status: "validated",
      reason: "editorial-review",
      draft: { plainLanguageSummary: "Reviewed summary", actions: [] },
      validationEvidence: evidence,
    });
    await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      reviewId: review.id,
    });

    const updated = await store.news.updateInternal(item.id, {
      plainLanguageSummary: "Unreviewed replacement",
    });
    expect(updated).toMatchObject({
      editorialState: "review-required",
      plainLanguageSummary: "",
      actions: [],
    });
    expect(updated).not.toHaveProperty("reviewerUid");
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("never lets an expired lease owner release a replacement owner's lease", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00.000Z"));
    const store = createDemoStore();
    expect(await store.leases.acquire("source", "first", "2026-09-14T12:00:01.000Z")).toBe(true);
    vi.setSystemTime(new Date("2026-09-14T12:00:02.000Z"));
    expect(await store.leases.acquire("source", "second", "2026-09-14T12:01:00.000Z")).toBe(true);

    expect(await store.leases.release("source", "first")).toBe(false);
    expect(await store.leases.acquire("source", "third", "2026-09-14T12:02:00.000Z")).toBe(false);
    expect(await store.leases.release("source", "second")).toBe(true);
  });
});
