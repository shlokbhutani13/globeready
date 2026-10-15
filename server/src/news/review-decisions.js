export const reviewDecisionTypes = Object.freeze(["approve", "reject", "defer", "correct", "archive"]);

const types = new Set(reviewDecisionTypes);
const requiredConfirmations = ["source", "title", "dates", "legalState", "factualSummary", "tags", "imagePolicy"];
const reasonCodes = new Set([
  "verified-official-source", "needs-more-evidence", "not-relevant", "duplicate",
  "source-correction", "source-withdrawn", "superseded", "image-policy-failed",
]);
const fieldsByType = {
  approve: new Set(["type", "confirmations", "record", "reasonCode", "privateNote"]),
  correct: new Set(["type", "confirmations", "record", "reasonCode", "privateNote", "targetId", "publicCorrectionNote"]),
  reject: new Set(["type", "reasonCode", "privateNote"]),
  defer: new Set(["type", "reasonCode", "privateNote"]),
  archive: new Set(["type", "reasonCode", "privateNote", "targetId", "publicCorrectionNote"]),
};

const bounded = (value, max, { required = false } = {}) => {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") throw new Error("Review decision text is invalid.");
  const clean = value.trim();
  if ((required && !clean) || clean.length > max) throw new Error("Review decision text is invalid.");
  return clean;
};

export function validateReviewDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !types.has(value.type)) throw new Error("Review decision type is invalid.");
  if (Object.keys(value).some((key) => !fieldsByType[value.type].has(key))) throw new Error("Review decision contains an unknown field.");
  if (!reasonCodes.has(value.reasonCode)) throw new Error("Review decision reason is invalid.");
  bounded(value.privateNote, 1_000);
  if (["approve", "correct"].includes(value.type)) {
    if (!value.confirmations || typeof value.confirmations !== "object" || Array.isArray(value.confirmations)
      || Object.keys(value.confirmations).length !== requiredConfirmations.length
      || requiredConfirmations.some((key) => value.confirmations[key] !== true)) {
      throw new Error("Confirm the source, title, dates, legal state, factual summary, tags, and image policy before approval.");
    }
    if (!value.record || typeof value.record !== "object" || Array.isArray(value.record)) throw new Error("An approved reviewed record is required.");
    for (const field of ["id", "title", "publisher", "canonicalUrl", "documentType", "legalState"]) bounded(value.record[field], field === "canonicalUrl" ? 2_000 : 500, { required: true });
    if (value.record.sourceVerified !== true || value.record.editorialState !== "approved") throw new Error("Approved records must be source verified and approved.");
  }
  if (["correct", "archive"].includes(value.type)) {
    bounded(value.targetId, 300, { required: true });
    bounded(value.publicCorrectionNote, 1_000, { required: true });
  }
  return value;
}

export function validateCandidateDecision(candidate, value) {
  const clean = validateReviewDecision(value);
  if (!candidate?.id || candidate.publicationState !== "unreviewed") throw new Error("A valid unreviewed candidate is required.");
  if (candidate.changeType === "removed" && ["approve", "correct"].includes(clean.type)) {
    throw new Error("Removed candidates must be rejected, deferred, or handled by archiving the existing public item.");
  }
  return clean;
}

function decidedAt(clock) {
  const date = new Date(clock());
  if (Number.isNaN(date.valueOf())) throw new Error("Review clock returned an invalid date.");
  return date.toISOString();
}

export function applyReviewDecision({ candidate, decision, reviewedItems = [], clock = () => new Date() } = {}) {
  const clean = validateCandidateDecision(candidate, decision);
  const stamp = decidedAt(clock);
  const history = { type: clean.type, decidedAt: stamp, reasonCode: clean.reasonCode };
  if (["reject", "defer"].includes(clean.type)) return { item: null, reviewedItems: [...reviewedItems], resolution: { candidateId: candidate.id, ...history } };

  if (clean.type === "approve") {
    if (reviewedItems.some((item) => item.id === clean.record.id)) throw new Error("The reviewed record ID already exists.");
    const item = { ...clean.record, sourceId: candidate.sourceId, verifiedAt: stamp, reviewHistory: [history] };
    return { item, reviewedItems: [...reviewedItems, item], resolution: { candidateId: candidate.id, ...history } };
  }

  const index = reviewedItems.findIndex((item) => item.id === clean.targetId);
  if (index < 0) throw new Error("The reviewed target was not found.");
  const existing = reviewedItems[index];
  const item = clean.type === "correct"
    ? { ...existing, ...clean.record, id: existing.id, sourceId: existing.sourceId, correctionNote: clean.publicCorrectionNote.trim(), verifiedAt: stamp, reviewHistory: [...(existing.reviewHistory || []), history] }
    : { ...existing, editorialState: "archived", lifecycleState: "archived", correctionNote: clean.publicCorrectionNote.trim(), verifiedAt: stamp, reviewHistory: [...(existing.reviewHistory || []), history] };
  const next = reviewedItems.map((entry, position) => position === index ? item : entry);
  return { item, reviewedItems: next, resolution: { candidateId: candidate.id, ...history } };
}
