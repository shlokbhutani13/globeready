import { describe, expect, it } from "vitest";
import { answerFromSources, buildCorpus, noSourceNotice } from "../lib/grounded-search";

const news = [
  { id: "n-reviewed", title: "Fixed admission periods replace duration of status", excerpt: "A final rule replaces duration of status with fixed admission periods.", publisher: "DHS", canonicalUrl: "https://www.federalregister.gov/d/x", sourceVerified: true, autoIngested: false, topics: ["status"], publishedAt: "2026-07-17" },
  { id: "n-auto", title: "SEVP updates certification expiration date process", excerpt: "SEVP posted a change to how certification expiration dates are handled.", publisher: "ICE SEVP", canonicalUrl: "https://www.ice.gov/sevis/x", sourceVerified: false, autoIngested: true, topics: ["university"], publishedAt: "2026-10-01" },
];
const ids = (question, extra = {}) => answerFromSources({ question, news, ...extra }).results.map((result) => result.id);

// [question, expectation]. A string must be the first result; an array lists ids that must all be in the top three; null means "no source".
const evaluation = [
  ["What is OPT?", "term:opt"], ["What is CPT?", "term:cpt"], ["What is STEM OPT", "term:stem-opt"], ["What is a DSO?", "term:dso"],
  ["What is SEVIS?", "term:sevis"], ["What is SEVP", "term:sevp"], ["What is an I-94?", "term:i94"], ["what is an I-20", "term:i20"],
  ["what is a ds-2019", "term:ds2019"], ["what is form 8843", "term:form-8843"], ["what is the SEVIS fee", "term:sevis-fee"],
  ["what is duration of status", "term:ds"], ["what is a travel signature", "term:travel-signature"],
  ["how do I set up a bank account", "guide:banking"], ["what should I bring to an SSN appointment", "guide:ssn"],
  ["health insurance for students", "guide:health"], ["who do I call in an emergency", "resource:call-911"],
  ["what is the 988 lifeline", "resource:lifeline-988"], ["how do I avoid immigration scams", "resource:uscis-scams"],
  ["how do I report fraud", "resource:ftc-report-fraud"], ["how do I get a social security number", ["rule:form-ss-5"]],
  ["what is the fixed admission period", ["rule:fixed-admission-final-rule"]], ["what is an extension of stay", ["rule:fixed-admission-final-rule"]],
  ["how to find housing", ["life:housing"]], ["am I eligible for opt", ["term:opt"]], ["can I work off campus", ["guide:cpt-opt"]],
  ["fixed admission periods final rule", ["news:n-reviewed"]], ["sevp certification expiration date", ["news:n-auto"]],
  ["what is the weather today", null], ["who will win the election", null], ["how do I get a green card", null], ["pizza recipe", null],
  ["asdf qwerty", null], ["what is H-1B", null], ["how much does opt cost", null], ["how do I renew my passport", null],
  ["j-1 academic training", null], ["what is a cap-gap", null], ["best phone to buy", null], ["translate this letter for me", null],
];

describe("Grounded search evaluation", () => {
  it("has at least 40 evaluated questions", () => expect(evaluation.length).toBeGreaterThanOrEqual(40));
  for (const [question, expected] of evaluation) {
    it(`${expected === null ? "refuses" : "answers"}: ${question}`, () => {
      const found = ids(question);
      if (expected === null) expect(found).toEqual([]);
      else if (typeof expected === "string") expect(found[0]).toBe(expected);
      else for (const id of expected) expect(found).toContain(id);
    });
  }
});

describe("Grounded search behavior", () => {
  it("never guesses: no match gives the refusal notice and no results", () => {
    const answer = answerFromSources({ question: "pizza recipe", news });
    expect(answer).toMatchObject({ kind: "sources", noMatch: true, evidence: "insufficient", answer: "", results: [] });
    expect(answer.notice).toBe(noSourceNotice);
  });

  it("labels every result with its source and trust level", () => {
    const answer = answerFromSources({ question: "fixed admission periods final rule", news });
    for (const result of answer.results) {
      expect(result.label).toBeTruthy();
      expect(result.publisher || result.internal).toBeTruthy();
      expect(result.url === "" || /^https:\/\//.test(result.url)).toBe(true);
    }
    const reviewed = answerFromSources({ question: "fixed admission periods", news }).results.find((r) => r.id === "news:n-reviewed");
    expect(reviewed.label).toMatch(/reviewed by GlobeReady/);
    const automatic = answerFromSources({ question: "sevp certification expiration date", news }).results.find((r) => r.id === "news:n-auto");
    expect(automatic.label).toMatch(/not yet reviewed by GlobeReady/);
  });

  it("adds the DSO note to questions about the person and keeps the existing referrals", () => {
    expect(answerFromSources({ question: "am I eligible for opt", news }).notice).toMatch(/DSO or a qualified attorney/);
    expect(answerFromSources({ question: "what is opt", news }).notice).not.toMatch(/Whether it applies to you/);
    expect(answerFromSources({ question: "what is my SEVIS status", news }).referral.message).toMatch(/DSO/);
  });

  it("hides F-1-only material from J-1 students and shows it to F-1 students", () => {
    const f1 = buildCorpus({ news: [], visaCategory: "f-1" }).map((entry) => entry.id);
    const j1 = buildCorpus({ news: [], visaCategory: "j-1" }).map((entry) => entry.id);
    expect(f1).toContain("guide:visa");
    expect(j1).not.toContain("guide:visa");
    expect(buildCorpus({ news: [], visaCategory: "" }).map((entry) => entry.id)).toContain("guide:visa");
  });

  it("rejects empty and over-long questions", () => {
    expect(() => answerFromSources({ question: "  " })).toThrow(/Enter a question/);
    expect(() => answerFromSources({ question: "x".repeat(501) })).toThrow(/500 characters/);
  });

  it("drops news items that are unsafe to link and never invents a URL", () => {
    const unsafe = [{ id: "bad", title: "Final rule fixed admission periods bad link", excerpt: "fixed admission periods", canonicalUrl: "javascript:alert(1)", sourceVerified: false, autoIngested: true }];
    const result = answerFromSources({ question: "fixed admission periods bad link", news: unsafe }).results.find((entry) => entry.id === "news:bad");
    expect(result.url).toBe("");
    expect(result.internal).toBe("/news/bad");
  });
});
