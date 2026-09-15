import { describe, expect, test } from "vitest";

import { createNewsSummarizer } from "../src/news/summarizer.js";

const candidate = {
  canonicalUrl: "https://www.uscis.gov/newsroom/alerts/form-i-765-update",
  title: "Form I-765 update",
  excerpt: "The new edition takes effect on 2026-10-01.",
  normalizedText: "USCIS published a new Form I-765 edition. The new edition takes effect on 2026-10-01.",
  publishedAt: "2026-09-14",
  effectiveAt: "2026-10-01",
};

function generated(overrides = {}) {
  return JSON.stringify({
    plainLanguageSummary: "USCIS says the new Form I-765 edition takes effect on 2026-10-01.",
    urgency: "high",
    impactAreas: ["forms-fees"],
    visaTypes: ["f-1"],
    topics: ["forms-fees"],
    actions: [{
      label: "Review official instructions",
      sourceUrl: candidate.canonicalUrl,
    }],
    ...overrides,
  });
}

async function summarize(output) {
  return createNewsSummarizer({ generate: async () => output }).summarize(candidate, {
    verifiedDomains: ["www.uscis.gov", "www.govinfo.gov"],
  });
}

describe("source-bound generated news summaries", () => {
  test("returns a valid generated summary only as a review-required draft", async () => {
    await expect(summarize(generated())).resolves.toMatchObject({
      ok: true,
      reviewRequired: true,
      publishable: false,
      draft: {
        plainLanguageSummary: expect.stringContaining("2026-10-01"),
        urgency: "high",
      },
    });
  });

  test("rejects generated URLs outside the verified official registry", async () => {
    const result = await summarize(generated({
      actions: [{ label: "Apply now", sourceUrl: "https://www.uscis.gov.attacker.example/apply" }],
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/verified official URL/i);
  });

  test("rejects a non-HTTPS action URL even when free-text URL extraction would miss it", async () => {
    const result = await summarize(generated({
      actions: [{ label: "Apply now", sourceUrl: "javascript:alert(1)" }],
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/verified official URL/i);
  });

  test("does not trust an off-registry candidate canonical URL", async () => {
    const hostile = { ...candidate, canonicalUrl: "https://attacker.example/apply" };
    const summarizer = createNewsSummarizer({ generate: async () => generated({
      actions: [{ label: "Apply", sourceUrl: hostile.canonicalUrl }],
    }) });

    const result = await summarizer.summarize(hostile, { verifiedDomains: ["www.uscis.gov"] });

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/verified official URL/i);
  });

  test.each(["javascript:alert(1)", "data:text/html,owned", "file:///etc/passwd", "vbscript:msgbox(1)", "webcal://attacker.example", "javascript&#58;alert(1)"])(
    "rejects dangerous URI scheme %s anywhere in generated text",
    async (uri) => {
      const result = await summarize(generated({
        plainLanguageSummary: `Use [official instructions](${uri}) for this update.`,
      }));

      expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
      expect(result.error).toMatch(/URL|scheme/i);
    },
  );

  test.each([
    "javascript\n:alert(1)",
    "java\tscript:alert(1)",
    "data\r\n:text/html,owned",
    "file\u0000:///etc/passwd",
    "gopher\v:\f//attacker.example",
    "http\n:\t//attacker.example",
    "javascript\u007f:alert(1)",
    "http\u007f ://attacker.example",
    "javascript&#9;:alert(1)",
  ])("rejects a control-folded dangerous URI %s", async (uri) => {
    const result = await summarize(generated({
      plainLanguageSummary: `Use [official instructions](${uri}) for this update.`,
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/URL|scheme/i);
  });

  test("rejects dates that do not occur in source metadata or source text", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "The new edition takes effect on 2026-11-01.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/date.*source/i);
  });

  test("accepts an unambiguous natural-language rendering of a source date", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "USCIS says the new edition takes effect on October 1, 2026.",
    }));

    expect(result).toMatchObject({ ok: true, reviewRequired: true, publishable: false });
  });

  test("accepts a common abbreviated official date rendering", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "USCIS says the new edition takes effect on Oct. 1, 2026.",
    }));

    expect(result).toMatchObject({ ok: true, reviewRequired: true, publishable: false });
  });

  test("normalizes an ordinal-of-month official date", async () => {
    const ordinalCandidate = {
      ...candidate,
      excerpt: "The edition takes effect on 2026-09-16.",
      normalizedText: "The edition takes effect on 2026-09-16.",
      effectiveAt: "2026-09-16",
    };
    const summarizer = createNewsSummarizer({ generate: async () => generated({
      plainLanguageSummary: "The edition takes effect on the 16th of September, 2026.",
    }) });

    await expect(summarizer.summarize(ordinalCandidate, { verifiedDomains: ["www.uscis.gov"] }))
      .resolves.toMatchObject({ ok: true, reviewRequired: true, publishable: false });
  });

  test("normalizes a month-the-ordinal official date", async () => {
    const ordinalCandidate = {
      ...candidate,
      excerpt: "The edition takes effect on 2026-09-16.",
      normalizedText: "The edition takes effect on 2026-09-16.",
      effectiveAt: "2026-09-16",
    };
    const summarizer = createNewsSummarizer({ generate: async () => generated({
      plainLanguageSummary: "The edition takes effect on September the 16th, 2026.",
    }) });

    await expect(summarizer.summarize(ordinalCandidate, { verifiedDomains: ["www.uscis.gov"] }))
      .resolves.toMatchObject({ ok: true, reviewRequired: true, publishable: false });
  });

  test("rejects an unsupported month-the-ordinal substitution", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "The edition takes effect on October the 2nd, 2026.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/date.*source/i);
  });

  test("rejects an unsupported ordinal-of-month substitution", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "The edition takes effect on the 16th of September, 2026.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/date.*source/i);
  });

  test.each([
    "today",
    "tomorrow",
    "next week",
    "two days from now",
    "the following day",
    "next day",
    "previous week",
    "the following month",
  ])(
    "fails closed on relative temporal claim %s",
    async (relative) => {
      const result = await summarize(generated({
        plainLanguageSummary: `USCIS says the new edition takes effect ${relative}.`,
      }));

      expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
      expect(result.error).toMatch(/relative|temporal/i);
    },
  );

  test("accepts an exact source-bound relative temporal phrase", async () => {
    const relativeCandidate = {
      ...candidate,
      excerpt: "USCIS says the filing window opens two days from now.",
      normalizedText: "USCIS says the filing window opens two days from now.",
    };
    const summarizer = createNewsSummarizer({ generate: async () => generated({
      plainLanguageSummary: "USCIS says the filing window opens two days from now.",
    }) });

    await expect(summarizer.summarize(relativeCandidate, { verifiedDomains: ["www.uscis.gov"] }))
      .resolves.toMatchObject({ ok: true, reviewRequired: true, publishable: false });
  });

  test("rejects a substituted natural-language date", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "USCIS says the new edition takes effect on November 1, 2026.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/date.*source/i);
  });

  test("fails closed on ambiguous numeric dates", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "USCIS says the new edition takes effect on 10/01/2026.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false });
    expect(result.error).toMatch(/ambiguous date/i);
  });

  test("rejects unknown values in closed enum fields without coercion", async () => {
    const result = await summarize(generated({ urgency: "extreme" }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/urgency/i);
  });

  test("rejects malformed generated JSON as a review-only failure", async () => {
    const result = await summarize("{not-json");

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/json/i);
  });

  test("rejects an attempted generated approval field", async () => {
    const parsed = JSON.parse(generated());
    parsed.editorialState = "approved";
    const result = await summarize(JSON.stringify(parsed));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/unknown field/i);
  });
});
