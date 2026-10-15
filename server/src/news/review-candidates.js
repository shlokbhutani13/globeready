import { createHash } from "node:crypto";

import { canonicalSourceHostname } from "./url-policy.js";

export const candidateSchemaVersion = 1;

const changeTypes = new Set(["new", "changed", "redirected", "removed"]);
const candidateFields = new Set([
  "schemaVersion", "id", "fingerprint", "sourceId", "changeType", "publicationState",
  "canonicalUrl", "collectedAt", "current", "previous", "diffs",
]);
const evidenceFields = new Set([
  "externalId", "title", "canonicalUrl", "publishedAt", "updatedAt", "effectiveAt",
  "sourceExcerpt", "topics", "visaTypes",
]);
const trackingKeys = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const sourceIdPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/u;

const normalizedText = (value, max) => {
  if (typeof value !== "string") return "";
  const clean = value.trim().replace(/\s+/gu, " ");
  if (clean.length > max) throw new Error("Candidate evidence text exceeds its limit.");
  return clean;
};

function isoTimestamp(value) {
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.valueOf())) throw new Error("Candidate collection time must be an ISO timestamp.");
  return date.toISOString();
}

function canonicalUrl(value, source) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Candidate URL must be a valid absolute URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Candidate URL must use plain HTTPS.");
  const host = canonicalSourceHostname(url.hostname);
  const allowed = new Set((source?.allowedHosts || []).map(canonicalSourceHostname));
  if (!allowed.has(host)) throw new Error("Candidate URL must stay on an allowed official host.");
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || trackingKeys.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

function cleanStringArray(value, maxEntries = 20) {
  if (!Array.isArray(value) || value.length > maxEntries) throw new Error("Candidate audience tags are invalid.");
  const clean = value.map((entry) => normalizedText(entry, 100));
  if (clean.some((entry) => !entry) || new Set(clean).size !== clean.length) throw new Error("Candidate audience tags are invalid.");
  return clean;
}

function evidence(value, source) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Candidate evidence must be an object.");
  if (Object.keys(value).some((key) => !evidenceFields.has(key))) throw new Error("Candidate evidence contains an unknown field.");
  const result = {
    externalId: normalizedText(value.externalId, 500),
    title: normalizedText(value.title, 500),
    canonicalUrl: canonicalUrl(value.canonicalUrl, source),
    publishedAt: normalizedText(value.publishedAt, 40) || null,
    updatedAt: normalizedText(value.updatedAt, 40) || null,
    effectiveAt: normalizedText(value.effectiveAt, 40) || null,
    sourceExcerpt: normalizedText(value.sourceExcerpt, 2_000),
    topics: cleanStringArray(value.topics || []),
    visaTypes: cleanStringArray(value.visaTypes || []),
  };
  if (!result.title || !result.canonicalUrl) throw new Error("Candidate evidence needs a title and official URL.");
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function meaningful(item, source) {
  const clean = evidence(item, source || { allowedHosts: [new URL(item.canonicalUrl).hostname] });
  return {
    title: clean.title,
    canonicalUrl: clean.canonicalUrl,
    publishedAt: clean.publishedAt,
    updatedAt: clean.updatedAt,
    effectiveAt: clean.effectiveAt,
    sourceExcerpt: clean.sourceExcerpt,
    topics: clean.topics,
    visaTypes: clean.visaTypes,
  };
}

export function candidateFingerprint(item) {
  const payload = meaningful(item);
  return createHash("sha256").update(JSON.stringify(stable(payload))).digest("hex");
}

function fieldDiffs(previous, current) {
  if (!previous || !current) return [];
  return [...evidenceFields].filter((field) => JSON.stringify(previous[field] ?? null) !== JSON.stringify(current[field] ?? null)).sort();
}

export function buildReviewCandidate({ source, current = null, previous = null, collectedAt, changeType }) {
  if (!sourceIdPattern.test(source?.id || "")) throw new Error("Candidate source ID is invalid.");
  if (!changeTypes.has(changeType)) throw new Error("Candidate change type is invalid.");
  if (changeType === "removed" ? !previous : !current) throw new Error("Candidate evidence does not match its change type.");
  const currentEvidence = evidence(current, source);
  const previousEvidence = evidence(previous, source);
  const basis = current || previous;
  const fingerprint = candidateFingerprint(basis);
  const id = `review-candidate:${createHash("sha256").update(JSON.stringify([source.id, changeType, fingerprint])).digest("hex")}`;
  return validateReviewCandidate({
    schemaVersion: candidateSchemaVersion,
    id,
    fingerprint,
    sourceId: source.id,
    changeType,
    publicationState: "unreviewed",
    canonicalUrl: canonicalUrl(basis.canonicalUrl, source),
    collectedAt: isoTimestamp(collectedAt),
    current: currentEvidence,
    previous: previousEvidence,
    diffs: fieldDiffs(previousEvidence, currentEvidence),
  }, source);
}

export function validateReviewCandidate(value, source) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review candidate must be an object.");
  if (Object.keys(value).some((key) => !candidateFields.has(key))) throw new Error("Review candidate contains an unknown field.");
  if (value.schemaVersion !== candidateSchemaVersion) throw new Error("Review candidate schema version is unsupported.");
  if (!/^review-candidate:[a-f0-9]{64}$/u.test(value.id || "") || !/^[a-f0-9]{64}$/u.test(value.fingerprint || "")) throw new Error("Review candidate identifiers are invalid.");
  if (!sourceIdPattern.test(value.sourceId || "") || value.sourceId !== source?.id) throw new Error("Review candidate source is invalid.");
  if (!changeTypes.has(value.changeType)) throw new Error("Review candidate change type is invalid.");
  if (value.publicationState !== "unreviewed") throw new Error("Review candidate publication state is invalid.");
  const current = evidence(value.current, source);
  const previous = evidence(value.previous, source);
  if (value.changeType === "removed" ? !previous || current : !current) throw new Error("Review candidate evidence is invalid.");
  const url = canonicalUrl(value.canonicalUrl, source);
  const collectedAt = isoTimestamp(value.collectedAt);
  if (!Array.isArray(value.diffs) || value.diffs.length > evidenceFields.size || value.diffs.some((field) => !evidenceFields.has(field))) throw new Error("Review candidate diffs are invalid.");
  const basis = current || previous;
  const fingerprint = candidateFingerprint(basis);
  const id = `review-candidate:${createHash("sha256").update(JSON.stringify([source.id, value.changeType, fingerprint])).digest("hex")}`;
  const diffs = fieldDiffs(previous, current);
  if (value.fingerprint !== fingerprint || value.id !== id || url !== basis.canonicalUrl
    || JSON.stringify([...value.diffs].sort()) !== JSON.stringify(diffs)) {
    throw new Error("Review candidate identity does not match its evidence.");
  }
  return { ...value, canonicalUrl: url, collectedAt, current, previous, diffs };
}
