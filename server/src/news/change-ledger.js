import { buildReviewCandidate, candidateFingerprint } from "./review-candidates.js";

const identity = (entry) => String(entry?.externalId || entry?.canonicalUrl || "");
const emptySnapshot = () => ({ entries: [], absenceCounts: {}, resolvedFingerprints: [] });

function cleanSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySnapshot();
  return {
    entries: Array.isArray(value.entries) ? value.entries : [],
    absenceCounts: value.absenceCounts && typeof value.absenceCounts === "object" && !Array.isArray(value.absenceCounts) ? value.absenceCounts : {},
    resolvedFingerprints: Array.isArray(value.resolvedFingerprints) ? value.resolvedFingerprints.filter((item) => typeof item === "string") : [],
  };
}

export function compareSourceSnapshots({ source, previous, current, collectedAt, absenceConfirmations = 2 } = {}) {
  const before = cleanSnapshot(previous);
  if (!current?.ok) {
    return {
      candidates: [],
      nextSnapshot: before,
      sourceHealth: { sourceId: source.id, state: "failing", collectedAt, errorCode: current?.errorCode || "COLLECTION_FAILED" },
    };
  }
  if (!Number.isInteger(absenceConfirmations) || absenceConfirmations < 2 || absenceConfirmations > 10) throw new Error("Absence confirmations must be an integer from 2 to 10.");
  const currentEntries = Array.isArray(current.entries) ? current.entries : [];
  const oldById = new Map(before.entries.map((entry) => [identity(entry), entry]));
  const newById = new Map(currentEntries.map((entry) => [identity(entry), entry]));
  if ([...oldById.keys(), ...newById.keys()].some((id) => !id)) throw new Error("Every source entry needs a stable identity.");
  const resolved = new Set(before.resolvedFingerprints);
  const candidates = [];

  for (const [id, entry] of newById) {
    const old = oldById.get(id);
    let changeType = null;
    if (!old) changeType = "new";
    else if (old.canonicalUrl !== entry.canonicalUrl) changeType = "redirected";
    else if (candidateFingerprint(old) !== candidateFingerprint(entry)) changeType = "changed";
    if (changeType) {
      const candidate = buildReviewCandidate({ source, current: entry, previous: old || null, collectedAt, changeType });
      if (!resolved.has(candidate.fingerprint)) candidates.push(candidate);
    }
  }

  const absenceCounts = {};
  const retainedAbsent = [];
  for (const [id, entry] of oldById) {
    if (newById.has(id)) continue;
    const count = Math.min(absenceConfirmations, Number(before.absenceCounts[id] || 0) + 1);
    absenceCounts[id] = count;
    if (count >= absenceConfirmations) {
      const candidate = buildReviewCandidate({ source, current: null, previous: entry, collectedAt, changeType: "removed" });
      if (!resolved.has(candidate.fingerprint)) candidates.push(candidate);
    } else retainedAbsent.push(entry);
  }

  candidates.sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.id.localeCompare(right.id));
  const entries = [...currentEntries, ...retainedAbsent].sort((left, right) => identity(left).localeCompare(identity(right)));
  return {
    candidates,
    nextSnapshot: { entries, absenceCounts, resolvedFingerprints: [...resolved].sort() },
    sourceHealth: { sourceId: source.id, state: "active", collectedAt, itemCount: currentEntries.length },
  };
}
