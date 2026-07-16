import { randomUUID } from "node:crypto";

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
  };
}
