import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { buildProposals, buildPublicArtifacts } from "../scripts/build-public-news-artifact.mjs";

const root = new URL("../../", import.meta.url);

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
    const coverage = [{ id: "uscis", name: "USCIS", status: "active", officialUrl: "https://www.uscis.gov", lastVerifiedAt: "2026-10-13T12:00:00.000Z", secret: "x" }];
    const { news, coverage: result } = buildPublicArtifacts({ items: [reviewed], coverage, generatedAt: "2026-10-13T12:00:00.000Z" });
    expect(Buffer.byteLength(JSON.stringify(news))).toBeLessThan(1_000_000);
    expect(result.entries).toEqual([{ id: "uscis", name: "USCIS", status: "active", officialUrl: "https://www.uscis.gov", lastVerifiedAt: "2026-10-13T12:00:00.000Z" }]);
  });
  test("never gives an unmonitored source a review date, and requires one for active sources", () => {
    const build = (entry) => () => buildPublicArtifacts({ items: [], coverage: [entry], generatedAt: "2026-10-13T12:00:00.000Z" });
    expect(build({ id: "uscis", status: "planned", lastVerifiedAt: "2026-10-13T12:00:00.000Z" })).toThrow(/not monitored/i);
    expect(build({ id: "uscis", status: "active" })).toThrow(/last reviewed/i);
    expect(build({ id: "uscis", status: "live" })).toThrow(/status/i);
    expect(build({ id: "uscis", status: "planned" })).not.toThrow();
  });

  test("the published static files are exactly what the reviewed input generates", async () => {
    const input = JSON.parse(await readFile(new URL("server/data/reviewed-public-news.json", root), "utf8"));
    const expected = buildPublicArtifacts(input);
    for (const [name, value] of [["news", expected.news], ["coverage", expected.coverage]]) {
      const published = await readFile(new URL(`client/public/data/${name}.json`, root), "utf8");
      expect(published, `client/public/data/${name}.json is stale; run npm run news:public -- --input data/reviewed-public-news.json`)
        .toBe(`${JSON.stringify(value, null, 2)}\n`);
    }
  });

  test("weekly proposals are deterministic and skip stories already reviewed", () => {
    const payload = { results: [
      { document_number: "2026-14439", title: "Reviewed rule", html_url: "https://www.federalregister.gov/d/2026-14439", publication_date: "2026-07-17", type: "Rule" },
      { document_number: "2026-20001", title: "New notice", html_url: "https://www.federalregister.gov/d/2026-20001", publication_date: "2026-10-01", type: "Notice" },
      { document_number: "2026-20002", title: "Off-site", html_url: "https://example.com/x", publication_date: "2026-10-02", type: "Notice" },
    ] };
    const first = buildProposals(payload, new Set(["federal-register-2026-14439"]));
    expect(first.map((item) => item.externalId)).toEqual(["2026-20001"]);
    expect(buildProposals({ results: [...payload.results].reverse() }, new Set(["federal-register-2026-14439"]))).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/generatedAt/u);
  });
});
