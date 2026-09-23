import { randomUUID } from "node:crypto";
import { isPublished, publicNewsItem } from "./news/schema.js";

function createCollection() {
  const byUser = new Map();
  const userItems = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    return byUser.get(uid);
  };

  return {
    async list(uid) {
      return [...userItems(uid).values()].sort((a, b) =>
        String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
      );
    },
    async create(uid, input) {
      const now = new Date().toISOString();
      const item = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      userItems(uid).set(item.id, item);
      return item;
    },
    async update(uid, id, input) {
      const current = userItems(uid).get(id);
      if (!current) return null;
      const item = { ...current, ...input, id, updatedAt: new Date().toISOString() };
      userItems(uid).set(id, item);
      return item;
    },
    async remove(uid, id) {
      return userItems(uid).delete(id);
    },
  };
}

function leaseLostError() {
  const error = new Error("News synchronization lease ownership was lost.");
  error.code = "LEASE_LOST";
  return error;
}

async function assertFence(leases, fence) {
  if (!fence) return;
  if (!leases || typeof leases.owns !== "function" || !await leases.owns(fence.key, fence.owner)) {
    throw leaseLostError();
  }
}

export function createGlobalCollection({ leases, items = new Map() } = {}) {

  return {
    async listGlobal() {
      return [...items.values()].sort((a, b) =>
        String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
      );
    },
    async get(id) {
      return items.get(id) || null;
    },
    async create(input, { fence } = {}) {
      await assertFence(leases, fence);
      const now = new Date().toISOString();
      const item = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      items.set(item.id, item);
      return item;
    },
    async upsert(id, input, { fence } = {}) {
      if (typeof id !== "string" || !id) throw new Error("Collection upsert ID is required.");
      await assertFence(leases, fence);
      const now = new Date().toISOString();
      const current = items.get(id);
      const item = current
        ? { ...current, ...input, id, updatedAt: now }
        : { id, ...input, createdAt: now, updatedAt: now };
      items.set(id, item);
      return { item, created: !current, changed: !current || JSON.stringify(current) !== JSON.stringify(item) };
    },
    async update(id, input, { fence } = {}) {
      const current = items.get(id);
      if (!current) return null;
      await assertFence(leases, fence);
      const item = { ...current, ...input, id, updatedAt: new Date().toISOString() };
      items.set(id, item);
      return item;
    },
    async remove(id) {
      return items.delete(id);
    },
  };
}

function createNewsStore({ reviewQueue, leases }) {
  const itemsBySourceKey = new Map();
  const revisionsByItemId = new Map();
  const urgency = new Map([
    ["critical", 4],
    ["urgent", 3],
    ["high", 2],
    ["medium", 1],
    ["low", 0],
  ]);

  const matchesFilters = (item, filters) => {
    if (filters.topic && !item.topics?.includes(filters.topic)) return false;
    if (filters.visaType && !item.visaTypes?.includes(filters.visaType)) return false;
    if (filters.universityId && !item.universityIds?.includes(filters.universityId)) return false;
    return !filters.legalState || item.legalState === filters.legalState;
  };

  const ingestedEditorialState = (current, input) => {
    if (input.editorialState === "approved") return "review-required";
    if (input.editorialState) return input.editorialState;
    return current?.editorialState === "approved" ? "review-required" : current?.editorialState;
  };

  return {
    async get(id) {
      return [...itemsBySourceKey.values()].find((item) => item.id === id) || null;
    },
    async getBySourceKey(sourceKey) {
      return itemsBySourceKey.get(sourceKey) || null;
    },
    async listInternal() {
      return [...itemsBySourceKey.values()];
    },
    async updateInternal(id, input, { fence } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      if (!current) return null;
      await assertFence(leases, fence);
      const cleanInput = { ...(input || {}) };
      if (cleanInput.editorialState === "approved") cleanInput.editorialState = "review-required";
      const changesReviewContent = ["plainLanguageSummary", "summaryProvenance", "actions"]
        .some((field) => Object.hasOwn(cleanInput, field));
      const item = {
        ...current,
        ...cleanInput,
        id,
        sourceKey: current.sourceKey,
        recordUpdatedAt: new Date().toISOString(),
      };
      if (current.editorialState === "approved" && changesReviewContent) {
        item.editorialState = "review-required";
        item.plainLanguageSummary = "";
        item.summaryProvenance = null;
        item.actions = [];
        delete item.reviewerUid;
        delete item.reviewedAt;
        delete item.reviewId;
        delete item.approvalEvidence;
      }
      itemsBySourceKey.set(current.sourceKey, item);
      return item;
    },
    async reviseInternal(id, input, { fence } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      if (!current) return null;
      const changed = Object.entries(input).some(([key, value]) => JSON.stringify(current[key]) !== JSON.stringify(value));
      if (!changed) return current;
      await assertFence(leases, fence);
      const now = new Date().toISOString();
      const revision = { ...current, id: randomUUID(), newsItemId: current.id, revisedAt: now };
      if (!revisionsByItemId.has(current.id)) revisionsByItemId.set(current.id, []);
      revisionsByItemId.get(current.id).push(revision);
      const merged = { ...current, ...input };
      const item = {
        ...merged,
        id: current.id,
        sourceKey: current.sourceKey,
        currentRevisionId: randomUUID(),
        editorialState: merged.sourceVerified && merged.relevance === "relevant"
          ? "published-source-only"
          : "review-required",
        plainLanguageSummary: "",
        summaryProvenance: null,
        actions: [],
        recordUpdatedAt: now,
      };
      delete item.reviewerUid;
      delete item.reviewedAt;
      delete item.reviewId;
      delete item.approvalEvidence;
      itemsBySourceKey.set(current.sourceKey, item);
      return item;
    },
    async upsert(sourceKey, input, { fence } = {}) {
      const now = new Date().toISOString();
      const current = itemsBySourceKey.get(sourceKey);
      const editorialState = ingestedEditorialState(current, input);
      await assertFence(leases, fence);
      if (!current) {
        const item = {
          id: randomUUID(),
          ...input,
          editorialState,
          sourceKey,
          currentRevisionId: randomUUID(),
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          recordUpdatedAt: now,
          relatedIds: [],
          supersedesIds: [],
          supersededByIds: [],
        };
        itemsBySourceKey.set(sourceKey, item);
        return { item, created: true, changed: true };
      }

      if (current.contentHash === input.contentHash) {
        const item = {
          ...current,
          ...(Object.hasOwn(input, "snapshotPath") ? { snapshotPath: input.snapshotPath } : {}),
          ...(Object.hasOwn(input, "snapshotCommitId") ? { snapshotCommitId: input.snapshotCommitId } : {}),
          lastSeenAt: now,
          recordUpdatedAt: now,
        };
        itemsBySourceKey.set(sourceKey, item);
        return { item, created: false, changed: false };
      }

      const revision = {
        ...current,
        id: randomUUID(),
        newsItemId: current.id,
        revisedAt: now,
      };
      if (!revisionsByItemId.has(current.id)) revisionsByItemId.set(current.id, []);
      revisionsByItemId.get(current.id).push(revision);

      const item = {
        ...current,
        ...input,
        editorialState,
        id: current.id,
        sourceKey,
        currentRevisionId: randomUUID(),
        firstSeenAt: current.firstSeenAt,
        lastSeenAt: now,
        createdAt: current.createdAt,
        recordUpdatedAt: now,
      };
      delete item.reviewerUid;
      delete item.reviewedAt;
      delete item.reviewId;
      delete item.approvalEvidence;
      itemsBySourceKey.set(sourceKey, item);
      return { item, created: false, changed: true };
    },
    async approve(id, { reviewerUid, reviewedAt, reviewId } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      const review = await reviewQueue.get(reviewId);
      if (!current || !review || review.newsItemId !== id) {
        throw new Error("News approval requires a matching review record.");
      }
      if (typeof reviewerUid !== "string" || !reviewerUid.trim() || typeof reviewedAt !== "string" || !reviewedAt) {
        throw new Error("News approval requires reviewer metadata.");
      }
      if (review.status === "consumed") {
        if (current.editorialState === "approved" && current.reviewId === reviewId
          && review.consumedBy === reviewerUid.trim() && review.consumedAt === reviewedAt) return current;
        throw new Error("News approval cannot reuse a consumed review.");
      }
      if (review.status !== "validated" || review.editorialState !== "review-required"
        || typeof review.reason !== "string" || !review.reason.trim()
        || review.contentHash !== current.contentHash
        || review.revisionId !== current.currentRevisionId) {
        throw new Error("News approval requires a validated review for the current content revision.");
      }
      const evidence = review.validationEvidence;
      if (!evidence || evidence.contentHash !== current.contentHash
        || evidence.revisionId !== current.currentRevisionId || evidence.sourceVerified !== true
        || evidence.snapshotCommitId !== (current.snapshotCommitId ?? null)) {
        throw new Error("News approval requires validation evidence for the current content revision.");
      }
      if (!review.draft || typeof review.draft.plainLanguageSummary !== "string"
        || !Array.isArray(review.draft.actions)) {
        throw new Error("News approval requires a stored reviewed draft.");
      }

      const item = {
        ...current,
        editorialState: "approved",
        plainLanguageSummary: review.draft.plainLanguageSummary.trim(),
        actions: review.draft.actions,
        summaryProvenance: evidence,
        reviewerUid: reviewerUid.trim(),
        reviewedAt,
        reviewId,
        approvalEvidence: evidence,
        recordUpdatedAt: new Date().toISOString(),
      };
      itemsBySourceKey.set(item.sourceKey, item);
      await reviewQueue.update(reviewId, {
        status: "consumed",
        consumedBy: reviewerUid.trim(),
        consumedAt: reviewedAt,
        approvalNewsItemId: id,
      });
      return item;
    },
    async revisions(id) {
      return revisionsByItemId.get(id) || [];
    },
    async listPublished(filters = {}) {
      return [...itemsBySourceKey.values()]
        .filter(isPublished)
        .filter((item) => matchesFilters(item, filters))
        .sort((left, right) => {
          const urgencyDifference = (urgency.get(right.urgency) || 0) - (urgency.get(left.urgency) || 0);
          if (urgencyDifference) return urgencyDifference;
          return String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""));
        })
        .map(publicNewsItem);
    },
  };
}

function createLeaseStore() {
  const leases = new Map();
  return {
    async acquire(key, owner, expiresAt) {
      const current = leases.get(key);
      if (current && Date.parse(current.expiresAt) > Date.now()) return false;
      leases.set(key, { owner, expiresAt });
      return true;
    },
    async renew(key, owner, expiresAt) {
      const current = leases.get(key);
      if (!current || current.owner !== owner || Date.parse(current.expiresAt) <= Date.now()) return false;
      leases.set(key, { owner, expiresAt });
      return true;
    },
    async owns(key, owner) {
      const current = leases.get(key);
      return Boolean(current && current.owner === owner && Date.parse(current.expiresAt) > Date.now());
    },
    async release(key, owner) {
      const current = leases.get(key);
      if (!current || current.owner !== owner) return false;
      leases.delete(key);
      return true;
    },
  };
}

function createNewsPreferencesStore() {
  const preferencesByUser = new Map();
  return {
    async get(uid) {
      return preferencesByUser.get(uid) || null;
    },
    async set(uid, input) {
      const preference = {
        ...(preferencesByUser.get(uid) || {}),
        ...input,
        uid,
        updatedAt: new Date().toISOString(),
      };
      preferencesByUser.set(uid, preference);
      return preference;
    },
  };
}

function createConversationMessageCollection() {
  const byUser = new Map();
  const messages = (uid, conversationId) => {
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    const conversations = byUser.get(uid);
    if (!conversations.has(conversationId)) conversations.set(conversationId, new Map());
    return conversations.get(conversationId);
  };

  return {
    async list(uid, conversationId) {
      return [...messages(uid, conversationId).values()].sort((a, b) =>
        String(a.createdAt).localeCompare(String(b.createdAt)),
      );
    },
    async create(uid, conversationId, input) {
      const now = new Date().toISOString();
      const item = { id: randomUUID(), ...input, conversationId, createdAt: now, updatedAt: now };
      messages(uid, conversationId).set(item.id, item);
      return item;
    },
    async remove(uid, conversationId, id) {
      return messages(uid, conversationId).delete(id);
    },
  };
}

function createRagChunkCollection() {
  const byUser = new Map();
  const userItems = (uid) => {
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    return byUser.get(uid);
  };

  return {
    async list(uid, { documentId } = {}) {
      return [...userItems(uid).values()]
        .filter((item) => !documentId || item.documentId === documentId)
        .sort((left, right) => left.index - right.index);
    },
    async replace(uid, documentId, chunks) {
      const items = userItems(uid);
      for (const [id, item] of items) {
        if (item.documentId === documentId) items.delete(id);
      }
      const now = new Date().toISOString();
      const stored = chunks.map((chunk) => ({
        id: randomUUID(),
        ...chunk,
        documentId,
        createdAt: now,
        updatedAt: now,
      }));
      for (const item of stored) items.set(item.id, item);
      return stored;
    },
    async removeForDocument(uid, documentId) {
      const items = userItems(uid);
      for (const [id, item] of items) {
        if (item.documentId === documentId) items.delete(id);
      }
    },
  };
}

export function createDemoStore() {
  const profiles = new Map();
  const leases = createLeaseStore();
  const sourceItems = new Map();
  const runItems = new Map();
  const reviewQueue = createGlobalCollection({ leases });
  const newsSources = createGlobalCollection({ leases, items: sourceItems });
  const newsRuns = createGlobalCollection({ leases, items: runItems });
  return {
    profiles: {
      async get(uid) {
        return profiles.get(uid) || null;
      },
      async set(uid, input) {
        const profile = {
          ...(profiles.get(uid) || {}),
          ...input,
          uid,
          updatedAt: new Date().toISOString(),
        };
        profiles.set(uid, profile);
        return profile;
      },
    },
    tasks: createCollection(),
    documents: createCollection(),
    resources: createCollection(),
    conversations: createCollection(),
    ragChunks: createRagChunkCollection(),
    news: createNewsStore({ reviewQueue, leases }),
    newsSources,
    newsRuns,
    newsSyncState: {
      async commit(sourceId, sourceInput, runInput, { fence } = {}) {
        await assertFence(leases, fence);
        const now = new Date().toISOString();
        const current = sourceItems.get(sourceId);
        const source = current
          ? { ...current, ...sourceInput, id: sourceId, updatedAt: now }
          : { id: sourceId, ...sourceInput, createdAt: now, updatedAt: now };
        const run = { id: randomUUID(), ...runInput, createdAt: now, updatedAt: now };
        sourceItems.set(sourceId, source);
        runItems.set(run.id, run);
        return { source, run };
      },
    },
    reviewQueue,
    leases,
    newsPreferences: createNewsPreferencesStore(),
    savedNews: createCollection(),
    notifications: createCollection(),
    conversationMessages: createConversationMessageCollection(),
  };
}
