import { describe, expect, test } from "vitest";

import { compareSourceSnapshots } from "../src/news/change-ledger.js";

const source = { id: "uscis", publisher: "USCIS", allowedHosts: ["www.uscis.gov"] };
const entry = (id, title = `Title ${id}`, url = `https://www.uscis.gov/news/${id}`) => ({
  externalId: id, title, canonicalUrl: url, publishedAt: "2026-10-01",
  updatedAt: null, effectiveAt: null, sourceExcerpt: `Excerpt ${id}`, topics: ["status"], visaTypes: ["f-1"],
});

describe("official source change ledger", () => {
  test("classifies new changed redirected and unchanged entries deterministically", () => {
    const previous = { entries: [entry("same"), entry("changed"), entry("moved")], absenceCounts: {}, resolvedFingerprints: [] };
    const current = { ok: true, entries: [
      entry("new"), entry("changed", "Changed title"), entry("same"),
      entry("moved", "Title moved", "https://www.uscis.gov/alerts/moved"),
    ] };
    const result = compareSourceSnapshots({ source, previous, current, collectedAt: "2026-10-14T12:00:00.000Z" });
    expect(result.candidates.map(({ changeType }) => changeType).sort()).toEqual(["changed", "new", "redirected"]);
    expect(result.candidates).toEqual([...result.candidates].sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.id.localeCompare(b.id)));
    expect(result.candidates.find(({ changeType }) => changeType === "changed").diffs).toContain("title");
    expect(result.sourceHealth).toEqual({ sourceId: "uscis", state: "active", collectedAt: "2026-10-14T12:00:00.000Z", itemCount: 4 });
  });

  test("requires two successful absences before proposing removal", () => {
    const previous = { entries: [entry("gone")], absenceCounts: {}, resolvedFingerprints: [] };
    const first = compareSourceSnapshots({ source, previous, current: { ok: true, entries: [] }, collectedAt: "2026-10-14T12:00:00.000Z", absenceConfirmations: 2 });
    expect(first.candidates).toEqual([]);
    expect(first.nextSnapshot.absenceCounts.gone).toBe(1);
    const second = compareSourceSnapshots({ source, previous: first.nextSnapshot, current: { ok: true, entries: [] }, collectedAt: "2026-10-15T12:00:00.000Z", absenceConfirmations: 2 });
    expect(second.candidates).toHaveLength(1);
    expect(second.candidates[0].changeType).toBe("removed");
  });

  test("does not advance removal confirmation on a failed collection", () => {
    const previous = { entries: [entry("gone")], absenceCounts: { gone: 1 }, resolvedFingerprints: [] };
    const result = compareSourceSnapshots({ source, previous, current: { ok: false, entries: [], errorCode: "TIMEOUT" }, collectedAt: "2026-10-15T12:00:00.000Z" });
    expect(result.candidates).toEqual([]);
    expect(result.nextSnapshot).toEqual(previous);
    expect(result.sourceHealth).toMatchObject({ state: "failing", errorCode: "TIMEOUT" });
  });

  test("omits previously resolved candidate fingerprints", () => {
    const first = compareSourceSnapshots({ source, previous: { entries: [], absenceCounts: {}, resolvedFingerprints: [] }, current: { ok: true, entries: [entry("new")] }, collectedAt: "2026-10-14T12:00:00.000Z" });
    const resolved = first.candidates[0].fingerprint;
    const second = compareSourceSnapshots({ source, previous: { entries: [], absenceCounts: {}, resolvedFingerprints: [resolved] }, current: { ok: true, entries: [entry("new")] }, collectedAt: "2026-10-14T12:00:00.000Z" });
    expect(second.candidates).toEqual([]);
  });
});
