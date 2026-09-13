const DOCUMENTS_URL = "https://www.federalregister.gov/api/v1/documents.json";
const MAX_PAGES = 5;
const DEFAULT_LOOKBACK_DAYS = 90;
const FEDERAL_REGISTER_HOST = "www.federalregister.gov";
const GOVINFO_HOST = "www.govinfo.gov";
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

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function documentError(message) {
  return new Error(`Federal Register document is invalid: ${message}`);
}

function responseError(message) {
  return new Error(`Federal Register response is invalid: ${message}`);
}

function assertExpectedField(document, field, predicate) {
  if (!hasOwn(document, field) || !predicate(document[field])) {
    throw documentError(`expected ${field}.`);
  }
}

function parseHttpsUrl(value, host, label) {
  if (!isNonBlankString(value)) throw documentError(`${label} URL is missing.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw documentError(`${label} URL is malformed.`);
  }

  if (
    url.protocol !== "https:"
    || url.hostname !== host
    || url.username
    || url.password
    || url.port
    || url.search
    || url.hash
  ) {
    throw documentError(`${label} URL is not an approved official URL.`);
  }
  return url;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertCanonicalHtmlUrl(value, documentNumber) {
  const url = parseHttpsUrl(value, FEDERAL_REGISTER_HOST, "HTML");
  const path = new RegExp(
    `^/documents/\\d{4}/\\d{2}/\\d{2}/${escapeRegex(documentNumber)}/[a-z0-9]+(?:-[a-z0-9]+)*$`,
    "u",
  );
  if (!path.test(url.pathname)) throw documentError("HTML URL is outside the official document path.");
}

function assertOfficialPdfUrl(value, documentNumber) {
  const url = parseHttpsUrl(value, GOVINFO_HOST, "PDF");
  const path = new RegExp(
    `^/content/pkg/FR-\\d{4}-\\d{2}-\\d{2}/pdf/${escapeRegex(documentNumber)}\\.pdf$`,
    "u",
  );
  if (!path.test(url.pathname)) throw documentError("PDF URL is outside the official GovInfo package path.");
}

function publisherFor(agencies) {
  return agencies.map((agency) => isNonBlankString(agency.raw_name) ? agency.raw_name : agency.name).join(", ");
}

function firstString(values) {
  return values.find((value) => isNonBlankString(value)) ?? null;
}

function assertAgency(agency) {
  if (!isRecord(agency)) throw documentError("expected agency metadata.");
  if (
    (!hasOwn(agency, "raw_name") || (agency.raw_name !== null && typeof agency.raw_name !== "string"))
    || (!hasOwn(agency, "name") || (agency.name !== null && typeof agency.name !== "string"))
    || (!isNonBlankString(agency.raw_name) && !isNonBlankString(agency.name))
  ) {
    throw documentError("expected agency name metadata.");
  }
}

function assertStringArray(document, field) {
  assertExpectedField(document, field, (value) => Array.isArray(value) && value.every((entry) => typeof entry === "string"));
}

function assertDocument(document) {
  if (!isRecord(document)) throw documentError("expected an object row.");

  assertExpectedField(document, "document_number", isNonBlankString);
  assertExpectedField(document, "title", isNonBlankString);
  assertExpectedField(document, "abstract", (value) => value === null || typeof value === "string");
  assertExpectedField(document, "agencies", Array.isArray);
  if (document.agencies.length === 0) throw documentError("expected at least one agency.");
  document.agencies.forEach(assertAgency);
  assertStringArray(document, "docket_ids");
  assertStringArray(document, "regulation_id_numbers");
  assertExpectedField(document, "publication_date", (value) => value === null || typeof value === "string");
  assertExpectedField(document, "effective_on", (value) => value === null || typeof value === "string");
  assertExpectedField(document, "type", (value) => value === null || typeof value === "string");
  assertExpectedField(document, "html_url", isNonBlankString);
  assertExpectedField(document, "pdf_url", isNonBlankString);
  assertCanonicalHtmlUrl(document.html_url, document.document_number);
  assertOfficialPdfUrl(document.pdf_url, document.document_number);
}

function assertResponse(response) {
  if (!isRecord(response) || !Array.isArray(response.results)) {
    throw responseError("expected an object with a results array.");
  }
  if (!hasOwn(response, "next_page_url") || (response.next_page_url !== null && typeof response.next_page_url !== "string")) {
    throw responseError("expected next_page_url to be a string or null.");
  }
}

function requestKey(value) {
  const url = new URL(value);
  const query = [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return `${url.origin}${url.pathname}?${new URLSearchParams(query)}`;
}

function paginationUrl(value) {
  if (value === null) return null;
  if (!isNonBlankString(value)) throw new Error("Federal Register pagination URL is invalid.");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Federal Register pagination URL is invalid.");
  }
  if (
    url.protocol !== "https:"
    || url.hostname !== FEDERAL_REGISTER_HOST
    || url.username
    || url.password
    || url.port
    || url.hash
  ) {
    throw new Error("Federal Register pagination URL is invalid.");
  }

  const isJsonPath = url.pathname === "/api/v1/documents.json";
  const isFormatJsonPath = url.pathname === "/api/v1/documents"
    && url.searchParams.getAll("format").length === 1
    && url.searchParams.get("format") === "json";
  if (!isJsonPath && !isFormatJsonPath) {
    throw new Error("Federal Register pagination URL has an unexpected path.");
  }

  const request = new URL(DOCUMENTS_URL);
  for (const [key, entry] of url.searchParams) {
    if (key !== "format") request.searchParams.append(key, entry);
  }
  return request.href;
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
  assertDocument(document);
  const abstract = document.abstract || "";
  return {
    externalId: document.document_number,
    canonicalUrl: document.html_url,
    officialPdfUrl: document.pdf_url,
    title: document.title,
    publisher: publisherFor(document.agencies),
    publishedAt: document.publication_date,
    updatedAt: null,
    effectiveAt: document.effective_on,
    sourceDocumentType: document.type,
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
      const requestedPages = new Set();

      for (let page = 0; page < MAX_PAGES && requestUrl; page += 1) {
        const key = requestKey(requestUrl);
        if (requestedPages.has(key)) break;
        requestedPages.add(key);

        const response = await fetchJson(requestUrl);
        assertResponse(response);
        for (const document of response.results) {
          candidates.push(mapDocument(document));
        }
        requestUrl = paginationUrl(response.next_page_url);
      }

      return candidates;
    },
  };
}
