import { load } from "cheerio";

import {
  approvedItemUrl,
  excerptFromDecodedText,
  normalizeWhitespace,
  sourceBaseUrl,
  sourceDate,
  sourceText,
} from "./feed.js";

const MAX_ENTRIES = 500;

function indexError(message) {
  return new Error(`Official index page is invalid: ${message}`);
}

function indexEntries($, source) {
  const selector = normalizeWhitespace(source?.itemSelector)
    || "[data-news-item], main article, main .news-item, main li, article, .news-item";
  try {
    const entries = $(selector).toArray();
    if (entries.length > MAX_ENTRIES) throw indexError("entry count exceeds the parsing limit.");
    return entries;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Official index page")) throw error;
    throw indexError("item selector is invalid.");
  }
}

function pageBaseUrl($, source, fetched) {
  const sourceUrl = sourceBaseUrl(source, fetched);
  const href = $("base[href]").first().attr("href");
  if (!href) return sourceUrl;
  let raw;
  try {
    raw = new URL(href, sourceUrl);
  } catch {
    throw indexError("base URL is malformed.");
  }
  approvedItemUrl(raw.href, sourceUrl, source);
  return raw;
}

function indexCandidate($, element, baseUrl, source) {
  const entry = $(element);
  const link = entry.is("a[href]") ? entry : entry.find("a[href]").first();
  if (link.length === 0) throw indexError("entry link is missing.");
  const title = normalizeWhitespace(entry.find("h1, h2, h3").first().text()) || normalizeWhitespace(link.text());
  if (!title) throw indexError("entry title is missing.");
  const canonicalUrl = approvedItemUrl(link.attr("href"), baseUrl, source);
  const dateNode = entry.find("time").first();
  const dateValue = dateNode.attr("datetime") || dateNode.text() || entry.find("[class*='date']").first().text();
  const excerpt = excerptFromDecodedText(entry.is("p") ? entry.text() : entry.find("p").first().text());
  const externalId = normalizeWhitespace(entry.attr("data-id") || entry.attr("id")) || canonicalUrl;
  return {
    externalId,
    canonicalUrl,
    title,
    publisher: normalizeWhitespace(source?.publisher) || baseUrl.hostname,
    publishedAt: sourceDate(dateValue),
    updatedAt: null,
    effectiveAt: null,
    sourceDocumentType: normalizeWhitespace(source?.sourceDocumentType) || "Notice",
    docketNumber: null,
    regulationIdNumber: null,
    excerpt,
    normalizedText: excerpt,
  };
}

export function createIndexPageAdapter() {
  return {
    async collect(source, fetched) {
      const text = sourceText(fetched);
      const $ = load(text, { decodeEntities: true });
      $("script, style, noscript, template, nav, header, footer, aside, [role='navigation']").remove();
      const baseUrl = pageBaseUrl($, source, fetched);
      return indexEntries($, source).map((entry) => indexCandidate($, entry, baseUrl, source));
    },
  };
}
