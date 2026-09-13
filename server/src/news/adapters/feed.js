import { XMLParser, XMLValidator } from "fast-xml-parser";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 500;
const trackingParameter = /^(?:utm_.+|fbclid|gclid)$/iu;

function adapterError(message) {
  return new Error(`Official feed is invalid: ${message}`);
}

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  return textValue(value["#text"] ?? value.__cdata ?? value["#cdata"]);
}

export function normalizeWhitespace(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

export function plainText(value) {
  return normalizeWhitespace(String(value || "").replace(/<[^>]*>/gu, " "))
    .replace(/\s+([,.;:!?])/gu, "$1");
}

export function sourceText(fetched) {
  const text = typeof fetched === "string" ? fetched : fetched?.text;
  if (typeof text !== "string") throw adapterError("response text is missing.");
  if (Buffer.byteLength(text, "utf8") > MAX_SOURCE_BYTES) {
    throw adapterError("response exceeds the five megabyte parsing limit.");
  }
  return text;
}

export function sourceBaseUrl(source, fetched, label = "source") {
  const value = typeof fetched === "object" && typeof fetched?.finalUrl === "string"
    ? fetched.finalUrl
    : source?.url;
  if (typeof value !== "string" || !value) throw adapterError(`${label} URL is missing.`);

  let url;
  try {
    url = new URL(value);
  } catch {
    throw adapterError(`${label} URL is malformed.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw adapterError(`${label} URL is not an approved HTTPS URL.`);
  }

  const allowedHosts = Array.isArray(source?.allowedHosts)
    ? source.allowedHosts.map((host) => typeof host === "string" ? host.toLowerCase() : "")
    : [];
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw adapterError(`${label} host is not allowlisted.`);
  }
  return url;
}

export function approvedItemUrl(value, baseUrl, source) {
  if (typeof value !== "string" || !value.trim()) throw adapterError("item URL is missing.");

  let url;
  try {
    url = new URL(value.trim(), baseUrl);
  } catch {
    throw adapterError("item URL is malformed.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw adapterError("item URL is not an approved HTTPS URL.");
  }
  const allowedHosts = Array.isArray(source?.allowedHosts)
    ? source.allowedHosts.map((host) => typeof host === "string" ? host.toLowerCase() : "")
    : [];
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw adapterError("item URL host is not allowlisted.");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/{2,}/gu, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.href;
}

export function sourceDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
    const [year, month, day] = normalized.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? normalized
      : null;
  }
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
}

function requiredText(value, field) {
  const text = normalizeWhitespace(textValue(value));
  if (!text) throw adapterError(`${field} is missing.`);
  return text;
}

function atomLink(entry) {
  const links = asList(entry.link);
  const alternate = links.find((link) => {
    const rel = typeof link === "object" ? link["@_rel"] : null;
    return !rel || rel === "alternate";
  }) || links[0];
  return typeof alternate === "object" ? alternate["@_href"] : alternate;
}

function feedCandidate(entry, baseUrl, source, atom = false) {
  if (!entry || typeof entry !== "object") throw adapterError("entry must be an object.");
  const externalId = requiredText(atom ? entry.id : entry.guid, "entry identifier");
  const title = requiredText(entry.title, "entry title");
  const canonicalUrl = approvedItemUrl(atom ? atomLink(entry) : entry.link, baseUrl, source);
  const excerpt = plainText(textValue(atom ? (entry.summary ?? entry.content) : entry.description)).slice(0, 500);

  return {
    externalId,
    canonicalUrl,
    title,
    publisher: normalizeWhitespace(source?.publisher) || baseUrl.hostname,
    publishedAt: sourceDate(textValue(atom ? entry.published : entry.pubDate)),
    updatedAt: sourceDate(textValue(entry.updated)),
    effectiveAt: null,
    sourceDocumentType: normalizeWhitespace(source?.sourceDocumentType) || "Notice",
    docketNumber: null,
    regulationIdNumber: null,
    excerpt,
    normalizedText: excerpt,
  };
}

function parseXml(text, kind) {
  const validation = XMLValidator.validate(text);
  if (validation !== true) throw adapterError(`${kind} XML is malformed.`);
  try {
    return new XMLParser({
      attributeNamePrefix: "@_",
      cdataPropName: "__cdata",
      ignoreAttributes: false,
      textNodeName: "#text",
      trimValues: false,
    }).parse(text);
  } catch {
    throw adapterError(`${kind} XML cannot be parsed.`);
  }
}

export function createFeedAdapter() {
  return {
    async collect(source, fetched) {
      const text = sourceText(fetched);
      const baseUrl = sourceBaseUrl(source, fetched);
      const parsed = parseXml(text, "feed");
      const rssItems = asList(parsed?.rss?.channel?.item);
      const atomEntries = asList(parsed?.feed?.entry);
      if (rssItems.length === 0 && atomEntries.length === 0) {
        throw adapterError("RSS or Atom entries are missing.");
      }
      const entries = rssItems.length > 0 ? rssItems : atomEntries;
      if (entries.length > MAX_ENTRIES) throw adapterError("entry count exceeds the parsing limit.");
      return entries.map((entry) => feedCandidate(entry, baseUrl, source, atomEntries.length > 0 && rssItems.length === 0));
    },
  };
}
