import { describe, expect, test } from "vitest";
import { buildPublicArtifacts } from "../scripts/build-public-news-artifact.mjs";

const reviewed = {
  id: "uscis-opt", sourceId: "uscis", sourceVerified: true, editorialState: "approved",
  title: "Optional Practical Training guidance", publisher: "USCIS",
  canonicalUrl: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
  publishedAt: "2026-10-10", shortSummary: "Review the official eligibility and filing guidance.",
  topics: ["employment"], visaTypes: ["f-1"], urgency: "normal",
  privateNotes: "never public", generatedSummary: "not reviewed",
};

describe("public news artifact generator", () => {
  test("emits deterministic ordering, stable hashes, and only allowlisted fields", () => {
    const input = [reviewed, { ...reviewed, id: "older", publishedAt: "2026-09-01" }];
    const first = buildPublicArtifacts({ items: input, coverage: [], generatedAt: "2026-10-13T12:00:00.000Z" });
    const second = buildPublicArtifacts({ items: [...input].reverse(), coverage: [], generatedAt: "2026-10-13T12:00:00.000Z" });
    expect(first).toEqual(second);
    expect(first.news.stories.map((item) => item.id)).toEqual(["uscis-opt", "older"]);
    expect(first.news.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(/privateNotes|generatedSummary/);
  });

  test("rejects unreviewed content and non-official canonical URLs", () => {
    expect(() => buildPublicArtifacts({ items: [{ ...reviewed, editorialState: "review-required" }], coverage: [], generatedAt: "2026-10-13T12:00:00.000Z" })).toThrow(/reviewed/i);
    expect(() => buildPublicArtifacts({ items: [{ ...reviewed, canonicalUrl: "https://news.example.com/story" }], coverage: [], generatedAt: "2026-10-13T12:00:00.000Z" })).toThrow(/official/i);
  });

  test("bounds public output and emits only safe coverage fields", () => {
    const coverage = [{ id: "uscis", name: "USCIS", status: "active", officialUrl: "https://www.uscis.gov", secret: "x" }];
    const { news, coverage: result } = buildPublicArtifacts({ items: [reviewed], coverage, generatedAt: "2026-10-13T12:00:00.000Z" });
    expect(Buffer.byteLength(JSON.stringify(news))).toBeLessThan(1_000_000);
    expect(result.entries).toEqual([{ id: "uscis", name: "USCIS", status: "active", officialUrl: "https://www.uscis.gov" }]);
  });
});
