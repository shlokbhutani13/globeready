import { describe, expect, test } from "vitest";
import { relevanceFor } from "../lib/relevance";

const item = { topics: ["status", "travel", "employment"], visaTypes: ["f-1", "j-1"], journeyStages: ["enrolled", "graduating", "opt"], universityIds: [] };

describe("update relevance", () => {
  test("explains each matching field and stays informational", () => {
    const result = relevanceFor(item, { visaType: "F-1", journeyStage: "Current student", topics: ["travel-entry", "campus-life"] });
    expect(result.label).toBe("May be relevant to you");
    expect(result.matches.map((match) => match.field)).toEqual(["visaType", "journeyStage", "topics"]);
    expect(result.explanation).toMatch(/visa type \(F-1\)/);
    expect(result.explanation).toMatch(/journey stage \(Current student\)/);
    expect(result.explanation).toMatch(/saved topics \(travel entry\)/);
    expect(result.explanation).toMatch(/does not mean the update legally applies to you/i);
  });

  test("returns nothing when no field matches, and never claims applicability", () => {
    expect(relevanceFor(item, { visaType: "Other", journeyStage: "Preparing for arrival" })).toBeNull();
    expect(relevanceFor(item, {})).toBeNull();
    const result = relevanceFor(item, { visaType: "J-1" });
    expect(result.explanation).not.toMatch(/\b(applies to you\.|you must|you are required|eligible)\b/i);
  });
});
