export const documentTypes = new Set([
  "notice",
  "proposed-rule",
  "final-rule",
  "guidance",
  "policy-update",
  "form-change",
  "fee-change",
  "court-update",
  "emergency",
  "university-notice",
  "correction",
]);

export const legalStates = new Set([
  "proposed",
  "final",
  "scheduled",
  "effective",
  "delayed",
  "enjoined",
  "superseded",
  "withdrawn",
  "expired",
  "informational",
]);

export const editorialStates = new Set([
  "imported",
  "published-source-only",
  "review-required",
  "approved",
  "rejected",
  "archived",
]);

export const publicNewsFields = new Set([
  "id", "sourceId", "sourceKey", "externalId", "relatedExternalId", "canonicalUrl",
  "officialPdfUrl", "sourceVerified", "title", "publisher", "publishedAt", "updatedAt",
  "effectiveAt", "expiresAt", "sourceDocumentType", "sourceLegalState", "documentType",
  "legalState", "editorialState", "docketNumber", "regulationIdNumber", "excerpt",
  "sourceExcerpt", "plainLanguageSummary", "actions", "urgency", "relevance", "highImpact",
  "topics", "visaTypes", "nationalities", "universityIds", "journeyStages", "relatedIds",
  "supersedesIds", "supersededByIds", "firstSeenAt", "lastSeenAt", "createdAt", "recordUpdatedAt",
  "lifecycleState", "replacementItemId", "shortSummary", "whyItMatters", "detailSections", "image",
  "verifiedAt",
]);

function cleanText(value, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? value
    : null;
}

function cleanTimestamp(value) {
  const dateOnly = cleanDate(value);
  if (dateOnly) return dateOnly;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function cleanDetailSections(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((section) => {
    if (!section || typeof section !== "object" || Array.isArray(section)
      || Object.keys(section).some((key) => !["heading", "body"].includes(key))) return [];
    const heading = cleanText(section.heading, 100);
    const body = cleanText(section.body, 4_000);
    return heading && body ? [{ heading, body }] : [];
  });
}

function cleanImage(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["url", "alt", "sourceUrl", "attribution"].includes(key))) return null;
  const url = cleanText(value.url, 2_000);
  const alt = cleanText(value.alt, 300);
  if (!url || !alt) return null;
  return {
    url,
    alt,
    ...(cleanText(value.sourceUrl, 2_000) ? { sourceUrl: cleanText(value.sourceUrl, 2_000) } : {}),
    ...(cleanText(value.attribution, 300) ? { attribution: cleanText(value.attribution, 300) } : {}),
  };
}

function searchTextFor(candidate) {
  return [candidate.title, candidate.normalizedText, candidate.excerpt]
    .map((value) => cleanText(value, 100_000).toLocaleLowerCase().replace(/\s+/gu, " "))
    .filter(Boolean)
    .join(" ")
    .slice(0, 100_000);
}

function documentTypeFor(sourceDocumentType) {
  const type = cleanText(sourceDocumentType).toLowerCase();
  if (type.includes("correction")) return "correction";
  if (type.includes("proposed")) return "proposed-rule";
  if (type.includes("rule")) return "final-rule";
  if (type.includes("guidance")) return "guidance";
  if (type.includes("policy")) return "policy-update";
  if (type.includes("form")) return "form-change";
  if (type.includes("fee")) return "fee-change";
  if (type.includes("court")) return "court-update";
  if (type.includes("emergency")) return "emergency";
  if (type.includes("university")) return "university-notice";
  return "notice";
}

function legalStateFor(documentType) {
  if (documentType === "proposed-rule") return "proposed";
  if (documentType === "final-rule") return "final";
  return "informational";
}

export function isPublished(item) {
  return item?.editorialState === "published-source-only" || item?.editorialState === "approved";
}

export function publicNewsItem(item) {
  if (!item || typeof item !== "object") return {};
  const result = Object.fromEntries([...publicNewsFields]
    .filter((field) => Object.hasOwn(item, field) && item[field] !== undefined)
    .map((field) => [field, item[field]]));
  if (item.editorialState !== "approved") {
    result.plainLanguageSummary = "";
    result.actions = [];
  }
  return result;
}

export function normalizeNewsCandidate(candidate = {}, source = {}) {
  const sourceId = cleanText(source.id, 200);
  const externalId = cleanText(candidate.externalId, 500);
  const canonicalUrl = cleanText(candidate.canonicalUrl, 2_000);
  const documentType = documentTypeFor(candidate.sourceDocumentType);
  const excerpt = cleanText(candidate.excerpt, 500);

  return {
    sourceId,
    externalId,
    sourceKey: externalId ? `${sourceId}:${externalId}` : `${sourceId}:${canonicalUrl}`,
    relatedExternalId: cleanText(candidate.relatedExternalId, 500),
    canonicalUrl,
    officialPdfUrl: cleanText(candidate.officialPdfUrl, 2_000),
    sourceVerified: source.verified === true,
    title: cleanText(candidate.title),
    publisher: cleanText(candidate.publisher),
    publishedAt: cleanTimestamp(candidate.publishedAt),
    updatedAt: cleanTimestamp(candidate.updatedAt),
    effectiveAt: cleanTimestamp(candidate.effectiveAt),
    sourceDocumentType: cleanText(candidate.sourceDocumentType),
    sourceLegalState: cleanText(candidate.sourceLegalState, 100),
    documentType,
    legalState: legalStateFor(documentType),
    editorialState: source.verified === true ? "published-source-only" : "review-required",
    docketNumber: cleanText(candidate.docketNumber),
    regulationIdNumber: cleanText(candidate.regulationIdNumber),
    excerpt,
    sourceExcerpt: excerpt,
    normalizedText: cleanText(candidate.normalizedText, 100_000),
    searchText: searchTextFor(candidate),
    shortSummary: cleanText(candidate.shortSummary, 500),
    whyItMatters: cleanText(candidate.whyItMatters, 500),
    detailSections: cleanDetailSections(candidate.detailSections),
    image: cleanImage(candidate.image),
    verifiedAt: cleanTimestamp(candidate.verifiedAt),
    plainLanguageSummary: "",
  };
}
