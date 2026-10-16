import { createHash } from "node:crypto";

import { load } from "cheerio";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const maxResponseBytes = 5 * 1024 * 1024;
const maxItems = 100;
const trackingKey = /^(?:utm_.+|fbclid|gclid|msclkid|mc_.+)$/iu;

const list = (value) => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const textOf = (value) => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object") return "";
  return Object.entries(value).filter(([key]) => !key.startsWith("@_")).map(([, child]) => textOf(child)).join(" ");
};

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

function imageRecord(url, alt, source, base) {
  const safe = maybeUrl(url, base, source.imageHosts || source.allowedHosts, "Image");
  return safe ? { url: safe, alt: sanitizeText(alt || "", 300) || "Illustration from the original source" } : undefined;
}

function story(source, input, base) {
  const title = sanitizeText(input.title, 300);
  if (!title) throw new Error("Story title is missing.");
  const canonicalUrl = allowedUrl(input.url, base, source.allowedHosts, "Story");
  return {
    id: stableStoryId(source.id, canonicalUrl),
    sourceId: source.id,
    publisher: source.name,
    title,
    canonicalUrl,
    publishedAt: dateOnly(input.date),
    excerpt: sanitizeExcerpt(input.excerpt),
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
  return entries.slice(0, source.itemLimit || maxItems).map((entry) => {
    const links = list(entry.link);
    const link = atom
      ? links.find((candidate) => typeof candidate === "object" && (!candidate["@_rel"] || candidate["@_rel"] === "alternate")) || links[0]
      : entry.link;
    const url = typeof link === "object" ? link["@_href"] : textOf(link);
    const enclosure = list(entry.enclosure).find((candidate) => String(candidate?.["@_type"] || "").startsWith("image/"));
    const media = list(entry.content).find((candidate) => String(candidate?.["@_type"] || "").startsWith("image/"));
    const atomImage = links.find((candidate) => typeof candidate === "object" && candidate["@_rel"] === "enclosure" && String(candidate["@_type"] || "").startsWith("image/"));
    return story(source, {
      title: textOf(entry.title), url,
      date: textOf(entry.published ?? entry.updated ?? entry.pubDate ?? entry.date),
      excerpt: textOf(entry.summary ?? entry.description ?? entry.encoded ?? entry.content),
      imageUrl: enclosure?.["@_url"] || media?.["@_url"] || atomImage?.["@_href"],
    }, base);
  });
}

function htmlEntries(source, text, base) {
  const $ = load(text, { decodeEntities: true });
  $("script, style, noscript, template, nav, header, footer, aside").remove();
  const nodes = $(source.itemSelector || "main article, article").toArray().slice(0, source.itemLimit || maxItems);
  if (!nodes.length) throw new Error("HTML source has no matching entries.");
  return nodes.map((node) => {
    const entry = $(node);
    const link = source.linkSelector ? entry.find(source.linkSelector).first() : entry.find("a[href]").first();
    const titleNode = source.titleSelector ? entry.find(source.titleSelector).first() : entry.find("h1,h2,h3").first();
    const dateNode = source.dateSelector ? entry.find(source.dateSelector).first() : entry.find("time").first();
    const excerptNode = source.excerptSelector ? entry.find(source.excerptSelector).first() : entry.find("p").first();
    const imageNode = source.imageSelector ? entry.find(source.imageSelector).first() : entry.find("img").first();
    return story(source, {
      title: titleNode.text() || link.text(), url: link.attr("href"),
      date: dateNode.attr("datetime") || dateNode.text(), excerpt: excerptNode.html() || excerptNode.text(),
      imageUrl: imageNode.attr("src") || imageNode.attr("data-src"), imageAlt: imageNode.attr("alt"),
    }, base);
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
  if (source.type === "html") return htmlEntries(source, text, base);
  if (source.type === "json") return jsonEntries(source, text, base);
  return xmlEntries(source, text, base);
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
