import { describe, expect, it } from "vitest";
import { filterRules, relatedRules, rulesLibrary, rulesFilters, supersessionChain, rulesForNews, effectiveLabel } from "../data/rules-library";

describe("rules and forms library data", () => {
  it("gives every entry an official https source and a plain status", () => {
    expect(rulesLibrary.length).toBeGreaterThanOrEqual(15);
    for (const entry of rulesLibrary) {
      expect(entry.sourceUrl).toMatch(/^https:\/\//u);
      expect(new URL(entry.sourceUrl).hostname).toMatch(/\.(gov|mil)$/u);
      expect(["current", "superseded", "reference"]).toContain(entry.status);
      expect(["rule", "regulation", "form", "guidance"]).toContain(entry.kind);
      expect(entry.agency).toBeTruthy();
      expect(entry.summary.length).toBeGreaterThan(30);
    }
  });

  it("has unique ids and valid supersession links in both directions", () => {
    const ids = new Set(rulesLibrary.map((entry) => entry.id));
    expect(ids.size).toBe(rulesLibrary.length);
    for (const entry of rulesLibrary) {
      for (const other of entry.supersedes || []) {
        expect(ids.has(other)).toBe(true);
        expect(rulesLibrary.find((candidate) => candidate.id === other).supersededBy).toBe(entry.id);
      }
      if (entry.supersededBy) {
        expect(entry.status).toBe("superseded");
        expect(rulesLibrary.find((candidate) => candidate.id === entry.supersededBy).supersedes).toContain(entry.id);
      }
    }
  });

  it("only uses real calendar dates", () => {
    for (const entry of rulesLibrary) {
      for (const key of ["publishedAt", "effectiveAt", "listedOn"]) {
        if (entry[key]) expect(new Date(`${entry[key]}T00:00:00Z`).toISOString().slice(0, 10)).toBe(entry[key]);
      }
    }
  });

  it("states honestly when an entry has no single effective date", () => {
    const reference = rulesLibrary.find((entry) => entry.status === "reference");
    expect(effectiveLabel(reference)).toMatch(/no single effective date/iu);
    const rule = rulesLibrary.find((entry) => entry.effectiveAt);
    expect(effectiveLabel(rule)).toContain(rule.effectiveAt);
  });
});

describe("filterRules", () => {
  it("returns everything with no filters", () => {
    expect(filterRules(rulesLibrary, {})).toHaveLength(rulesLibrary.length);
  });
  it("matches search terms across title, agency, summary and form numbers, ignoring case and accents", () => {
    const hits = filterRules(rulesLibrary, { query: "i-765" });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((entry) => `${entry.title} ${entry.summary} ${entry.agency} ${(entry.keywords || []).join(" ")}`.toLowerCase().includes("i-765"))).toBe(true);
    expect(filterRules(rulesLibrary, { query: "zzzzzz" })).toEqual([]);
  });
  it("filters by kind, status, visa type and topic and combines filters", () => {
    expect(filterRules(rulesLibrary, { kind: "form" }).every((entry) => entry.kind === "form")).toBe(true);
    expect(filterRules(rulesLibrary, { status: "superseded" }).every((entry) => entry.status === "superseded")).toBe(true);
    expect(filterRules(rulesLibrary, { visa: "j-1" }).every((entry) => entry.visaTypes.includes("j-1"))).toBe(true);
    const combined = filterRules(rulesLibrary, { kind: "form", topic: "employment" });
    expect(combined.every((entry) => entry.kind === "form" && entry.topics.includes("employment"))).toBe(true);
  });
  it("hides superseded entries only when asked to", () => {
    expect(filterRules(rulesLibrary, { hideSuperseded: true }).some((entry) => entry.status === "superseded")).toBe(false);
  });
  it("offers filters that exist in the data", () => {
    expect(rulesFilters.kinds.map((kind) => kind.id)).toEqual(["rule", "regulation", "form", "guidance"]);
    for (const topic of rulesFilters.topics) expect(rulesLibrary.some((entry) => entry.topics.includes(topic.id))).toBe(true);
  });
});

describe("links between rules and updates", () => {
  it("builds the chain from an old framework to its replacement", () => {
    const superseded = rulesLibrary.find((entry) => entry.status === "superseded");
    const chain = supersessionChain(superseded.id);
    expect(chain.map((entry) => entry.id)).toEqual([superseded.id, superseded.supersededBy]);
    expect(supersessionChain("missing")).toEqual([]);
  });
  it("finds the entries that cite a reviewed update", () => {
    const withNews = rulesLibrary.find((entry) => entry.newsIds?.length);
    expect(rulesForNews(withNews.newsIds[0]).map((entry) => entry.id)).toContain(withNews.id);
    expect(rulesForNews("nothing")).toEqual([]);
  });
  it("suggests related entries by shared topics without repeating the entry", () => {
    const entry = rulesLibrary[0];
    const related = relatedRules(entry.id, 3);
    expect(related.length).toBeLessThanOrEqual(3);
    expect(related.some((other) => other.id === entry.id)).toBe(false);
  });
});
