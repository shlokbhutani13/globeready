const DOCUMENTS_URL = "https://www.federalregister.gov/api/v1/documents.json";
const MAX_PAGES = 5;
const DEFAULT_LOOKBACK_DAYS = 90;
const fields = [
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
];

function firstString(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.find((entry) => typeof entry === "string" && entry.trim())?.trim() ?? null;
}

function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value) {
  const result = stringOrEmpty(value);
  return result || null;
}

function publisherFor(agencies) {
  if (!Array.isArray(agencies)) return "";
  return agencies
    .map((agency) => stringOrEmpty(agency?.raw_name) || stringOrEmpty(agency?.name))
    .filter(Boolean)
    .join(", ");
}

function lowerBound(now, lookbackDays) {
  const date = new Date(now());
  if (Number.isNaN(date.valueOf())) throw new Error("Federal Register adapter received an invalid clock date.");

  const days = Number.isInteger(lookbackDays) && lookbackDays >= 0
    ? lookbackDays
    : DEFAULT_LOOKBACK_DAYS;
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function initialUrl(source, now) {
  const url = new URL(DOCUMENTS_URL);
  for (const agency of source?.agencies || []) {
    if (typeof agency === "string" && agency.trim()) {
      url.searchParams.append("conditions[agencies][]", agency.trim());
    }
  }
  url.searchParams.set(
    "conditions[publication_date][gte]",
    lowerBound(now, source?.lookbackDays),
  );
  url.searchParams.set("per_page", "100");
  for (const field of fields) url.searchParams.append("fields[]", field);
  return url.href;
}

function mapDocument(document = {}) {
  const abstract = stringOrEmpty(document.abstract);
  return {
    externalId: stringOrEmpty(document.document_number),
    canonicalUrl: stringOrEmpty(document.html_url),
    officialPdfUrl: stringOrEmpty(document.pdf_url),
    title: stringOrEmpty(document.title),
    publisher: publisherFor(document.agencies),
    publishedAt: stringOrNull(document.publication_date),
    updatedAt: null,
    effectiveAt: stringOrNull(document.effective_on),
    sourceDocumentType: stringOrNull(document.type),
    docketNumber: firstString(document.docket_ids),
    regulationIdNumber: firstString(document.regulation_id_numbers),
    excerpt: abstract,
    normalizedText: abstract,
  };
}

export function createFederalRegisterAdapter({ fetchJson, now = () => new Date() } = {}) {
  if (typeof fetchJson !== "function") {
    throw new Error("Federal Register adapter requires a fetchJson function.");
  }
  if (typeof now !== "function") {
    throw new Error("Federal Register adapter clock must be a function.");
  }

  return {
    async collect(source) {
      const candidates = [];
      let requestUrl = initialUrl(source, now);

      for (let page = 0; page < MAX_PAGES && requestUrl; page += 1) {
        const response = await fetchJson(requestUrl);
        for (const document of Array.isArray(response?.results) ? response.results : []) {
          candidates.push(mapDocument(document));
        }
        requestUrl = typeof response?.next_page_url === "string" && response.next_page_url
          ? response.next_page_url
          : null;
      }

      return candidates;
    },
  };
}
