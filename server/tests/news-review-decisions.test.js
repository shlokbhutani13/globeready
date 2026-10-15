import { describe, expect, test } from "vitest";

import { buildReviewCandidate } from "../src/news/review-candidates.js";
import { applyReviewDecision, validateReviewDecision } from "../src/news/review-decisions.js";
import { buildPublicArtifacts } from "../scripts/build-public-news-artifact.mjs";

const source = { id: "uscis", publisher: "USCIS", allowedHosts: ["www.uscis.gov"] };
const current = {
  externalId: "notice-1", title: "Official notice", canonicalUrl: "https://www.uscis.gov/news/notice-1",
  publishedAt: "2026-10-01", updatedAt: null, effectiveAt: "2026-11-01", sourceExcerpt: "Official source text.",
  topics: ["status"], visaTypes: ["f-1"],
};
const candidate = buildReviewCandidate({ source, current, collectedAt: "2026-10-14T12:00:00.000Z", changeType: "new" });
const confirmations = { source: true, title: true, dates: true, legalState: true, tags: true, imagePolicy: true };
const record = {
  id: "uscis-notice-1", title: current.title, publisher: "USCIS", canonicalUrl: current.canonicalUrl,
  publishedAt: current.publishedAt, effectiveAt: current.effectiveAt, sourceVerified: true,
  editorialState: "approved", documentType: "guidance", legalState: "effective",
  shortSummary: "Read the official notice.", sourceExcerpt: current.sourceExcerpt,
  topics: ["status"], visaTypes: ["f-1"], urgency: "normal",
};
const approve = { type: "approve", confirmations, record, reasonCode: "verified-official-source", privateNote: "Internal only" };

describe("human news review decisions", () => {
  test("requires confirmation of source title dates legal state tags and image policy", () => {
    expect(validateReviewDecision(approve)).toEqual(approve);
  });

  test("refuses approval when a required confirmation is absent", () => {
    expect(() => validateReviewDecision({ ...approve, confirmations: { ...confirmations, legalState: false } })).toThrow(/confirm/iu);
  });

  test("keeps rejected and deferred candidates out of public artifacts", () => {
    for (const type of ["reject", "defer"]) {
      const result = applyReviewDecision({ candidate, decision: { type, reasonCode: "needs-more-evidence", privateNote: "Check later" }, reviewedItems: [], clock: () => new Date("2026-10-14T13:00:00Z") });
      expect(result.item).toBeNull();
      expect(buildPublicArtifacts({ items: result.reviewedItems, coverage: [], generatedAt: "2026-10-14T13:00:00Z" }).news.stories).toEqual([]);
    }
  });

  test("preserves item id and appends history for corrections", () => {
    const existing = { ...record, reviewHistory: [{ type: "approve", decidedAt: "2026-10-01T00:00:00.000Z", reasonCode: "verified-official-source" }] };
    const result = applyReviewDecision({
      candidate: { ...candidate, changeType: "changed" },
      decision: { ...approve, type: "correct", targetId: existing.id, record: { ...record, id: "must-not-replace-id", title: "Corrected title" }, publicCorrectionNote: "The official title changed." },
      reviewedItems: [existing], clock: () => new Date("2026-10-14T13:00:00Z"),
    });
    expect(result.item.id).toBe(existing.id);
    expect(result.item.reviewHistory).toHaveLength(2);
    expect(result.item.title).toBe("Corrected title");
  });

  test("keeps an archived item discoverable with a public correction note", () => {
    const result = applyReviewDecision({ candidate, decision: { type: "archive", targetId: record.id, reasonCode: "source-withdrawn", publicCorrectionNote: "The source withdrew this notice." }, reviewedItems: [record], clock: () => new Date("2026-10-14T13:00:00Z") });
    const artifacts = buildPublicArtifacts({ items: result.reviewedItems, coverage: [], generatedAt: "2026-10-14T13:00:00Z" });
    expect(artifacts.news.stories[0]).toMatchObject({ id: record.id, editorialState: "archived", correctionNote: "The source withdrew this notice." });
  });

  test("never copies private reviewer notes into public artifacts", () => {
    const result = applyReviewDecision({ candidate, decision: approve, reviewedItems: [], clock: () => new Date("2026-10-14T13:00:00Z") });
    const artifacts = buildPublicArtifacts({ items: result.reviewedItems, coverage: [], generatedAt: "2026-10-14T13:00:00Z" });
    expect(JSON.stringify(artifacts)).not.toMatch(/Internal only|privateNote|reviewer/iu);
    expect(artifacts.news.stories[0].reviewHistory).toEqual([{ type: "approve", decidedAt: "2026-10-14T13:00:00.000Z", reasonCode: "verified-official-source" }]);
  });
});
