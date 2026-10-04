import { canonicalOfficialUrl } from "./official-url.js";
import { validateSummaryDraft } from "./summarizer.js";

const entityPattern = /&(?:#(?:x[0-9a-f]+|[0-9]+)|(?:colon|sol|bsol|tab|newline|period|quest|num|percnt));?/iu;
const encodedUriSeparatorPattern = /%(?:25)*(?:2f|3a|5c)/iu;
const relativeTimePattern = /\b(?:today|tomorrow|yesterday|tonight|(?:next|last|previous|following|this)\s+(?:(?:business|calendar)\s+)?(?:day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:in|within)\s+(?:(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:(?:business|calendar)\s+)?(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:business|calendar)\s+)?(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+(?:from\s+now|later|ago|before|after)|upon\s+(?:publication|issuance|approval))\b/iu;
const hierarchicalSchemePattern = /\b([a-z][a-z0-9+.-]*)\s*:\s*[\\/]{2}/iu;
const invisibleCharacterPattern = /[\p{Cc}\p{Cf}]/u;
const httpsUrlPattern = /https:\/\/[^\s<>"']+/giu;

function stringsIn(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => stringsIn(entry, output));
  else if (value && typeof value === "object") Object.values(value).forEach((entry) => stringsIn(entry, output));
  return output;
}

export function assertStrictApprovalDraft(draft) {
  for (const value of stringsIn(draft)) {
    const normalized = value.normalize("NFKC");
    if (entityPattern.test(normalized) || encodedUriSeparatorPattern.test(normalized)
      || invisibleCharacterPattern.test(normalized)) {
      throw new Error("Reviewed draft contains encoded URI syntax.");
    }
    if (relativeTimePattern.test(normalized)) {
      throw new Error("Reviewed draft contains an unsupported relative-time claim.");
    }
    const schemeMatch = hierarchicalSchemePattern.exec(normalized);
    const scheme = schemeMatch?.[1]?.toLowerCase();
    if (scheme && (scheme !== "https" || schemeMatch[0] !== "https://" || normalized !== value)) {
      throw new Error("Reviewed draft contains an unsupported hierarchical URI scheme.");
    }
    for (const match of normalized.match(httpsUrlPattern) || []) {
      const candidate = match.replace(/[),.;:\]}]+$/u, "");
      canonicalOfficialUrl(candidate, { allowSearch: true });
    }
  }
}

export function expectedSnapshotPath(item) {
  if (!item || typeof item.sourceId !== "string"
    || !/^[a-z0-9](?:[a-z0-9_-]{0,198}[a-z0-9])?$/iu.test(item.sourceId)
    || typeof item.contentHash !== "string" || !/^[a-f0-9]{64}$/u.test(item.contentHash)) {
    throw new Error("News item snapshot identity is invalid.");
  }
  return `news-source-snapshots/${item.sourceId}/${item.contentHash}.txt`;
}

export function validateApprovalDraft({ item, review, snapshot } = {}) {
  if (!item || !review || !snapshot || item.editorialState !== "review-required"
    || item.sourceVerified !== true || review.status !== "pending"
    || review.editorialState !== "review-required" || review.newsItemId !== item.id
    || review.sourceId !== item.sourceId || review.contentHash !== item.contentHash
    || review.revisionId !== item.currentRevisionId || !review.draft) {
    throw new Error("Approval review does not match the current news item identity.");
  }
  const path = expectedSnapshotPath(item);
  if (item.snapshotPath !== path || typeof item.snapshotCommitId !== "string" || !item.snapshotCommitId
    || snapshot.sourceId !== item.sourceId || snapshot.contentHash !== item.contentHash
    || snapshot.path !== path || snapshot.commitId !== item.snapshotCommitId
    || typeof snapshot.text !== "string" || !Array.isArray(snapshot.verifiedDomains)) {
    throw new Error("Approval snapshot does not match the current news item identity.");
  }
  assertStrictApprovalDraft(review.draft);
  return validateSummaryDraft(review.draft, {
    candidate: {
      title: item.title,
      excerpt: item.sourceExcerpt,
      normalizedText: snapshot.text,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt,
      effectiveAt: item.effectiveAt,
      canonicalUrl: item.canonicalUrl,
      officialPdfUrl: item.officialPdfUrl,
    },
    verifiedDomains: snapshot.verifiedDomains,
    rawDraft: review.draft,
  });
}
