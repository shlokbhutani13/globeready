import { describe, expect, test } from "vitest";

import {
  isPublished,
  normalizeNewsCandidate,
  publicNewsItem,
} from "../src/news/schema.js";

describe("news schema", () => {
  test("normalizes a verified official candidate", () => {
    const item = normalizeNewsCandidate({
      externalId: "2026-14439",
      canonicalUrl: "https://www.federalregister.gov/d/2026-14439",
      title: " Fixed admission periods ",
      publisher: "Department of Homeland Security",
      publishedAt: "2026-07-17",
      updatedAt: null,
      effectiveAt: "2026-09-15",
      sourceDocumentType: "Rule",
      docketNumber: "ICEB-2025-0001",
      regulationIdNumber: "1653-AA95",
      excerpt: "Official summary",
      normalizedText: "Official summary",
    }, { id: "federal-register", verified: true });

    expect(item).toMatchObject({
      sourceKey: "federal-register:2026-14439",
      title: "Fixed admission periods",
      documentType: "final-rule",
      legalState: "final",
      editorialState: "published-source-only",
    });
  });

  test("removes invalid dates and bounds an official excerpt", () => {
    const item = normalizeNewsCandidate({
      canonicalUrl: "https://international.example.edu/notices/arrival",
      title: " Arrival guidance ",
      publishedAt: "2026-02-30",
      excerpt: ` ${"A".repeat(501)} `,
      normalizedText: " internal source text ",
    }, { id: "university", verified: false });

    expect(item).toMatchObject({
      sourceKey: "university:https://international.example.edu/notices/arrival",
      publishedAt: null,
      documentType: "notice",
      legalState: "informational",
      editorialState: "review-required",
      excerpt: "A".repeat(500),
      normalizedText: "internal source text",
    });
  });

  test("public projection removes private provenance and excludes unpublished items", () => {
    const approved = publicNewsItem({
      editorialState: "approved",
      normalizedText: "private",
      contentHash: "abc",
      classifierExplanation: "private reasoning",
      title: "Visible",
    });

    expect(approved).toEqual(expect.objectContaining({ title: "Visible" }));
    expect(approved).not.toHaveProperty("normalizedText");
    expect(approved).not.toHaveProperty("contentHash");
    expect(approved).not.toHaveProperty("classifierExplanation");
    expect(isPublished(approved)).toBe(true);
    expect(isPublished({ editorialState: "review-required" })).toBe(false);
  });

  test("normalizes bounded story presentation fields", () => {
    const item = normalizeNewsCandidate({
      externalId: "story-1",
      canonicalUrl: "https://www.uscis.gov/news/story-1",
      title: "  Filing guidance updated  ",
      publishedAt: "2026-10-13T15:30:00-04:00",
      verifiedAt: "2026-10-13T20:00:00Z",
      shortSummary: ` ${"S".repeat(501)} `,
      whyItMatters: "  Students may need to use the revised form.  ",
      detailSections: [
        { heading: " What changed ", body: " A revised edition was published. " },
        { heading: "", body: "ignored" },
      ],
      image: {
        url: "https://www.uscis.gov/sites/default/files/story.jpg",
        alt: " USCIS building ",
        sourceUrl: "https://www.uscis.gov/news/story-1",
        attribution: " USCIS ",
      },
      excerpt: "Official source excerpt",
      normalizedText: "  Filing GUIDANCE updated for students  ",
    }, { id: "uscis", verified: true });

    expect(item).toMatchObject({
      publishedAt: "2026-10-13T19:30:00.000Z",
      verifiedAt: "2026-10-13T20:00:00.000Z",
      shortSummary: "S".repeat(500),
      whyItMatters: "Students may need to use the revised form.",
      detailSections: [{ heading: "What changed", body: "A revised edition was published." }],
      image: {
        url: "https://www.uscis.gov/sites/default/files/story.jpg",
        alt: "USCIS building",
        sourceUrl: "https://www.uscis.gov/news/story-1",
        attribution: "USCIS",
      },
      searchText: "filing guidance updated filing guidance updated for students official source excerpt",
    });
  });

  test("rejects malformed nested story fields and preserves legacy items", () => {
    const item = normalizeNewsCandidate({
      title: "Legacy notice",
      canonicalUrl: "https://example.gov/notice",
      publishedAt: "not-a-date",
      verifiedAt: "2026-02-30",
      detailSections: [{ heading: "Valid", body: "Body", extra: "private" }],
      image: { url: "https://example.gov/image.jpg", alt: "Image", unexpected: true },
    }, { id: "legacy", verified: true });

    expect(item.publishedAt).toBeNull();
    expect(item.verifiedAt).toBeNull();
    expect(item.detailSections).toEqual([]);
    expect(item.image).toBeNull();

    expect(publicNewsItem({ id: "old", title: "Old", editorialState: "published-source-only" }))
      .toEqual({ id: "old", title: "Old", editorialState: "published-source-only", plainLanguageSummary: "", actions: [] });
  });

  test("public projection includes only bounded story presentation fields", () => {
    const projected = publicNewsItem({
      id: "story-2",
      editorialState: "approved",
      shortSummary: "Short",
      whyItMatters: "Relevant",
      detailSections: [{ heading: "What changed", body: "Details" }],
      image: { url: "https://example.gov/image.jpg", alt: "Official image" },
      publishedAt: "2026-10-13",
      verifiedAt: "2026-10-13T20:00:00.000Z",
      searchText: "private search index",
    });

    expect(projected).toMatchObject({
      shortSummary: "Short",
      whyItMatters: "Relevant",
      detailSections: [{ heading: "What changed", body: "Details" }],
      image: { url: "https://example.gov/image.jpg", alt: "Official image" },
      verifiedAt: "2026-10-13T20:00:00.000Z",
    });
    expect(projected).not.toHaveProperty("searchText");
  });
});
