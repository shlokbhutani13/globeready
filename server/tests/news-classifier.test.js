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

  test("does not let effective language override a future effective date", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Final Rule",
      title: "F-1 duration of status rule takes effect immediately",
      effectiveAt: "2026-10-01",
    }, { clock: fixedClock })).toMatchObject({
      documentType: "final-rule",
      legalState: "scheduled",
    });
  });

  test("uses scheduled for a future-dated notice that contains effective language", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 policy takes effect",
      effectiveAt: "2026-10-01",
    }, { clock: fixedClock })).toMatchObject({ legalState: "scheduled" });
  });

  test.each(["final", "informational"])(
    "future effectiveAt overrides explicit source legal state %s",
    (sourceLegalState) => {
      expect(classifyCandidate({
        sourceDocumentType: "Notice",
        sourceLegalState,
        title: "F-1 policy update",
        effectiveAt: "2026-10-01",
      }, { clock: fixedClock })).toMatchObject({ legalState: "scheduled" });
    },
  );

  test("preserves a supported intervening state over a future schedule", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      sourceLegalState: "withdrawn",
      title: "F-1 policy withdrawn",
      effectiveAt: "2026-10-01",
    }, { clock: fixedClock })).toMatchObject({ legalState: "withdrawn" });
  });

  test("requires student or visa audience context for generic high-impact language", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "IRS filing fee notice",
      excerpt: "A new filing fee applies to corporate return preparers.",
    }, { clock: fixedClock })).toMatchObject({
      highImpact: true,
      relevance: "not-relevant",
    });

    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "F, M, and J student filing fee notice",
      excerpt: "International students in F, M, and J visa categories must use the new fee.",
    }, { clock: fixedClock })).toMatchObject({
      highImpact: true,
      relevance: "relevant",
      visaTypes: expect.arrayContaining(["f-1", "m-1", "j-1"]),
    });
  });

  test("does not treat a negated injunction as enjoined or urgent", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 program litigation update",
      excerpt: "No injunction applies to F-1 students.",
    }, { clock: fixedClock })).toMatchObject({
      legalState: "informational",
      urgency: "low",
      highImpact: false,
      relevance: "borderline",
    });
  });

  test.each([
    "The court did not issue an injunction affecting F-1 students.",
    "No court has issued an injunction affecting F-1 students.",
    "There are no changes to OPT eligibility for F-1 students.",
  ])("does not inflate a negated or non-change clause: %s", (excerpt) => {
    expect(classifyCandidate({ sourceDocumentType: "Notice", title: "F-1 update", excerpt }, { clock: fixedClock }))
      .toMatchObject({ highImpact: false, urgency: "low", relevance: "borderline" });
  });

  test("treats a post-term unchanged predicate as a non-change claim", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 program update",
      excerpt: "OPT eligibility remains unchanged for F-1 students.",
    }, { clock: fixedClock })).toMatchObject({
      highImpact: false,
      urgency: "low",
      relevance: "borderline",
    });
  });

  test.each([
    "No filing fee increase, and OPT eligibility expands for F-1 students.",
    "No injunction was issued. OPT eligibility expands for F-1 students.",
    "OPT eligibility remains unchanged; the filing fee increases for F-1 students.",
  ])("does not carry negation across an independent positive clause: %s", (excerpt) => {
    expect(classifyCandidate({ sourceDocumentType: "Notice", title: "F-1 update", excerpt }, { clock: fixedClock }))
      .toMatchObject({ highImpact: true, relevance: "relevant" });
  });

  test("preserves a positive injunction control", () => {
    expect(classifyCandidate({
      sourceDocumentType: "Notice",
      title: "F-1 court update",
      excerpt: "The court issued an injunction affecting F-1 students.",
    }, { clock: fixedClock })).toMatchObject({
      legalState: "enjoined",
      highImpact: true,
      urgency: "urgent",
      relevance: "relevant",
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
