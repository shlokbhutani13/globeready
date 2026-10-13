export const updateLifecycleStates = Object.freeze(["current", "corrected", "superseded", "withdrawn"]);

function relatedTarget(candidate, items) {
  if (!candidate?.relatedExternalId) return null;
  return items.find((item) => item.sourceId === candidate.sourceId
    && item.externalId === candidate.relatedExternalId) || null;
}

function proposedState(candidate) {
  if (candidate?.documentType === "correction") return "corrected";
  if (candidate?.sourceLegalState === "withdrawn" || candidate?.legalState === "withdrawn") return "withdrawn";
  return "superseded";
}

export function proposeLifecycleRelation(candidate, existingItems = []) {
  const target = relatedTarget(candidate, existingItems);
  if (!target || target.id === candidate.id) return null;
  return {
    type: "lifecycle-relation",
    status: "pending",
    sourceId: candidate.sourceId,
    itemId: target.id,
    replacementItemId: candidate.id,
    proposedState: proposedState(candidate),
  };
}

function reaches(startId, targetId, items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const seen = new Set();
  let current = byId.get(startId);
  while (current?.replacementItemId && !seen.has(current.id)) {
    if (current.replacementItemId === targetId) return true;
    seen.add(current.id);
    current = byId.get(current.replacementItemId);
  }
  return false;
}

export function approvedLifecyclePatch(item, { state, replacementItem } = {}, items = []) {
  if (!updateLifecycleStates.includes(state) || state === "current") throw new Error("Lifecycle state is invalid.");
  if (!replacementItem?.id) throw new Error("Lifecycle replacement is required.");
  if (replacementItem.id === item?.id) throw new Error("An update cannot replace itself.");
  if (!item?.sourceId || replacementItem.sourceId !== item.sourceId) {
    throw new Error("Lifecycle items must come from the same verified source.");
  }
  if (replacementItem.replacementItemId === item.id
    || replacementItem.supersededByIds?.includes(item.id)
    || reaches(replacementItem.id, item.id, items)) {
    throw new Error("Lifecycle relation would create a cycle.");
  }
  return { lifecycleState: state, replacementItemId: replacementItem.id };
}
