import { randomUUID } from "node:crypto";

function collectionStore(firestore, name) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection(name);
  return {
    async list(uid) {
      const snapshot = await reference(uid).orderBy("updatedAt", "desc").get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    async create(uid, input) {
      const id = randomUUID();
      const now = new Date();
      const item = { ...input, createdAt: now, updatedAt: now };
      await reference(uid).doc(id).set(item);
      return { id, ...item };
    },
    async update(uid, id, input) {
      const doc = reference(uid).doc(id);
      const existing = await doc.get();
      if (!existing.exists) return null;
      const item = { ...input, updatedAt: new Date() };
      await doc.set(item, { merge: true });
      return { id, ...existing.data(), ...item };
    },
    async remove(uid, id) {
      const doc = reference(uid).doc(id);
      const existing = await doc.get();
      if (!existing.exists) return false;
      await doc.delete();
      return true;
    },
  };
}

export function createFirestoreStore(firestore) {
  return {
    profiles: {
      async get(uid) {
        const doc = await firestore.collection("users").doc(uid).get();
        return doc.exists ? { uid, ...doc.data() } : null;
      },
      async set(uid, input) {
        const data = { ...input, updatedAt: new Date() };
        await firestore.collection("users").doc(uid).set(data, { merge: true });
        return { uid, ...data };
      },
    },
    tasks: collectionStore(firestore, "tasks"),
    documents: collectionStore(firestore, "documents"),
    resources: collectionStore(firestore, "savedResources"),
    conversations: collectionStore(firestore, "conversations"),
  };
}
