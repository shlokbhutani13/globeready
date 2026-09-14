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

export function createGlobalCollection() {
  const items = new Map();

  return {
    async listGlobal() {
      return [...items.values()].sort((a, b) =>
        String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)),
      );
    },
    async get(id) {
      return items.get(id) || null;
    },
    async create(input) {
      const now = new Date().toISOString();
      const item = { id: randomUUID(), ...input, createdAt: now, updatedAt: now };
      items.set(item.id, item);
      return item;
    },
    async upsert(id, input) {
      if (typeof id !== "string" || !id) throw new Error("Collection upsert ID is required.");
      const now = new Date().toISOString();
      const current = items.get(id);
      const item = current
        ? { ...current, ...input, id, updatedAt: now }
        : { id, ...input, createdAt: now, updatedAt: now };
      items.set(id, item);
      return { item, created: !current, changed: !current || JSON.stringify(current) !== JSON.stringify(item) };
    },
    async update(id, input) {
      const current = items.get(id);
      if (!current) return null;
      const item = { ...current, ...input, id, updatedAt: new Date().toISOString() };
      items.set(id, item);
      return item;
    },
    async remove(id) {
      return items.delete(id);
    },
  };
}

function createNewsStore({ reviewQueue }) {
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
    async updateInternal(id, input) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      if (!current) return null;
      const item = { ...current, ...input, id, sourceKey: current.sourceKey, recordUpdatedAt: new Date().toISOString() };
      itemsBySourceKey.set(current.sourceKey, item);
      return item;
    },
    async upsert(sourceKey, input) {
      const now = new Date().toISOString();
      const current = itemsBySourceKey.get(sourceKey);
      const editorialState = ingestedEditorialState(current, input);
      if (!current) {
        const item = {
          id: randomUUID(),
          ...input,
          editorialState,
          sourceKey,
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
        const item = { ...current, lastSeenAt: now, recordUpdatedAt: now };
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
    async approve(id, { reviewerUid, reviewedAt, summary, reviewId, approvalEvidence } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      const review = await reviewQueue.get(reviewId);
      if (!current || !review || review.newsItemId !== id) {
        throw new Error("News approval requires a matching review record.");
      }
      if (typeof reviewerUid !== "string" || !reviewerUid.trim() || typeof reviewedAt !== "string" || !reviewedAt) {
        throw new Error("News approval requires reviewer metadata.");
      }

      const item = {
        ...current,
        editorialState: "approved",
        plainLanguageSummary: typeof summary === "string" ? summary.trim() : "",
        reviewerUid: reviewerUid.trim(),
        reviewedAt,
        reviewId,
        approvalEvidence: approvalEvidence || null,
        recordUpdatedAt: new Date().toISOString(),
      };
      itemsBySourceKey.set(item.sourceKey, item);
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
      if (!current || current.owner !== owner) return false;
      leases.set(key, { owner, expiresAt });
      return true;
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
  const reviewQueue = createGlobalCollection();
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
    news: createNewsStore({ reviewQueue }),
    newsSources: createGlobalCollection(),
    newsRuns: createGlobalCollection(),
    reviewQueue,
    leases: createLeaseStore(),
    newsPreferences: createNewsPreferencesStore(),
    savedNews: createCollection(),
    notifications: createCollection(),
    conversationMessages: createConversationMessageCollection(),
  };
}
