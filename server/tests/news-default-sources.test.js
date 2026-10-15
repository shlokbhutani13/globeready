import { describe, expect, test } from "vitest";

import { defaultNewsSource, defaultNewsSources } from "../src/news/default-sources.js";

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

  test("enables only the bounded Federal Register JSON contract", () => {
    expect(defaultNewsSources.filter(({ enabled }) => enabled).map(({ id }) => id))
      .toEqual(["federal-register"]);
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
    for (const sourceId of ["uscis", "ice-sevp", "cbp"]) {
      expect(defaultNewsSource(sourceId)).toMatchObject({ enabled: false, checkedAt: "2026-09-14" });
      expect(defaultNewsSource(sourceId).pendingReason).toMatch(/live|current|bounded|stable/i);
    }
  });

  test("declares lifecycle cadence and audience metadata for every monitored source", () => {
    const allowedStatuses = new Set(["active", "paused", "retired"]);
    for (const source of defaultNewsSources) {
      expect(allowedStatuses.has(source.status)).toBe(true);
      expect(Number.isInteger(source.cadenceHours)).toBe(true);
      expect(source.cadenceHours).toBeGreaterThan(0);
      expect(Array.isArray(source.topics)).toBe(true);
      expect(Array.isArray(source.visaTypes)).toBe(true);
      expect(source.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(source.enabled).toBe(source.status === "active");
    }
  });
});
