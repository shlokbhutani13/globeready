import { describe, expect, test } from "vitest";

import { buildDigest } from "../src/news/digest.js";

const item = (overrides = {}) => ({
  id: "item-1",
  title: "USCIS updates I-20 guidance",
  publisher: "U.S. Citizenship and Immigration Services",
  canonicalUrl: "https://www.uscis.gov/example",
  legalState: "final",
  editorialState: "approved",
  urgency: "medium",
  effectiveAt: null,
  ...overrides,
});

describe("buildDigest", () => {
  test("produces no sections and no fabricated content for an empty feed", () => {
    const digest = buildDigest([], new Date("2026-08-01T00:00:00Z"));

    expect(digest.sections).toEqual([]);
    expect(digest.itemCount).toBe(0);
    expect(digest.generatedAt).toBe("2026-08-01T00:00:00.000Z");
  });

  test("groups urgent items into their own section", () => {
    const digest = buildDigest([item({ id: "a", urgency: "critical" })], new Date("2026-08-01T00:00:00Z"));

    expect(digest.sections).toHaveLength(1);
    expect(digest.sections[0].title).toMatch(/urgent/i);
    expect(digest.sections[0].items[0].id).toBe("a");
  });

  test("groups items with a near-term effective date into a deadlines section", () => {
    const digest = buildDigest(
      [item({ id: "b", urgency: "low", effectiveAt: "2026-08-10" })],
      new Date("2026-08-01T00:00:00Z"),
    );

    expect(digest.sections.some((section) => /deadline/i.test(section.title))).toBe(true);
  });

  test("places everything else into a general section and never drops an item", () => {
    const items = [
      item({ id: "a", urgency: "critical" }),
      item({ id: "b", urgency: "low", effectiveAt: "2026-08-10" }),
      item({ id: "c", urgency: "low", effectiveAt: null }),
    ];
    const digest = buildDigest(items, new Date("2026-08-01T00:00:00Z"));

    expect(digest.itemCount).toBe(3);
    const allIds = digest.sections.flatMap((section) => section.items.map((entry) => entry.id));
    expect(new Set(allIds)).toEqual(new Set(["a", "b", "c"]));
  });

  test("never invents a field that was not present on the source item", () => {
    const digest = buildDigest([item({ id: "a", urgency: "critical", effectiveAt: undefined })], new Date());

    const entry = digest.sections[0].items[0];
    expect(entry.effectiveAt).toBeNull();
    expect(Object.keys(entry).sort()).toEqual(
      ["canonicalUrl", "effectiveAt", "id", "legalState", "publisher", "title", "urgency"].sort(),
    );
  });

  test("bounds each section instead of growing without limit", () => {
    const items = Array.from({ length: 25 }, (_, index) => item({ id: `item-${index}`, urgency: "critical" }));
    const digest = buildDigest(items, new Date());

    expect(digest.sections[0].items.length).toBeLessThanOrEqual(10);
  });

  test("records the requested digest frequency without contacting an email provider", () => {
    const digest = buildDigest([item()], new Date(), { digestFrequency: "daily" });

    expect(digest.frequency).toBe("daily");
  });

  test("defaults to weekly when no frequency is given", () => {
    const digest = buildDigest([item()], new Date());

    expect(digest.frequency).toBe("weekly");
  });
});
