import { describe, expect, test } from "vitest";

import {
  buildReviewCandidate,
  candidateFingerprint,
  candidateSchemaVersion,
  validateReviewCandidate,
} from "../src/news/review-candidates.js";

const source = {
  id: "uscis",
  publisher: "USCIS",
  allowedHosts: ["www.uscis.gov"],
};
const item = {
  externalId: "alert-1",
  title: "Updated guidance for students",
  canonicalUrl: "https://www.uscis.gov/news/alert-1?utm_source=email",
  publishedAt: "2026-10-14",
  effectiveAt: "2026-11-01",
  sourceExcerpt: "A short official description.",
  topics: ["status"],
  visaTypes: ["f-1"],
};

describe("official-source review candidates", () => {
  test("builds a bounded versioned candidate with stable meaningful fingerprint", () => {
    const candidate = buildReviewCandidate({
      source,
      current: item,
      previous: { ...item, title: "Earlier guidance" },
      collectedAt: "2026-10-14T12:00:00.000Z",
      changeType: "changed",
    });
    expect(candidate).toMatchObject({
      schemaVersion: 1,
      sourceId: "uscis",
      changeType: "changed",
      publicationState: "unreviewed",
      canonicalUrl: "https://www.uscis.gov/news/alert-1",
      current: { title: "Updated guidance for students" },
      previous: { title: "Earlier guidance" },
    });
    expect(candidateSchemaVersion).toBe(1);
    expect(candidate.id).toMatch(/^review-candidate:/u);
    expect(candidate.fingerprint).toBe(candidateFingerprint(item));
    expect(validateReviewCandidate(candidate, source)).toEqual(candidate);
  });

  test("rejects unknown fields invalid states and oversized evidence", () => {
    const candidate = buildReviewCandidate({ source, current: item, collectedAt: "2026-10-14T12:00:00.000Z", changeType: "new" });
    expect(() => validateReviewCandidate({ ...candidate, unexpected: true }, source)).toThrow(/unknown field/iu);
    expect(() => validateReviewCandidate({ ...candidate, changeType: "invented" }, source)).toThrow(/change type/iu);
    expect(() => validateReviewCandidate({ ...candidate, current: { ...candidate.current, sourceExcerpt: "x".repeat(2_001) } }, source)).toThrow(/evidence|excerpt/iu);
    expect(() => validateReviewCandidate({ ...candidate, current: { ...candidate.current, title: "Tampered title" } }, source)).toThrow(/identity/iu);
    expect(() => validateReviewCandidate({ ...candidate, diffs: ["title"] }, source)).toThrow(/identity/iu);
  });

  test("does not change fingerprints for whitespace or tracking parameters", () => {
    const changedPresentation = {
      ...item,
      title: "  Updated   guidance\nfor students  ",
      canonicalUrl: "https://www.uscis.gov/news/alert-1?utm_medium=email&utm_source=other",
      sourceExcerpt: "A short  official\n description.",
    };
    expect(candidateFingerprint(changedPresentation)).toBe(candidateFingerprint(item));
  });

  test("rejects an off-host final URL even when the initial URL is official", () => {
    expect(() => buildReviewCandidate({
      source,
      current: { ...item, canonicalUrl: "https://outside.example/news/alert-1" },
      collectedAt: "2026-10-14T12:00:00.000Z",
      changeType: "redirected",
    })).toThrow(/allowed official host/iu);
  });
});
