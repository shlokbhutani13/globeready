import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import { createFederalRegisterAdapter } from "../src/news/adapters/federal-register.js";

const fixedNow = () => new Date("2026-09-12T00:00:00Z");

async function readFixture() {
  return JSON.parse(await readFile(new URL("./fixtures/federal-register-results.json", import.meta.url)));
}

describe("Federal Register adapter", () => {
  test("maps Federal Register fields without inventing dates", async () => {
    const fixture = await readFixture();
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => fixture,
      now: fixedNow,
    });

    const candidates = await adapter.collect({
      id: "federal-register",
      agencies: ["homeland-security-department"],
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      externalId: "2026-14439",
      canonicalUrl: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/fixed-admission-periods-for-f-j-and-i-nonimmigrants",
      officialPdfUrl: "https://www.govinfo.gov/content/pkg/FR-2026-07-17/pdf/2026-14439.pdf",
      publisher: "Department of Homeland Security",
      publishedAt: "2026-07-17",
      updatedAt: null,
      effectiveAt: "2026-09-15",
      sourceDocumentType: "Rule",
      docketNumber: "ICEB-2025-0001",
      regulationIdNumber: "1653-AA95",
    });
    expect(candidates[1]).toMatchObject({
      externalId: "2026-14440",
      effectiveAt: null,
      regulationIdNumber: null,
    });
  });

  test("uses agency, publication-date, pagination, and explicit-field query parameters", async () => {
    const firstPage = { results: [], next_page_url: "https://www.federalregister.gov/api/v1/documents.json?page=2" };
    const secondPage = { results: [], next_page_url: null };
    const fetchJson = vi.fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    const adapter = createFederalRegisterAdapter({ fetchJson, now: fixedNow });

    await adapter.collect({
      id: "federal-register",
      agencies: ["homeland-security-department", "state-department"],
      lookbackDays: 30,
    });

    expect(fetchJson).toHaveBeenCalledTimes(2);
    const request = new URL(fetchJson.mock.calls[0][0]);
    expect(request.origin + request.pathname).toBe("https://www.federalregister.gov/api/v1/documents.json");
    expect(request.searchParams.getAll("conditions[agencies][]"))
      .toEqual(["homeland-security-department", "state-department"]);
    expect(request.searchParams.get("conditions[publication_date][gte]")).toBe("2026-08-13");
    expect(request.searchParams.get("per_page")).toBe("100");
    expect(request.searchParams.getAll("fields[]")).toEqual(expect.arrayContaining([
      "abstract",
      "agencies",
      "document_number",
      "docket_ids",
      "effective_on",
      "html_url",
      "pdf_url",
      "publication_date",
      "regulation_id_numbers",
      "title",
      "type",
    ]));
    expect(fetchJson.mock.calls[1][0]).toBe(firstPage.next_page_url);
  });

  test("stops after five pages", async () => {
    const pages = Array.from({ length: 6 }, (_, index) => ({
      results: [{
        document_number: `2026-${index}`,
        title: `Document ${index}`,
        agencies: [],
        abstract: "",
      }],
      next_page_url: `https://www.federalregister.gov/api/v1/documents.json?page=${index + 2}`,
    }));
    const fetchJson = vi.fn(async () => pages.shift());
    const adapter = createFederalRegisterAdapter({ fetchJson, now: fixedNow });

    const candidates = await adapter.collect({ id: "federal-register", agencies: [] });

    expect(fetchJson).toHaveBeenCalledTimes(5);
    expect(candidates.map((candidate) => candidate.externalId))
      .toEqual(["2026-0", "2026-1", "2026-2", "2026-3", "2026-4"]);
  });
});
