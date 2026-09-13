import { load } from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 500;
const trackingParameter = /^(?:utm_.+|fbclid|gclid|msclkid|dclid|mc_cid|mc_eid)$/iu;
const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/u;
const isoTimestamp = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/u;
const rfc2822Timestamp = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\s+\d{2}:\d{2}(?::\d{2})?\s+(?:UT|UTC|GMT|[+-]\d{4})$/iu;

function adapterError(message) {
  return new Error(`Official feed is invalid: ${message}`);
}

function asList(value) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function validCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function capCodePoints(value, max = 500) {
  return Array.from(value.toWellFormed()).slice(0, max).join("");
}

export function normalizeWhitespace(value) {
  return typeof value === "string" ? value.toWellFormed().replace(/\s+/gu, " ").trim() : "";
}

function normalizeVisibleText(value) {
  return normalizeWhitespace(value).replace(/\s+([,.;:!?])/gu, "$1");
}

export function textValue(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  const ownText = ["#text", "__cdata", "#cdata"].map((key) => textValue(value[key])).filter(Boolean).join(" ");
  const childText = Object.entries(value)
    .filter(([key]) => !key.startsWith("@_") && !["#text", "__cdata", "#cdata"].includes(key))
    .map(([, child]) => textValue(child))
    .filter(Boolean)
    .join(" ");
  if (!ownText) return childText;
  if (!childText) return ownText;
  return ownText.replace(/([,.;:!?]+)$/u, ` ${childText}$1`);
}

function htmlFragmentText(value) {
  const $ = load(String(value ?? ""), { decodeEntities: true }, false);
  $("script, style, noscript, template").remove();
  return $.root().text();
}

export function plainText(value) {
  return normalizeVisibleText(htmlFragmentText(value));
}

export function excerptText(value) {
  return capCodePoints(plainText(value));
}

export function excerptFromDecodedText(value) {
  return capCodePoints(normalizeWhitespace(value));
}

export function sourceText(fetched) {
  const text = typeof fetched === "string" ? fetched : fetched?.text;
  if (typeof text !== "string") throw adapterError("response text is missing.");
  if (Buffer.byteLength(text, "utf8") > MAX_SOURCE_BYTES) {
    throw adapterError("response exceeds the five megabyte parsing limit.");
  }
  return text;
}

function allowedHosts(source) {
  return Array.isArray(source?.allowedHosts)
    ? source.allowedHosts.map((host) => typeof host === "string" ? host.toLowerCase() : "")
    : [];
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
  if (!allowedHosts(source).includes(url.hostname.toLowerCase())) {
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
  if (!allowedHosts(source).includes(url.hostname.toLowerCase())) {
    throw adapterError("item URL host is not allowlisted.");
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.href;
}

export function sourceDate(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;
  const dateMatch = isoDate.exec(normalized);
  if (dateMatch) return validCalendarDate(dateMatch[1], dateMatch[2], dateMatch[3]) ? normalized : null;
  const timestampMatch = isoTimestamp.exec(normalized);
  if (timestampMatch && validCalendarDate(timestampMatch[1], timestampMatch[2], timestampMatch[3])) {
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
  }
  const rfcMatch = rfc2822Timestamp.exec(normalized);
  if (rfcMatch) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    if (!validCalendarDate(rfcMatch[3], months.indexOf(rfcMatch[2].toLowerCase()) + 1, rfcMatch[1])) return null;
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString().slice(0, 10);
  }
  return null;
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
    return !rel || rel.toLowerCase() === "alternate";
  }) || links[0];
  return typeof alternate === "object" ? alternate["@_href"] : alternate;
}

function feedCandidate(entry, baseUrl, source, atom = false, ordered = {}) {
  if (!entry || typeof entry !== "object") throw adapterError("entry must be an object.");
  const title = requiredText(
    ordered.title ? orderedFieldText(ordered.title, atom ? "atom" : "rss-title") : entry.title,
    "entry title",
  );
  const canonicalUrl = approvedItemUrl(atom ? atomLink(entry) : entry.link, baseUrl, source);
  const externalId = normalizeWhitespace(textValue(atom ? entry.id : entry.guid)) || canonicalUrl;
  const excerpt = ordered.excerpt
    ? capCodePoints(orderedFieldText(ordered.excerpt, atom ? "atom" : "rss-html"))
    : excerptText(textValue(atom ? (entry.summary ?? entry.content) : (entry.description ?? entry.encoded ?? entry.content)));
  return {
    externalId,
    canonicalUrl,
    title,
    publisher: normalizeWhitespace(source?.publisher) || baseUrl.hostname,
    publishedAt: sourceDate(textValue(atom ? entry.published : (entry.pubDate ?? entry.date))),
    updatedAt: sourceDate(textValue(entry.updated)),
    effectiveAt: null,
    sourceDocumentType: normalizeWhitespace(source?.sourceDocumentType) || "Notice",
    docketNumber: null,
    regulationIdNumber: null,
    excerpt,
    normalizedText: excerpt,
  };
}

function parseXml(text, kind, preserveOrder = false) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw adapterError(`${kind} XML cannot contain entity declarations.`);
  if (XMLValidator.validate(text) !== true) throw adapterError(`${kind} XML is malformed.`);
  try {
    return new XMLParser({
      attributeNamePrefix: "@_",
      cdataPropName: "__cdata",
      ignoreAttributes: false,
      removeNSPrefix: true,
      preserveOrder,
      textNodeName: "#text",
      trimValues: false,
    }).parse(text);
  } catch {
    throw adapterError(`${kind} XML cannot be parsed.`);
  }
}

function directField(nodes, fieldNames) {
  for (const part of asList(nodes)) {
    if (!part || typeof part !== "object") continue;
    for (const [key, value] of Object.entries(part)) {
      if (fieldNames.has(key)) return value;
    }
  }
  return undefined;
}

function directElement(nodes, fieldNames) {
  for (const fieldName of fieldNames) {
    for (const part of asList(nodes)) {
      if (!part || typeof part !== "object" || !(fieldName in part)) continue;
      return {
        attributes: part[":@"] && typeof part[":@"] === "object" ? part[":@"] : {},
        children: part[fieldName],
      };
    }
  }
  return undefined;
}

function directChildren(nodes, name) {
  const children = [];
  for (const part of asList(nodes)) {
    if (!part || typeof part !== "object") continue;
    for (const [key, value] of Object.entries(part)) {
      if (key === name) children.push(value);
    }
  }
  return children;
}

function orderedSegments(value, cdata = false, segments = []) {
  if (typeof value === "string" || typeof value === "number") {
    segments.push({ cdata, text: String(value) });
    return segments;
  }
  if (!value || typeof value !== "object") return segments;
  for (const node of asList(value)) {
    if (!node || typeof node !== "object") continue;
    for (const [key, child] of Object.entries(node)) {
      if (key === ":@" || key.startsWith("@_") || ["script", "style", "noscript", "template"].includes(key)) continue;
      orderedSegments(child, cdata || key === "__cdata", segments);
    }
  }
  return segments;
}

function orderedField(record, names) {
  const element = directElement(record, names);
  if (!element) return undefined;
  const rawType = element.attributes["@_type"];
  return {
    segments: orderedSegments(element.children),
    type: typeof rawType === "string" ? rawType.trim().toLowerCase() : null,
  };
}

function segmentAwareText(segments) {
  return normalizeVisibleText(segments.map((segment) => segment.cdata ? htmlFragmentText(segment.text) : segment.text).join(""));
}

function orderedFieldText(field, format) {
  const joined = field.segments.map((segment) => segment.text).join("");
  if (format === "rss-html" || (format === "atom" && field.type === "html")) return plainText(joined);
  if (format === "atom" && field.type === "text") return normalizeVisibleText(joined);
  return segmentAwareText(field.segments);
}

function orderedRecord(record, atom) {
  return {
    title: orderedField(record, ["title"]),
    excerpt: orderedField(record, atom ? ["summary", "content"] : ["description", "encoded", "content"]),
  };
}

function orderedRecords(document, atom) {
  if (atom) return directChildren(directField(document, new Set(["feed"])), "entry");
  const rss = directField(document, new Set(["rss"]));
  if (rss !== undefined) return directChildren(directField(rss, new Set(["channel"])), "item");
  return directChildren(directField(document, new Set(["RDF"])), "item");
}

function feedEntries(parsed) {
  const rssItems = asList(parsed?.rss?.channel?.item);
  const rdfItems = asList(parsed?.RDF?.item);
  const atomEntries = asList(parsed?.feed?.entry);
  if (rssItems.length > 0) return { entries: rssItems, atom: false };
  if (rdfItems.length > 0) return { entries: rdfItems, atom: false };
  if (atomEntries.length > 0) return { entries: atomEntries, atom: true };
  throw adapterError("RSS or Atom entries are missing.");
}

export function createFeedAdapter() {
  return {
    async collect(source, fetched) {
      const text = sourceText(fetched);
      const baseUrl = sourceBaseUrl(source, fetched);
      const { entries, atom } = feedEntries(parseXml(text, "feed"));
      if (entries.length > MAX_ENTRIES) throw adapterError("entry count exceeds the parsing limit.");
      const ordered = orderedRecords(parseXml(text, "feed", true), atom);
      return entries.map((entry, index) => feedCandidate(entry, baseUrl, source, atom, orderedRecord(ordered[index], atom)));
    },
  };
}
