import { describe, expect, test } from "vitest";
import { reviewedUniversities } from "../../client/src/data/university-coverage.js";
import { validateUniversityRegistry } from "../../client/src/lib/university-registry.js";

describe("published university coverage artifact", () => {
  test("is empty or contains only validated reviewed entries", () => {
    expect(validateUniversityRegistry(reviewedUniversities).valid).toBe(true);
  });
});
