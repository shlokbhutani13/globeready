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
});
