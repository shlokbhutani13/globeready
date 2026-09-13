import { readFile } from "node:fs/promises";

import { describe, expect, test, vi } from "vitest";

import { createFederalRegisterAdapter } from "../src/news/adapters/federal-register.js";
import { normalizeNewsCandidate } from "../src/news/schema.js";

const fixedNow = () => new Date("2026-09-12T00:00:00Z");

async function readFixture() {
  return JSON.parse(await readFile(new URL("./fixtures/federal-register-results.json", import.meta.url)));
}

function documentResult(documentNumber, index) {
  return {
    abstract: "Official abstract",
    agencies: [{ name: "Test Agency", raw_name: "TEST AGENCY" }],
    document_number: documentNumber,
    docket_ids: [],
    effective_on: null,
    html_url: `https://www.federalregister.gov/documents/2026/07/17/${documentNumber}/document-${index}`,
    pdf_url: `https://www.govinfo.gov/content/pkg/FR-2026-07-17/pdf/${documentNumber}.pdf`,
    publication_date: "2026-07-17",
    regulation_id_numbers: [],
    title: `Document ${index}`,
    type: "Notice",
  };
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
      canonicalUrl: "https://www.federalregister.gov/documents/2026/07/17/2026-14439/establishing-a-fixed-time-period-of-admission-and-an-extension-of-stay-procedure-for-nonimmigrant",
      officialPdfUrl: "https://www.govinfo.gov/content/pkg/FR-2026-07-17/pdf/2026-14439.pdf",
      title: "Establishing a Fixed Time Period of Admission and an Extension of Stay Procedure for Nonimmigrant Academic Students, Exchange Visitors, and Representatives of Foreign Information Media",
      publisher: "DEPARTMENT OF HOMELAND SECURITY",
      publishedAt: "2026-07-17",
      updatedAt: null,
      effectiveAt: "2026-09-15",
      sourceDocumentType: "Rule",
      docketNumber: "DHS Docket No. ICEB-2025-0001",
      regulationIdNumber: "1653-AA95",
      excerpt: "The Department of Homeland Security (DHS) is amending its regulations to change the admission period in the F, J, and I classifications from duration of status to an admission for a fixed time period, and additional changes to admission and extension requirements. This final rule will provide additional protections and oversight of these nonimmigrant categories and will allow DHS to better evaluate whether these nonimmigrants are maintaining status while temporarily in the United States. This final rule provides amendments to the proposed rule covering this topic that was published in the Federal Register on August 28, 2025.",
      normalizedText: "The Department of Homeland Security (DHS) is amending its regulations to change the admission period in the F, J, and I classifications from duration of status to an admission for a fixed time period, and additional changes to admission and extension requirements. This final rule will provide additional protections and oversight of these nonimmigrant categories and will allow DHS to better evaluate whether these nonimmigrants are maintaining status while temporarily in the United States. This final rule provides amendments to the proposed rule covering this topic that was published in the Federal Register on August 28, 2025.",
    });
    expect(candidates[1]).toMatchObject({
      externalId: "2026-14440",
      publisher: "DEPARTMENT OF HEALTH AND HUMAN SERVICES, Food and Drug Administration",
      title: "Agency Information Collection Activities; Proposed Collection; Comment Request; Adverse Event Program for Medical Devices: (Medical Product Safety Network (MedSun))",
      publishedAt: "2026-07-17",
      effectiveAt: null,
      regulationIdNumber: null,
    });
    expect(normalizeNewsCandidate(candidates[0], { id: "federal-register", verified: true }))
      .toMatchObject({
        sourceKey: "federal-register:2026-14439",
        title: "Establishing a Fixed Time Period of Admission and an Extension of Stay Procedure for Nonimmigrant Academic Students, Exchange Visitors, and Representatives of Foreign Information Media",
        publisher: "DEPARTMENT OF HOMELAND SECURITY",
        publishedAt: "2026-07-17",
        effectiveAt: "2026-09-15",
        docketNumber: "DHS Docket No. ICEB-2025-0001",
        regulationIdNumber: "1653-AA95",
      });
  });

  test("uses the agency display name when raw agency metadata is blank", async () => {
    const fixture = await readFixture();
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({
        results: [{
          ...fixture.results[0],
          agencies: [{ raw_name: " ", name: "Homeland Security Department" }],
        }],
        next_page_url: null,
      }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .resolves.toEqual([expect.objectContaining({ publisher: "Homeland Security Department" })]);
  });

  test.each([
    ["only raw_name", [{ raw_name: "Office of Inspector General" }], "Office of Inspector General"],
    ["only name", [{ name: "Office of Inspector General" }], "Office of Inspector General"],
    [
      "multiple partial agency entries",
      [{ raw_name: "DEPARTMENT OF TREASURY" }, { name: "Office of Inspector General" }],
      "DEPARTMENT OF TREASURY, Office of Inspector General",
    ],
  ])("maps agencies with %s", async (_description, agencies, publisher) => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({
        results: [{ ...documentResult("2026-18614", "inspector-general"), agencies }],
        next_page_url: null,
      }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .resolves.toEqual([expect.objectContaining({ publisher })]);
  });

  test("accepts a terminal response that omits next_page_url", async () => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({ results: [] }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] })).resolves.toEqual([]);
  });

  test("rejects a non-string non-null next_page_url", async () => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({ results: [], next_page_url: 2 }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/next_page_url/i);
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
      results: [documentResult(`2026-${index}`, index)],
      next_page_url: `https://www.federalregister.gov/api/v1/documents.json?page=${index + 2}`,
    }));
    const fetchJson = vi.fn(async () => pages.shift());
    const adapter = createFederalRegisterAdapter({ fetchJson, now: fixedNow });

    const candidates = await adapter.collect({ id: "federal-register", agencies: [] });

    expect(fetchJson).toHaveBeenCalledTimes(5);
    expect(candidates.map((candidate) => candidate.externalId))
      .toEqual(["2026-0", "2026-1", "2026-2", "2026-3", "2026-4"]);
  });

  test("reconstructs official format=json pagination onto the documents JSON endpoint", async () => {
    const fetchJson = vi.fn()
      .mockResolvedValueOnce({
        results: [],
        next_page_url: "https://www.federalregister.gov/api/v1/documents?format=json&page=2",
      })
      .mockResolvedValueOnce({ results: [], next_page_url: null });
    const adapter = createFederalRegisterAdapter({ fetchJson, now: fixedNow });

    await adapter.collect({ id: "federal-register", agencies: [] });

    const secondRequest = new URL(fetchJson.mock.calls[1][0]);
    expect(secondRequest.origin + secondRequest.pathname)
      .toBe("https://www.federalregister.gov/api/v1/documents.json");
    expect(secondRequest.searchParams.get("page")).toBe("2");
    expect(secondRequest.searchParams.get("format")).toBeNull();
  });

  test.each([
    ["an HTTP pagination URL", "http://www.federalregister.gov/api/v1/documents.json?page=2"],
    ["an off-domain pagination URL", "https://attacker.example/api/v1/documents.json?page=2"],
    ["pagination credentials", "https://user@www.federalregister.gov/api/v1/documents.json?page=2"],
    ["a pagination port", "https://www.federalregister.gov:444/api/v1/documents.json?page=2"],
    ["an explicit default pagination port", "https://WWW.FEDERALREGISTER.GOV:443/api/v1/documents.json?page=2"],
    ["credentials that resemble a host and port", "https://www.federalregister.gov:443@www.federalregister.gov/api/v1/documents.json?page=2"],
    ["an unexpected pagination path", "https://www.federalregister.gov/documents/2026/07/17/2026-14439/x"],
  ])("rejects %s", async (_description, nextPageUrl) => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({ results: [], next_page_url: nextPageUrl }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/pagination/i);
  });

  test("stops a repeated pagination cycle", async () => {
    const fetchJson = vi.fn(async (url) => ({ results: [], next_page_url: url }));
    const adapter = createFederalRegisterAdapter({ fetchJson, now: fixedNow });

    await expect(adapter.collect({ id: "federal-register", agencies: [] })).resolves.toEqual([]);
    expect(fetchJson).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["a null payload", null],
    ["an array payload", []],
    ["a primitive payload", "documents"],
    ["a payload without results", {}],
    ["a payload with a non-array results value", { results: {} }],
  ])("rejects %s", async (_description, payload) => {
    const adapter = createFederalRegisterAdapter({ fetchJson: async () => payload, now: fixedNow });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/response/i);
  });

  test("rejects a partial row instead of emitting a partial candidate", async () => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({ results: [{ document_number: "2026-14439" }], next_page_url: null }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/document/i);
  });

  test.each([
    ["a null row", null],
    ["an empty row", {}],
    ["a primitive row", "document"],
  ])("rejects %s instead of emitting a candidate", async (_description, row) => {
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({ results: [row], next_page_url: null }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/document/i);
  });

  test.each([
    ["a missing external ID", { document_number: null }],
    ["a blank title", { title: " " }],
    ["a non-array agency value", { agencies: "DHS" }],
    ["a non-array docket value", { docket_ids: "ICEB-2025-0001" }],
  ])("rejects %s instead of emitting a partial candidate", async (_description, overrides) => {
    const fixture = await readFixture();
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({
        results: [{ ...fixture.results[0], ...overrides }],
        next_page_url: null,
      }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/document/i);
  });

  test.each([
    ["an off-domain HTML URL", { html_url: "https://attacker.example/documents/2026/07/17/2026-14439/x" }],
    ["an HTTP HTML URL", { html_url: "http://www.federalregister.gov/documents/2026/07/17/2026-14439/x" }],
    ["an HTML URL outside the document path", { html_url: "https://www.federalregister.gov/agencies/homeland-security-department" }],
    ["an HTML URL with an explicit default port", { html_url: "https://www.federalregister.gov:443/documents/2026/07/17/2026-14439/x" }],
    ["HTML URL credentials that resemble a host and port", { html_url: "https://www.federalregister.gov:443@www.federalregister.gov/documents/2026/07/17/2026-14439/x" }],
    ["an off-domain PDF URL", { pdf_url: "https://attacker.example/2026-14439.pdf" }],
    ["an HTTP PDF URL", { pdf_url: "http://www.govinfo.gov/content/pkg/FR-2026-07-17/pdf/2026-14439.pdf" }],
    ["a PDF URL outside the GovInfo package path", { pdf_url: "https://www.govinfo.gov/content/pkg/FR-2026-07-17/html/2026-14439.htm" }],
    ["a PDF URL with an explicit default port", { pdf_url: "https://www.govinfo.gov:443/content/pkg/FR-2026-07-17/pdf/2026-14439.pdf" }],
    ["PDF URL credentials that resemble a host and port", { pdf_url: "https://www.govinfo.gov:443@www.govinfo.gov/content/pkg/FR-2026-07-17/pdf/2026-14439.pdf" }],
  ])("rejects %s", async (_description, overrides) => {
    const fixture = await readFixture();
    const adapter = createFederalRegisterAdapter({
      fetchJson: async () => ({
        results: [{ ...fixture.results[0], ...overrides }],
        next_page_url: null,
      }),
      now: fixedNow,
    });

    await expect(adapter.collect({ id: "federal-register", agencies: [] }))
      .rejects.toThrow(/URL|document/i);
  });
});
