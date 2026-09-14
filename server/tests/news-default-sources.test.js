import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { createIndexPageAdapter } from "../src/news/adapters/index-page.js";
import { defaultNewsSource, defaultNewsSources } from "../src/news/default-sources.js";

const fixtureNames = new Map([
  ["uscis", "uscis-index-2026-09-14.html"],
  ["ice-sevp", "ice-sevp-index-2026-09-14.html"],
  ["cbp", "cbp-index-2026-09-14.html"],
]);

describe("operational default news source registry", () => {
  test("uses current Federal Register agency slugs", () => {
    expect(defaultNewsSource("federal-register").agencies).toEqual(expect.arrayContaining([
      "homeland-security-department",
      "u-s-citizenship-and-immigration-services",
      "u-s-immigration-and-customs-enforcement",
      "u-s-customs-and-border-protection",
      "state-department",
    ]));
    expect(defaultNewsSource("federal-register").agencies.every((slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug))).toBe(true);
  });

  test.each([...fixtureNames])("parses only the bounded %s listing contract", async (sourceId, fixtureName) => {
    const source = defaultNewsSource(sourceId);
    const html = await readFile(new URL(`./fixtures/${fixtureName}`, import.meta.url), "utf8");
    const candidates = await createIndexPageAdapter().collect(source, html);

    expect(source).toMatchObject({ enabled: true, checkedAt: "2026-09-14" });
    expect(source.itemSelector).toBeTruthy();
    expect(candidates).toHaveLength(1);
    expect(candidates[0].title).not.toMatch(/Navigation|Contact|Newsroom/u);
  });

  test("keeps unreliable sources disabled with a checked reason", () => {
    const pending = defaultNewsSources.filter((source) => source.enabled === false);
    expect(pending.length).toBeGreaterThan(0);
    for (const source of pending) {
      expect(source.checkedAt).toBe("2026-09-14");
      expect(source.pendingReason).toMatch(/pending|not been verified|returned 404|denied/i);
    }
    expect(defaultNewsSource("study-in-the-states")).toMatchObject({
      enabled: false,
      url: "https://studyinthestates.dhs.gov/",
    });
  });
});
