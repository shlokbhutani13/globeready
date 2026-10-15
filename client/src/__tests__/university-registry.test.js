import { describe, expect, test } from "vitest";
import { coverageForUniversity, validateUniversityRegistry } from "../lib/university-registry";

const reviewed = {
  id: "example-university",
  name: "Example University",
  domain: "example.edu",
  reviewedOn: "2026-10-14",
  offices: [
    { id: "international", label: "International Student Services", url: "https://international.example.edu/" },
    { id: "tax", label: "Tax filing system", url: "https://example.vendor.gov/help", allowedExternalReason: "Official government filing system linked by the university" },
  ],
};

describe("university registry validation", () => {
  test("accepts exact reviewed university fields and office types", () => {
    expect(validateUniversityRegistry([reviewed], new Date("2026-10-14T12:00:00Z"))).toEqual({ valid: true, errors: [] });
  });

  test("rejects duplicate ids invalid domains dates and oversized values", () => {
    const bad = { ...reviewed, name: "x".repeat(201), domain: "https://example.edu/path", reviewedOn: "2026-02-30" };
    const result = validateUniversityRegistry([bad, bad], new Date("2026-10-14T12:00:00Z"));
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicate|domain|date|200/i);
  });

  test("rejects off-domain links without an allowed external reason", () => {
    const result = validateUniversityRegistry([{ ...reviewed, offices: [{ id: "international", label: "Office", url: "https://vendor.example.com/" }] }]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/off-domain|external reason/i);
  });

  test("rejects unknown and extra fields", () => {
    expect(validateUniversityRegistry([{ ...reviewed, claimedRank: 1 }]).valid).toBe(false);
    expect(validateUniversityRegistry([{ ...reviewed, offices: [{ id: "admissions", label: "Admissions", url: "https://example.edu/admissions" }] }]).valid).toBe(false);
  });
});

describe("university coverage state", () => {
  test("uses general resources when no official domain exists", () => {
    expect(coverageForUniversity({ university: "Example University" }, [])).toMatchObject({ state: "general-only", domain: "" });
    expect(coverageForUniversity({}, [])).toMatchObject({ state: "none" });
  });

  test("matches reviewed coverage by normalized domain", () => {
    expect(coverageForUniversity({ university: "Anything", officialUniversityDomain: "EXAMPLE.EDU" }, [reviewed])).toMatchObject({ state: "reviewed", entry: reviewed });
  });
});
