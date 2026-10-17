import { createHash } from "node:crypto";

import { load } from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const maxResponseBytes = 5 * 1024 * 1024;
const maxItems = 100;
const trackingKey = /^(?:utm_.+|fbclid|gclid|msclkid|mc_.+)$/iu;
const topicRules = Object.freeze([
  ["status", /\b(?:visa|immigration|sevis|i-20|ds-2019|duration of status|f-1|f-2|j-1|j-2|m-1|m-2)\b/iu],
  ["employment", /\b(?:stem opt|opt|cpt|practical training|work authorization|employment authorization|ead|i-765|internship|h-1b|cap-gap)\b/iu],
  ["travel-entry", /\b(?:travel|re-entry|entry document|port of entry|visa interview|consular|consulate|embassy|passport|travel signature|visa bond)\b/iu],
  ["taxes-social-security", /\b(?:tax|taxes|irs|1040-nr|1040nr|itin|nonresident alien|social security|ssn)\b/iu],
  ["university", /\b(?:international students?|international office|iso|dso|campus|university|college|school certification|orientation|enrollment)\b/iu],
]);
const visaRules = Object.freeze([
  ["f-1", /\bf[ -]?1\b/iu], ["f-2", /\bf[ -]?2\b/iu],
  ["j-1", /\bj[ -]?1\b/iu], ["j-2", /\bj[ -]?2\b/iu],
  ["m-1", /\bm[ -]?1\b/iu], ["m-2", /\bm[ -]?2\b/iu],
]);

const list = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const textOf = (value) => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  return Object.entries(value).filter(([key]) => !key.startsWith("@_")).map(([, child]) => textOf(child)).join(" ");
};
const keywordPattern = (value) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:$|[^\\p{L}\\p{N}])`, "iu");

export function sanitizeText(value, max = 500) {
  const $ = load(String(value ?? ""), { decodeEntities: true }, false);
  $("script, style, noscript, template").remove();
  return Array.from($.root().text().toWellFormed().replace(/\s+/gu, " ").trim()).slice(0, max).join("");
}

export function sanitizeExcerpt(value) {
  return sanitizeText(value, 300);
}

function allowedUrl(value, base, hosts, label) {
  let url;
  try { url = new URL(String(value || "").trim(), base); }
  catch { throw new Error(`${label} URL is invalid.`); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname.toLowerCase())) {
    throw new Error(`${label} URL must be HTTPS and use an allowlisted host.`);
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (trackingKey.test(key)) url.searchParams.delete(key);
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.href;
}

function maybeUrl(value, base, hosts, label) {
  if (!value) return null;
  try { return allowedUrl(value, base, hosts, label); }
  catch { return null; }
}

function dateOnly(value) {
  if (!value) return null;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

export function stableStoryId(sourceId, canonicalUrl) {
  return `auto-${sourceId}-${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 20)}`;
}

export function classifyAutoStory({ title = "", excerpt = "" } = {}) {
  const evidence = `${sanitizeText(title, 300)} ${sanitizeExcerpt(excerpt)}`;
  return {
    topics: topicRules.filter(([, pattern]) => pattern.test(evidence)).map(([topic]) => topic),
    visaTypes: visaRules.filter(([, pattern]) => pattern.test(evidence)).map(([visa]) => visa),
  };
}

export function qualifyAutoStory(source = {}, item = {}) {
  const classification = classifyAutoStory(item);
  if (!classification.topics.length) return null;
  const evidence = `${item.title || ""} ${item.excerpt || ""}`;
  const keywords = Array.isArray(source.includeKeywords) ? source.includeKeywords.map(keywordPattern) : [];
  const studentContext = Array.isArray(source.studentContextKeywords) ? source.studentContextKeywords.map(keywordPattern) : [];
  if (keywords.length && !keywords.some((keyword) => keyword.test(evidence))) return null;
  if (studentContext.length && !studentContext.some((keyword) => keyword.test(evidence))) return null;
  return { ...item, ...classification };
}

function imageRecord(url, alt, source, base) {
  const safe = maybeUrl(url, base, source.imageHosts || source.allowedHosts, "Image");
  return safe ? { url: safe, alt: sanitizeText(alt || "", 300) || "Illustration from the original source" } : undefined;
}

export function extractLeadImage(source, html, pageUrl, fallbackAlt = "") {
  const $ = load(String(html || ""), { decodeEntities: true });
  const imageUrl = $("meta[property='og:image']").first().attr("content")
    || $("meta[name='twitter:image']").first().attr("content");
  const imageAlt = $("meta[property='og:image:alt']").first().attr("content")
    || $("meta[name='twitter:image:alt']").first().attr("content")
    || fallbackAlt;
  return imageRecord(imageUrl, imageAlt, source, new URL(pageUrl));
}

function story(source, input, base) {
  const title = sanitizeText(input.title, 300);
  if (!title) throw new Error("Story title is missing.");
  const canonicalUrl = allowedUrl(input.url, base, source.allowedHosts, "Story");
  const excerpt = sanitizeExcerpt(input.excerpt);
  const classification = classifyAutoStory({ title, excerpt });
  return {
    id: stableStoryId(source.id, canonicalUrl),
    sourceId: source.id,
    publisher: source.name,
    title,
    canonicalUrl,
    publishedAt: dateOnly(input.date),
    excerpt,
    topics: classification.topics,
    visaTypes: classification.visaTypes,
    ...(imageRecord(input.imageUrl, input.imageAlt || title, source, base) ? { image: imageRecord(input.imageUrl, input.imageAlt || title, source, base) } : {}),
    editorialState: "source-only",
    legalState: "informational",
    sourceVerified: false,
    trustLabel: "From official source — not yet reviewed by GlobeReady",
    autoIngested: true,
  };
}

function xmlEntries(source, text, base) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text) || XMLValidator.validate(text) !== true) throw new Error("Feed XML is invalid.");
  const parsed = new XMLParser({ attributeNamePrefix: "@_", cdataPropName: "__cdata", ignoreAttributes: false, removeNSPrefix: true, trimValues: false }).parse(text);
  const atom = source.type === "atom" || Boolean(parsed.feed);
  const entries = atom ? list(parsed?.feed?.entry) : list(parsed?.rss?.channel?.item ?? parsed?.RDF?.item);
  if (!entries.length) throw new Error("Feed has no entries.");
  return entries.slice(0, source.itemLimit || maxItems).flatMap((entry) => {
    const links = list(entry.link);
    const link = atom
      ? links.find((candidate) => typeof candidate === "object" && (!candidate["@_rel"] || candidate["@_rel"] === "alternate")) || links[0]
      : entry.link;
    const url = typeof link === "object" ? link["@_href"] : textOf(link);
    const enclosure = list(entry.enclosure).find((candidate) => String(candidate?.["@_type"] || "").startsWith("image/"));
    const media = list(entry.content).find((candidate) => String(candidate?.["@_type"] || "").startsWith("image/"));
    const atomImage = links.find((candidate) => typeof candidate === "object" && candidate["@_rel"] === "enclosure" && String(candidate["@_type"] || "").startsWith("image/"));
    const summaryValue = entry.summary ?? entry.description ?? entry.encoded ?? entry.content;
    const summaryHtml = textOf(summaryValue);
    const embeddedImage = load(summaryHtml, { decodeEntities: true }, false)("img[src]").first().attr("src");
    try {
      return [story(source, {
        title: textOf(entry.title), url,
        date: textOf(entry.published ?? entry.updated ?? entry.pubDate ?? entry.date),
        excerpt: summaryHtml,
        imageUrl: enclosure?.["@_url"] || media?.["@_url"] || atomImage?.["@_href"] || embeddedImage,
      }, base)];
    } catch { return []; }
  });
}

function htmlEntries(source, text, base) {
  const $ = load(text, { decodeEntities: true });
  $("script, style, noscript, template, nav, header, footer, aside").remove();
  const nodes = $(source.itemSelector || "main article, article").toArray().slice(0, source.itemLimit || maxItems);
  if (!nodes.length) throw new Error("HTML source has no matching entries.");
  return nodes.flatMap((node) => {
    const entry = $(node);
    const link = source.linkSelector ? entry.find(source.linkSelector).first() : entry.find("a[href]").first();
    const titleNode = source.titleSelector ? entry.find(source.titleSelector).first() : entry.find("h1,h2,h3").first();
    const dateNode = source.dateSelector ? entry.find(source.dateSelector).first() : entry.find("time").first();
    const excerptNode = source.excerptSelector ? entry.find(source.excerptSelector).first() : entry.find("p").first();
    const imageNode = source.imageSelector ? entry.find(source.imageSelector).first() : entry.find("img").first();
    try {
      return [story(source, {
        title: titleNode.text() || link.text(), url: link.attr("href"),
        date: dateNode.attr("datetime") || dateNode.text(), excerpt: excerptNode.html() || excerptNode.text(),
        imageUrl: imageNode.attr("src") || imageNode.attr("data-src"), imageAlt: imageNode.attr("alt"),
      }, base)];
    } catch { return []; }
  });
}

function jsonEntries(source, text, base) {
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("JSON source is invalid."); }
  const entries = source.jsonItemsPath === "results" ? payload?.results : payload?.items;
  if (!Array.isArray(entries) || !entries.length) throw new Error("JSON source has no entries.");
  return entries.slice(0, source.itemLimit || maxItems).map((entry) => story(source, {
    title: entry.title,
    url: entry.html_url || entry.url,
    date: entry.publication_date || entry.publishedAt || entry.date,
    excerpt: entry.abstract || entry.summary || entry.description,
    imageUrl: entry.image_url || entry.image?.url,
    imageAlt: entry.image?.alt,
  }, base));
}

export function parseAutoSource(source, fetched) {
  const text = String(fetched?.text || "");
  if (!source?.enabled && source?.enabled !== undefined) return [];
  if (Buffer.byteLength(text) > maxResponseBytes) throw new Error("Source response exceeds five megabytes.");
  const base = new URL(fetched?.finalUrl || source.url);
  const parsed = source.type === "html"
    ? htmlEntries(source, text, base)
    : source.type === "json" ? jsonEntries(source, text, base) : xmlEntries(source, text, base);
  return parsed.map((item) => qualifyAutoStory(source, item)).filter(Boolean);
}

const titleKey = (value) => sanitizeText(value, 300).toLocaleLowerCase();
export function deduplicateAutoStories(items = []) {
  const seenUrls = new Set();
  const seenTitles = new Set();
  return [...items]
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || String(left.id).localeCompare(String(right.id)))
    .filter((item) => {
      const title = titleKey(item.title);
      if (seenUrls.has(item.canonicalUrl) || seenTitles.has(title)) return false;
      seenUrls.add(item.canonicalUrl); seenTitles.add(title); return true;
    });
}
