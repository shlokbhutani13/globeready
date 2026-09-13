import { XMLParser, XMLValidator } from "fast-xml-parser";
import { domainToASCII } from "node:url";

import { sourceText, textValue } from "./feed.js";

const MAX_URLS = 1_000;
const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const feedPath = /(?:^|[\/._-])(?:rss|atom|feed)(?:$|[\/._-])/iu;
const word = /[a-z0-9]+/giu;

function sitemapError(message) {
  return new Error(`University sitemap is invalid: ${message}`);
}

function asList(value) {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function universityDomain(value) {
  if (typeof value !== "string" || !value.trim() || /[\s/:?@#]/u.test(value)) {
    throw sitemapError("officialDomain is missing or malformed.");
  }
  const domain = domainToASCII(value.toLowerCase());
  const labels = domain.split(".");
  if (!domain || labels.length < 2 || labels.at(-1) !== "edu" || labels.some((label) => !hostnameLabel.test(label))) {
    throw sitemapError("officialDomain must be a registrable .edu domain.");
  }
  return labels.slice(-2).join(".");
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
  if (url.protocol !== "https:" || url.username || url.password || url.port || !sameUniversityDomain(url.hostname.toLowerCase(), domain)) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|fbclid|gclid|msclkid|dclid|mc_cid|mc_eid)$/iu.test(key)) url.searchParams.delete(key);
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.href;
}

function parseSitemap(text) {
  if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw sitemapError("XML cannot contain entity declarations.");
  if (XMLValidator.validate(text) !== true) throw sitemapError("XML is malformed.");
  try {
    const parsed = new XMLParser({
      attributeNamePrefix: "@_",
      cdataPropName: "__cdata",
      ignoreAttributes: false,
      removeNSPrefix: true,
      textNodeName: "#text",
      trimValues: false,
    }).parse(text);
    const urls = asList(parsed?.urlset?.url);
    const sitemaps = asList(parsed?.sitemapindex?.sitemap);
    if (!parsed?.urlset && !parsed?.sitemapindex) throw sitemapError("urlset or sitemapindex is missing.");
    if (urls.length + sitemaps.length > MAX_URLS) throw sitemapError("URL count exceeds the parsing limit.");
    return { urls, sitemaps };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("University sitemap")) throw error;
    throw sitemapError("XML cannot be parsed.");
  }
}

function pathTokens(url) {
  return decodeURIComponent(url.pathname).toLowerCase().match(word) || [];
}

function hasPhrase(tokens, ...phrase) {
  return tokens.some((_value, index) => phrase.every((part, offset) => tokens[index + offset] === part));
}

function hasAny(tokens, values) {
  return values.some((value) => tokens.includes(value));
}

function isRelevantUniversityUrl(url, domain) {
  const tokens = pathTokens(url);
  const hostLabels = url.hostname.toLowerCase().replace(new RegExp(`\\.${domain}$`, "u"), "").split(".");
  if (hasAny(tokens, ["athletics", "sport", "sports"]) || hasAny(hostLabels, ["athletics", "sport", "sports"])) return false;
  if (feedPath.test(url.pathname) && hasAny(hostLabels, ["international", "registrar", "global"])) return true;
  if (hasPhrase(tokens, "international", "students") || hasPhrase(tokens, "global", "services")) return true;
  if (hasAny(tokens, ["cpt", "opt", "visa", "immigration", "tax", "safety", "emergency", "employment"])) return true;
  if (tokens.includes("academic") && tokens.includes("calendar")) return true;
  if (tokens.includes("registrar") && tokens.includes("calendar")) return true;
  if (hostLabels.includes("registrar") && tokens.includes("calendar")) return true;
  return hostLabels.includes("international") && hasAny(tokens, ["news", "alert", "alerts", "update", "updates", "announcement", "announcements", "notice", "notices"]);
}

export function createUniversitySitemapAdapter() {
  const adapter = {
    async discover(source, fetched) {
      const domain = universityDomain(source?.officialDomain);
      const parsed = parseSitemap(sourceText(fetched));
      const feeds = [];
      const indexes = [];
      const sitemaps = [];
      const seen = new Set();
      for (const entry of parsed.sitemaps) {
        const url = approvedUniversityUrl(textValue(entry?.loc), domain);
        if (url && !seen.has(url)) {
          seen.add(url);
          sitemaps.push(url);
        }
      }
      for (const entry of parsed.urls) {
        const url = approvedUniversityUrl(textValue(entry?.loc), domain);
        if (!url || seen.has(url) || !isRelevantUniversityUrl(new URL(url), domain)) continue;
        seen.add(url);
        if (feedPath.test(new URL(url).pathname)) feeds.push(url);
        else indexes.push(url);
      }
      return { urls: indexes, feeds, indexes, sitemaps };
    },
    async collect(source, fetched) {
      await adapter.discover(source, fetched);
      return [];
    },
  };
  return adapter;
}
