import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSourceSnapshots } from "../src/news/change-ledger.js";
import { reviewDecisionTypes as reviewDecisionTypeList } from "../src/news/review-decisions.js";

const storyFields = [
  "id", "sourceId", "sourceVerified", "title", "publisher", "canonicalUrl", "officialPdfUrl", "publishedAt", "updatedAt", "verifiedAt",
  "effectiveAt", "expiresAt", "documentType", "legalState", "editorialState", "docketNumber", "excerpt",
  "sourceExcerpt", "plainLanguageSummary", "shortSummary", "whyItMatters", "detailSections", "actions", "image",
  "urgency", "topics", "visaTypes", "nationalities", "universityIds", "journeyStages", "lifecycleState", "replacementItemId",
  "correctionNote", "reviewHistory",
];
const coverageFields = ["id", "name", "status", "officialUrl", "scope", "lastVerifiedAt", "cadenceHours"];
// "active" sources are reviewed for the static feed; "planned" ones are listed for transparency but not monitored.
const coverageStatuses = new Set(["active", "planned"]);
const publishedStates = new Set(["approved", "published-source-only", "archived"]);
const reviewDecisionTypes = new Set(reviewDecisionTypeList);
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

function publicReviewHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-20).map((entry) => ({
    type: String(entry?.type || "").slice(0, 30),
    decidedAt: String(entry?.decidedAt || "").slice(0, 40),
    reasonCode: String(entry?.reasonCode || "").slice(0, 80),
  })).filter((entry) => reviewDecisionTypes.has(entry.type) && Number.isFinite(Date.parse(entry.decidedAt)) && entry.reasonCode);
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
    const story = pick(item, storyFields);
    if (Object.hasOwn(story, "correctionNote")) story.correctionNote = String(story.correctionNote || "").trim().slice(0, 1_000);
    if (Object.hasOwn(story, "reviewHistory")) story.reviewHistory = publicReviewHistory(story.reviewHistory);
    return story;
  }).sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || String(left.id).localeCompare(String(right.id)));

  const entries = (Array.isArray(coverage) ? coverage : []).slice(0, 250).map((entry) => {
    if (entry.officialUrl && !officialUrl(entry.officialUrl)) throw new Error("Coverage URLs must be official HTTPS .gov or .edu URLs.");
    if (!coverageStatuses.has(entry.status)) throw new Error(`Coverage status must be one of: ${[...coverageStatuses].join(", ")}.`);
    if (entry.status !== "active" && (entry.lastVerifiedAt || entry.cadenceHours)) {
      throw new Error(`Coverage entry "${entry.id}" is not monitored, so it cannot carry a review date or cadence.`);
    }
    if (entry.status === "active" && !Number.isFinite(Date.parse(entry.lastVerifiedAt))) {
      throw new Error(`Active coverage entry "${entry.id}" needs the ISO date it was last reviewed.`);
    }
    return pick(entry, coverageFields);
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const news = stamp({ schemaVersion: 1, generatedAt: new Date(generatedAt).toISOString(), cadenceHours, stories });
  const coverageArtifact = stamp({ schemaVersion: 1, generatedAt: new Date(generatedAt).toISOString(), cadenceHours, entries });
  if (Buffer.byteLength(JSON.stringify(news)) > maxBytes || Buffer.byteLength(JSON.stringify(coverageArtifact)) > maxBytes) {
    throw new Error("Public artifacts must each be smaller than 1 MB.");
  }
  return { news, coverage: coverageArtifact };
}

// Turns a Federal Register search response into review candidates. The output has no timestamps and omits stories
// already in the reviewed input, so the weekly pull request changes only when there is something new to review.
export function buildProposals(payload, reviewedIds = new Set()) {
  return (Array.isArray(payload?.results) ? payload.results : []).slice(0, 100)
    .map((item) => ({
      sourceId: "federal-register", externalId: String(item.document_number || ""),
      title: String(item.title || "").slice(0, 500), canonicalUrl: String(item.html_url || ""),
      officialPdfUrl: String(item.pdf_url || ""), publishedAt: item.publication_date || null,
      documentType: String(item.type || "notice").toLowerCase(), sourceExcerpt: String(item.abstract || "").slice(0, 500),
      reviewState: "needs-human-review",
    }))
    .filter((item) => item.externalId && officialUrl(item.canonicalUrl) && !reviewedIds.has(`federal-register-${item.externalId}`))
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")) || left.externalId.localeCompare(right.externalId));
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const inputPath = valueAfter("--input");
  const reviewedPath = valueAfter("--reviewed");
  const discoverPath = valueAfter("--discover-output");
  const fixturePath = valueAfter("--fixture-input");
  const snapshotInputPath = valueAfter("--snapshot-input");
  const snapshotOutputPath = valueAfter("--snapshot-output");
  const newsPath = valueAfter("--news-output") || "../client/public/data/news.json";
  const coveragePath = valueAfter("--coverage-output") || "../client/public/data/coverage.json";
  const writeJson = async (path, value) => {
    const target = resolve(path);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temporary, target);
  };
  if (fixturePath) {
    if (!discoverPath || !snapshotOutputPath) throw new Error("Fixture collection requires proposal and snapshot output paths.");
    const fixture = JSON.parse(await readFile(resolve(fixturePath), "utf8"));
    const previous = snapshotInputPath ? JSON.parse(await readFile(resolve(snapshotInputPath), "utf8")) : undefined;
    const result = compareSourceSnapshots({
      source: fixture.source,
      previous,
      current: { ok: fixture.ok === true, entries: fixture.entries || [], errorCode: fixture.errorCode },
      collectedAt: fixture.collectedAt,
    });
    await writeJson(discoverPath, { schemaVersion: 1, sourceHealth: result.sourceHealth, proposals: result.candidates });
    await writeJson(snapshotOutputPath, result.nextSnapshot);
    return;
  }
  if (discoverPath) {
    const url = new URL("https://www.federalregister.gov/api/v1/documents.json");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("order", "newest");
    url.searchParams.set("conditions[term]", "F-1 OR international student OR exchange visitor");
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "GlobeReady-public-review/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Federal Register discovery failed (${response.status}).`);
    const text = await response.text();
    if (text.length > 5_000_000) throw new Error("Federal Register discovery response is unexpectedly large.");
    const reviewed = reviewedPath ? JSON.parse(await readFile(resolve(reviewedPath), "utf8")) : { items: [] };
    const proposals = buildProposals(JSON.parse(text), new Set((reviewed.items || []).map((item) => item.id)));
    await writeJson(discoverPath, { source: "federal-register", proposals });
  }
  if (!inputPath) {
    if (discoverPath) return;
    throw new Error("Usage: node scripts/build-public-news-artifact.mjs --input <reviewed.json> [--news-output path] [--coverage-output path] [--discover-output path]");
  }
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
  const artifacts = buildPublicArtifacts(input);
  for (const [path, value] of [[newsPath, artifacts.news], [coveragePath, artifacts.coverage]]) {
    await writeJson(path, value);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
