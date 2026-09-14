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

  test("rejects dates that do not occur in source metadata or source text", async () => {
    const result = await summarize(generated({
      plainLanguageSummary: "The new edition takes effect on 2026-11-01.",
    }));

    expect(result).toMatchObject({ ok: false, reviewRequired: true, publishable: false, draft: null });
    expect(result.error).toMatch(/date.*source/i);
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
