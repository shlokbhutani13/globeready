import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const storyFields = [
  "id", "sourceId", "sourceVerified", "title", "publisher", "canonicalUrl", "officialPdfUrl", "publishedAt", "updatedAt", "verifiedAt",
  "effectiveAt", "expiresAt", "documentType", "legalState", "editorialState", "docketNumber", "excerpt",
  "sourceExcerpt", "plainLanguageSummary", "shortSummary", "whyItMatters", "detailSections", "actions", "image",
  "urgency", "topics", "visaTypes", "nationalities", "universityIds", "journeyStages", "lifecycleState", "replacementItemId",
];
const coverageFields = ["id", "name", "status", "officialUrl", "scope", "lastVerifiedAt", "cadenceHours"];
const publishedStates = new Set(["approved", "published-source-only"]);
const maxStories = 250;
const maxBytes = 1_000_000;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function officialUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password
      && (host.endsWith(".gov") || host === "gov" || host.endsWith(".edu") || host === "edu");
  } catch {
    return false;
  }
}

function pick(record, fields) {
  return Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]));
}

function stamp(payload) {
  return { ...payload, contentHash: hash(payload) };
}

export function buildPublicArtifacts({ items = [], coverage = [], generatedAt = new Date().toISOString(), cadenceHours = 168 } = {}) {
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("generatedAt must be an ISO timestamp.");
  if (!Number.isInteger(cadenceHours) || cadenceHours < 1 || cadenceHours > 744) throw new Error("cadenceHours is invalid.");
  if (!Array.isArray(items) || items.length > maxStories) throw new Error(`Public news is limited to ${maxStories} stories.`);

  const stories = items.map((item) => {
    if (item?.sourceVerified !== true || !publishedStates.has(item?.editorialState)) throw new Error("Every public story must be source-verified and reviewed.");
    if (!officialUrl(item.canonicalUrl)) throw new Error("Every public story must use an official HTTPS .gov or .edu canonical URL.");
    if (item.officialPdfUrl && !officialUrl(item.officialPdfUrl)) throw new Error("Official PDF URLs must use HTTPS .gov or .edu hosts.");
    return pick(item, storyFields);
  }).sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || String(left.id).localeCompare(String(right.id)));

  const entries = (Array.isArray(coverage) ? coverage : []).slice(0, 250).map((entry) => {
    if (entry.officialUrl && !officialUrl(entry.officialUrl)) throw new Error("Coverage URLs must be official HTTPS .gov or .edu URLs.");
    return pick(entry, coverageFields);
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const news = stamp({ schemaVersion: 1, generatedAt: new Date(generatedAt).toISOString(), cadenceHours, stories });
  const coverageArtifact = stamp({ schemaVersion: 1, generatedAt: new Date(generatedAt).toISOString(), cadenceHours, entries });
  if (Buffer.byteLength(JSON.stringify(news)) > maxBytes || Buffer.byteLength(JSON.stringify(coverageArtifact)) > maxBytes) {
    throw new Error("Public artifacts must each be smaller than 1 MB.");
  }
  return { news, coverage: coverageArtifact };
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const inputPath = valueAfter("--input");
  const discoverPath = valueAfter("--discover-output");
  const newsPath = valueAfter("--news-output") || "../client/public/data/news.json";
  const coveragePath = valueAfter("--coverage-output") || "../client/public/data/coverage.json";
  if (discoverPath) {
    const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("order", "newest");
    url.searchParams.set("conditions[term]", "F-1 OR international student OR exchange visitor");
    const response = await fetch(url, { headers: { accept: "application/json", "user-agent": "GlobeReady-public-review/1.0" } });
    if (!response.ok) throw new Error(`Federal Register discovery failed (${response.status}).`);
    const payload = await response.json();
    const proposals = (Array.isArray(payload.results) ? payload.results : []).slice(0, 100).map((item) => ({
      sourceId: "federal-register", externalId: String(item.document_number || ""),
      title: String(item.title || "").slice(0, 500), canonicalUrl: String(item.html_url || ""),
      officialPdfUrl: String(item.pdf_url || ""), publishedAt: item.publication_date || null,
      documentType: String(item.type || "notice").toLowerCase(), sourceExcerpt: String(item.abstract || "").slice(0, 500),
      reviewState: "needs-human-review",
    })).sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || left.externalId.localeCompare(right.externalId));
    const target = resolve(discoverPath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify({ generatedAt: new Date().toISOString(), proposals }, null, 2)}\n`);
  }
  if (!inputPath) {
    if (discoverPath) return;
    throw new Error("Usage: node scripts/build-public-news-artifact.mjs --input <reviewed.json> [--news-output path] [--coverage-output path] [--discover-output path]");
  }
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const artifacts = buildPublicArtifacts(input);
  for (const [path, value] of [[newsPath, artifacts.news], [coveragePath, artifacts.coverage]]) {
    const target = resolve(path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
