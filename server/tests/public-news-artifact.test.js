import { readFile, mkdtemp } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, test } from "vitest";
import { buildDiscoveryArtifact, buildProposals, buildPublicArtifacts } from "../scripts/build-public-news-artifact.mjs";

const root = new URL("../../", import.meta.url);
const exec = promisify(execFile);

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

  test("strips private review fields while keeping bounded public correction history", () => {
    const item = { ...reviewed, correctionNote: "The official source corrected its title.", reviewHistory: [
      { type: "correct", decidedAt: "2026-10-14T13:00:00.000Z", reasonCode: "source-correction", reviewerUid: "private", privateNote: "hidden" },
    ] };
    const story = buildPublicArtifacts({ items: [item], coverage: [], generatedAt: "2026-10-14T13:00:00Z" }).news.stories[0];
    expect(story.correctionNote).toMatch(/corrected its title/iu);
    expect(story.reviewHistory).toEqual([{ type: "correct", decidedAt: "2026-10-14T13:00:00.000Z", reasonCode: "source-correction" }]);
    expect(JSON.stringify(story)).not.toMatch(/private|reviewerUid/iu);
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

  test("generates the same proposal artifact from fixture input twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "globeready-proposals-"));
    const script = new URL("../scripts/build-public-news-artifact.mjs", import.meta.url);
    const fixture = new URL("fixtures/news-change-ledger/current.json", import.meta.url);
    const snapshot = new URL("fixtures/news-change-ledger/previous.json", import.meta.url);
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    const next = join(directory, "snapshot.json");
    for (const output of [first, second]) await exec(process.execPath, [script.pathname, "--fixture-input", fixture.pathname, "--snapshot-input", snapshot.pathname, "--snapshot-output", next, "--discover-output", output]);
    expect(await readFile(first, "utf8")).toBe(await readFile(second, "utf8"));
    expect(JSON.parse(await readFile(first, "utf8"))).toMatchObject({ schemaVersion: 1, sourceHealth: { sourceId: "uscis" } });
  });

  test("live discovery uses the change ledger for edits redirects and confirmed removals", () => {
    const source = { id: "federal-register", allowedHosts: ["www.federalregister.gov"] };
    const prior = { entries: [{ externalId: "one", title: "Old", canonicalUrl: "https://www.federalregister.gov/d/one", publishedAt: "2026-10-01", updatedAt: null, effectiveAt: null, sourceExcerpt: "Old", topics: [], visaTypes: [] }], absenceCounts: {}, resolvedFingerprints: [] };
    const changed = buildDiscoveryArtifact({ source, previous: prior, entries: [{ ...prior.entries[0], title: "New" }], collectedAt: "2026-10-14T12:00:00Z" });
    expect(changed.artifact.proposals).toHaveLength(1);
    expect(changed.artifact.proposals[0].changeType).toBe("changed");
    const missingOnce = buildDiscoveryArtifact({ source, previous: prior, entries: [], collectedAt: "2026-10-14T12:00:00Z" });
    expect(missingOnce.artifact.proposals).toEqual([]);
    const missingTwice = buildDiscoveryArtifact({ source, previous: missingOnce.snapshot, entries: [], collectedAt: "2026-10-15T12:00:00Z" });
    expect(missingTwice.artifact.proposals[0].changeType).toBe("removed");
  });
});

describe("zero-cost release contract", () => {
  test("CI generates fixture candidates validates universities and stays read only", async () => {
    const workflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
    expect(workflow).toMatch(/--fixture-input\s+tests\/fixtures\/news-change-ledger\/current\.json/u);
    expect(workflow).toMatch(/npm run university:validate/u);
    expect(workflow).toMatch(/permissions:\s*\n\s*contents:\s*read/u);
    expect(workflow).not.toMatch(/contents:\s*write|pull-requests:\s*write/u);
    expect(workflow).not.toMatch(/https:\/\/(?:www\.)?(?:uscis|ice|dhs|state)\.gov/iu);
  });

  test("the weekly proposal workflow persists the change-ledger snapshot", async () => {
    const workflow = await readFile(new URL(".github/workflows/propose-news-update.yml", root), "utf8");
    expect(workflow).toMatch(/--snapshot-input\s+data\/news-source-snapshots\/federal-register\.json/u);
    expect(workflow).toMatch(/--snapshot-output\s+data\/news-source-snapshots\/federal-register\.json/u);
    expect(workflow).toMatch(/git fetch origin refs\/heads\/automation\/public-news-review/u);
    expect(workflow).toContain("additions, edits, redirects, confirmed removals, or collection failures");
  });

  test("release documentation lists every separately authorized live check", async () => {
    const readiness = await readFile(new URL("docs/RELEASE_READINESS.md", root), "utf8");
    for (const phrase of [
      "push and GitHub-hosted CI", "Firebase project creation and preview deployment",
      "real Google sign-in and email verification delivery", "hosting headers, MIME types, service worker, and quota behavior",
      "disposable-account export, restore, and destructive deletion smoke test", "domain purchase and DNS",
      "paid production API, Storage, Gemini, email, push, monitoring, and backup services",
    ]) expect(readiness).toContain(phrase);
  });

  test("operations and university runbooks are linked from the zero-cost guide", async () => {
    const guide = await readFile(new URL("docs/ZERO_COST_PUBLIC.md", root), "utf8");
    expect(guide).toContain("NEWS_REVIEW_OPERATIONS.md");
    expect(guide).toContain("UNIVERSITY_COVERAGE.md");
  });
});
