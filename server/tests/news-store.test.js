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

    const review = await store.reviewQueue.create({ newsItemId: item.id });
    const approved = await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-12T00:00:00.000Z",
      summary: " Reviewed summary ",
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
