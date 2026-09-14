import { describe, expect, test } from "vitest";

import { classifyCandidate, isHighImpact } from "../src/news/classifier.js";

const fixedClock = () => new Date("2026-09-14T12:00:00.000Z");

describe("deterministic news classification", () => {
  test.each([
    ["F-1 grace period reduced to 30 days", "status", true],
    ["New Form I-765 edition and filing fee", "forms-fees", true],
    ["International office welcome picnic", "campus-life", false],
  ])("classifies %s", (title, topic, highImpact) => {
    expect(classifyCandidate({ title, excerpt: title }, { clock: fixedClock }))
      .toMatchObject({ topic, highImpact });
  });

  test("uses source document metadata and a future effective date for distinct document and legal states", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Rule",
      title: "Fixed admission periods",
      effectiveAt: "2026-09-15",
    }, { clock: fixedClock })).toMatchObject({
      documentType: "final-rule",
      legalState: "scheduled",
    });
  });

  test("marks a final rule effective only after its supplied effective date", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Final Rule",
      title: "Fixed admission periods for F-1 students",
      effectiveAt: "2026-09-13",
    }, { clock: fixedClock })).toMatchObject({
      documentType: "final-rule",
      legalState: "effective",
    });
  });

  test("prefers explicit source document metadata over conflicting title words", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "Proposed rule listening session",
    }, { clock: fixedClock })).toMatchObject({ documentType: "notice" });
  });

  test("keeps urgency and relevance separate for a high-impact court restriction", () => {
    const classification = classifyCandidate({
      title: "Court injunction blocks the new OPT eligibility standard",
      excerpt: "The injunction applies to F-1 students.",
    }, { clock: fixedClock });

    expect(classification).toMatchObject({
      documentType: "court-update",
      legalState: "enjoined",
      highImpact: true,
      urgency: "urgent",
      relevance: "relevant",
      needsHumanReview: true,
    });
    expect(isHighImpact(classification)).toBe(true);
  });

  test("routes ambiguous student-status material to review without inflating urgency", () => {
    expect(classifyCandidate({
      title: "F-1 program update",
      excerpt: "The agency published an update for students.",
    }, { clock: fixedClock })).toMatchObject({
      relevance: "borderline",
      urgency: "low",
      needsHumanReview: true,
    });
  });

  test("recognizes direct student travel relevance without marking it high impact", () => {
    expect(classifyCandidate({
      title: "F-1 travel document reminder",
      excerpt: "Students should review their travel documents before departure.",
    }, { clock: fixedClock })).toMatchObject({
      topic: "travel-entry",
      relevance: "relevant",
      highImpact: false,
      urgency: "low",
    });
  });

  test("returns auditable confidence and matched terms", () => {
    const classification = classifyCandidate({
      title: "STEM OPT employment authorization filing deadline",
      excerpt: "F-1 students must use the new filing deadline.",
    }, { clock: fixedClock });

    expect(classification.confidence).toBeGreaterThan(0);
    expect(classification.confidence).toBeLessThanOrEqual(1);
    expect(classification.matchedTerms).toEqual(expect.arrayContaining([
      "f-1",
      "stem opt",
      "employment authorization",
      "filing deadline",
    ]));
  });
});
