import { XMLParser, XMLValidator } from "fast-xml-parser";
import { domainToASCII } from "node:url";

import { sourceText } from "./feed.js";

const MAX_URLS = 1_000;
const relevantKeyword = /(?:international(?:-student)?|global(?:-services)?|registrar|academic-calendar|calendar|tax|safety|employment|cpt|opt|visa|immigration|emergency)/iu;
const feedPath = /(?:^|[\/._-])(?:rss|atom|feed)(?:$|[\/._-])/iu;
const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

function sitemapError(message) {
  return new Error(`University sitemap is invalid: ${message}`);
}

function asList(value) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function stringValue(value) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object") return "";
  return stringValue(value["#text"] ?? value.__cdata ?? value["#cdata"]);
}

function universityDomain(value) {
  if (typeof value !== "string" || !value.trim()) throw sitemapError("officialDomain is missing.");
  const domain = domainToASCII(value.trim().toLowerCase());
  const labels = domain.split(".");
  if (!domain || labels.length < 2 || labels.at(-1) !== "edu" || labels.some((label) => !hostnameLabel.test(label))) {
    throw sitemapError("officialDomain must be a registrable .edu domain.");
  }
  return domain;
}

function sameUniversityDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function approvedUniversityUrl(value, domain) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw sitemapError("URL is malformed.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !sameUniversityDomain(url.hostname.toLowerCase(), domain)) {
    return null;
  }
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid)$/iu.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.href;
}

function parseSitemap(text) {
  if (XMLValidator.validate(text) !== true) throw sitemapError("XML is malformed.");
  try {
    const parsed = new XMLParser({ attributeNamePrefix: "@_", textNodeName: "#text", trimValues: false }).parse(text);
    const urls = asList(parsed?.urlset?.url);
    if (!parsed?.urlset) throw sitemapError("urlset is missing.");
    if (urls.length > MAX_URLS) throw sitemapError("URL count exceeds the parsing limit.");
    return urls;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("University sitemap")) throw error;
    throw sitemapError("XML cannot be parsed.");
  }
}

export function createUniversitySitemapAdapter() {
  const adapter = {
    async discover(source, fetched) {
      const domain = universityDomain(source?.officialDomain);
      const urls = parseSitemap(sourceText(fetched));
      const feeds = [];
      const indexes = [];
      const seen = new Set();

      for (const entry of urls) {
        const url = approvedUniversityUrl(stringValue(entry?.loc), domain);
        if (!url || !relevantKeyword.test(url) || seen.has(url)) continue;
        seen.add(url);
        if (feedPath.test(new URL(url).pathname)) feeds.push(url);
        else indexes.push(url);
      }
      return { urls: indexes, feeds, indexes };
    },
    async collect(source, fetched) {
      await adapter.discover(source, fetched);
      return [];
    },
  };
  return adapter;
}
