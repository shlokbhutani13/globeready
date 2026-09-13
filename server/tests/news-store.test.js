import { describe, expect, test } from "vitest";

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
      editorialState: "approved",
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

  test("keeps added user-scoped news collections isolated by uid", async () => {
    const store = createDemoStore();
    await store.savedNews.create("student-a", { newsItemId: "item-1" });
    await store.notifications.create("student-a", { title: "New rule" });
    await store.conversationMessages.create("student-a", "conversation-1", { text: "Question" });

    expect(await store.savedNews.list("student-b")).toEqual([]);
    expect(await store.notifications.list("student-b")).toEqual([]);
    expect(await store.conversationMessages.list("student-b", "conversation-1")).toEqual([]);
  });
});
