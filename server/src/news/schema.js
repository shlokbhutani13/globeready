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
  const {
    normalizedText,
    contentHash,
    snapshotPath,
    classifierConfidence,
    classifierMatchedTerms,
    classifierExplanation,
    ...safe
  } = item;
  return safe;
}

export function normalizeNewsCandidate(candidate = {}, source = {}) {
  const sourceId = cleanText(source.id, 200);
  const externalId = cleanText(candidate.externalId, 500);
  const canonicalUrl = cleanText(candidate.canonicalUrl, 2_000);
  const documentType = documentTypeFor(candidate.sourceDocumentType);
  const excerpt = cleanText(candidate.excerpt, 500);

  return {
    sourceId,
    sourceKey: externalId ? `${sourceId}:${externalId}` : `${sourceId}:${canonicalUrl}`,
    canonicalUrl,
    officialPdfUrl: cleanText(candidate.officialPdfUrl, 2_000),
    sourceVerified: source.verified === true,
    title: cleanText(candidate.title),
    publisher: cleanText(candidate.publisher),
    publishedAt: cleanDate(candidate.publishedAt),
    updatedAt: cleanDate(candidate.updatedAt),
    effectiveAt: cleanDate(candidate.effectiveAt),
    sourceDocumentType: cleanText(candidate.sourceDocumentType),
    documentType,
    legalState: legalStateFor(documentType),
    editorialState: source.verified === true ? "published-source-only" : "review-required",
    docketNumber: cleanText(candidate.docketNumber),
    regulationIdNumber: cleanText(candidate.regulationIdNumber),
    excerpt,
    sourceExcerpt: excerpt,
    normalizedText: cleanText(candidate.normalizedText, 100_000),
    plainLanguageSummary: "",
  };
}
