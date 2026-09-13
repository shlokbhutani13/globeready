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

function createNewsStore() {
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

  return {
    async get(id) {
      return [...itemsBySourceKey.values()].find((item) => item.id === id) || null;
    },
    async upsert(sourceKey, input) {
      const now = new Date().toISOString();
      const current = itemsBySourceKey.get(sourceKey);
      if (!current) {
        const item = {
          id: randomUUID(),
          ...input,
          sourceKey,
          firstSeenAt: now,
          lastSeenAt: now,
          createdAt: now,
          recordUpdatedAt: now,
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
        id: current.id,
        sourceKey,
        firstSeenAt: current.firstSeenAt,
        lastSeenAt: now,
        createdAt: current.createdAt,
        recordUpdatedAt: now,
      };
      itemsBySourceKey.set(sourceKey, item);
      return { item, created: false, changed: true };
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
    news: createNewsStore(),
    newsSources: createGlobalCollection(),
    newsRuns: createGlobalCollection(),
    reviewQueue: createGlobalCollection(),
    newsPreferences: createNewsPreferencesStore(),
    savedNews: createCollection(),
    notifications: createCollection(),
    conversationMessages: createConversationMessageCollection(),
  };
}
