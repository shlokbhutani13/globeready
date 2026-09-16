import { createHash, randomUUID } from "node:crypto";

import { isPublished } from "./news/schema.js";

const urgencyRanks = new Map([
  ["critical", 4],
  ["urgent", 3],
  ["high", 2],
  ["medium", 1],
  ["low", 0],
]);
const publicNewsFields = new Set([
  "id", "sourceId", "sourceKey", "externalId", "relatedExternalId", "canonicalUrl",
  "officialPdfUrl", "sourceVerified", "title", "publisher", "publishedAt", "updatedAt",
  "effectiveAt", "expiresAt", "sourceDocumentType", "sourceLegalState", "documentType",
  "legalState", "editorialState", "docketNumber", "regulationIdNumber", "excerpt",
  "sourceExcerpt", "plainLanguageSummary", "actions", "urgency",
  "relevance", "highImpact", "topics", "visaTypes", "nationalities", "universityIds",
  "journeyStages", "relatedIds", "supersedesIds", "supersededByIds", "firstSeenAt",
  "lastSeenAt", "createdAt", "recordUpdatedAt",
]);

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function withoutUndefined(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== undefined).map(withoutUndefined);
  if (!isPlainObject(value)) return value;
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = withoutUndefined(entry);
  }
  return result;
}

function atApiBoundary(value) {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") {
    const date = value.toDate();
    if (date instanceof Date && !Number.isNaN(date.valueOf())) return date.toISOString();
  }
  if (Array.isArray(value)) return value.map(atApiBoundary);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, atApiBoundary(entry)]));
}

function documentValue(snapshot) {
  return snapshot?.exists ? atApiBoundary({ id: snapshot.id, ...snapshot.data() }) : null;
}

function stableId(value) {
  return createHash("sha256").update(value).digest("hex");
}

function leaseLostError() {
  const error = new Error("News synchronization lease ownership was lost.");
  error.code = "LEASE_LOST";
  return error;
}

function leaseReference(firestore, key) {
  return firestore.collection("newsLeases").doc(stableId(key));
}

function leaseExpiry(value) {
  if (value instanceof Date) return value.valueOf();
  if (value && typeof value.toDate === "function") return value.toDate().valueOf();
  return Date.parse(value);
}

async function assertFence(transaction, firestore, fence) {
  if (!fence) return;
  if (typeof fence.key !== "string" || !fence.key || typeof fence.owner !== "string" || !fence.owner) {
    throw leaseLostError();
  }
  const snapshot = await transaction.get(leaseReference(firestore, fence.key));
  const lease = snapshot.exists ? snapshot.data() : null;
  if (!lease || lease.key !== fence.key || lease.owner !== fence.owner || leaseExpiry(lease.expiresAt) <= Date.now()) {
    throw leaseLostError();
  }
}

function timestampedInput(input, current = null) {
  const now = new Date();
  return {
    ...(current || {}),
    ...withoutUndefined(input || {}),
    ...(current ? {} : { createdAt: now }),
    updatedAt: now,
  };
}

function globalCollectionStore(firestore, name) {
  const collection = firestore.collection(name);
  return {
    async listGlobal() {
      const snapshot = await collection.get();
      return snapshot.docs.map(documentValue).sort((left, right) =>
        String(right.updatedAt || right.createdAt || "").localeCompare(String(left.updatedAt || left.createdAt || ""))
        || left.id.localeCompare(right.id));
    },
    async get(id) {
      if (typeof id !== "string" || !id) return null;
      return documentValue(await collection.doc(id).get());
    },
    async create(input, { fence } = {}) {
      const id = randomUUID();
      const reference = collection.doc(id);
      const item = await firestore.runTransaction(async (transaction) => {
        await assertFence(transaction, firestore, fence);
        const next = timestampedInput(input);
        transaction.set(reference, next);
        return next;
      });
      return atApiBoundary({ id, ...item });
    },
    async upsert(id, input, { fence } = {}) {
      if (typeof id !== "string" || !id) throw new Error("Collection upsert ID is required.");
      const reference = collection.doc(id);
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        await assertFence(transaction, firestore, fence);
        const current = snapshot.exists ? snapshot.data() : null;
        const cleanInput = withoutUndefined(input || {});
        const changed = !current || Object.entries(cleanInput)
          .some(([key, value]) => JSON.stringify(atApiBoundary(current[key])) !== JSON.stringify(atApiBoundary(value)));
        const item = timestampedInput(cleanInput, current);
        transaction.set(reference, item);
        return { item, created: !current, changed };
      });
      return { ...result, item: atApiBoundary({ id, ...result.item }) };
    },
    async update(id, input, { fence } = {}) {
      if (typeof id !== "string" || !id) return null;
      const reference = collection.doc(id);
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) return null;
        await assertFence(transaction, firestore, fence);
        const item = timestampedInput(input, snapshot.data());
        transaction.set(reference, item);
        return item;
      });
      return result ? atApiBoundary({ id, ...result }) : null;
    },
    async remove(id) {
      if (typeof id !== "string" || !id) return false;
      const reference = collection.doc(id);
      const snapshot = await reference.get();
      if (!snapshot.exists) return false;
      await reference.delete();
      return true;
    },
  };
}

function userCollectionStore(firestore, name, { defaults = {} } = {}) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection(name);
  return {
    async list(uid) {
      const snapshot = await reference(uid).orderBy("updatedAt", "desc").get();
      return snapshot.docs.map(documentValue);
    },
    async create(uid, input) {
      const id = randomUUID();
      const now = new Date();
      const item = withoutUndefined({ ...defaults, ...(input || {}), createdAt: now, updatedAt: now });
      await reference(uid).doc(id).set(item);
      return atApiBoundary({ id, ...item });
    },
    async update(uid, id, input) {
      const document = reference(uid).doc(id);
      const existing = await document.get();
      if (!existing.exists) return null;
      const item = withoutUndefined({ ...existing.data(), ...(input || {}), updatedAt: new Date() });
      await document.set(item);
      return atApiBoundary({ id, ...item });
    },
    async remove(uid, id) {
      const document = reference(uid).doc(id);
      const existing = await document.get();
      if (!existing.exists) return false;
      await document.delete();
      return true;
    },
  };
}

function newsPreferencesStore(firestore) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection("newsPreferences").doc("profile");
  return {
    async get(uid) {
      const snapshot = await reference(uid).get();
      return snapshot.exists ? atApiBoundary({ uid, ...snapshot.data() }) : null;
    },
    async set(uid, input) {
      const document = reference(uid);
      const current = await document.get();
      const item = withoutUndefined({
        ...(current.exists ? current.data() : {}),
        ...(input || {}),
        updatedAt: new Date(),
      });
      await document.set(item);
      return atApiBoundary({ uid, ...item });
    },
  };
}

function conversationMessageStore(firestore) {
  const reference = (uid, conversationId) => firestore.collection("users").doc(uid)
    .collection("conversations").doc(conversationId).collection("messages");
  return {
    async list(uid, conversationId) {
      const snapshot = await reference(uid, conversationId).orderBy("createdAt", "asc").get();
      return snapshot.docs.map(documentValue);
    },
    async create(uid, conversationId, input) {
      const id = randomUUID();
      const now = new Date();
      const item = withoutUndefined({ ...(input || {}), conversationId, createdAt: now, updatedAt: now });
      await reference(uid, conversationId).doc(id).set(item);
      return atApiBoundary({ id, ...item });
    },
    async remove(uid, conversationId, id) {
      const document = reference(uid, conversationId).doc(id);
      const existing = await document.get();
      if (!existing.exists) return false;
      await document.delete();
      return true;
    },
  };
}

function ragChunkStore(firestore) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection("ragChunks");
  return {
    async list(uid, { documentId } = {}) {
      let query = reference(uid);
      if (documentId) query = query.where("documentId", "==", documentId);
      const snapshot = await query.get();
      return snapshot.docs.map(documentValue).sort((left, right) => left.index - right.index);
    },
    async replace(uid, documentId, chunks) {
      const existing = await reference(uid).where("documentId", "==", documentId).get();
      const batch = firestore.batch();
      for (const document of existing.docs) batch.delete(document.ref);
      const now = new Date();
      const stored = chunks.map((chunk) => {
        const id = randomUUID();
        const item = withoutUndefined({ ...chunk, uid, documentId, createdAt: now, updatedAt: now });
        batch.set(reference(uid).doc(id), item);
        return atApiBoundary({ id, ...item });
      });
      await batch.commit();
      return stored;
    },
    async removeForDocument(uid, documentId) {
      const existing = await reference(uid).where("documentId", "==", documentId).get();
      const batch = firestore.batch();
      for (const document of existing.docs) batch.delete(document.ref);
      await batch.commit();
    },
  };
}

function publicNewsDocument(item) {
  const publicItem = {};
  for (const field of publicNewsFields) {
    if (Object.hasOwn(item, field) && item[field] !== undefined) publicItem[field] = item[field];
  }
  if (item.editorialState !== "approved") {
    publicItem.plainLanguageSummary = "";
    publicItem.actions = [];
  }
  return withoutUndefined(publicItem);
}

function ingestionEditorialState(current, input) {
  if (input.editorialState === "approved") return "review-required";
  if (typeof input.editorialState === "string" && input.editorialState) return input.editorialState;
  return current?.editorialState === "approved" ? "review-required" : current?.editorialState;
}

function clearApprovalMetadata(item) {
  const result = { ...item };
  delete result.reviewerUid;
  delete result.reviewedAt;
  delete result.reviewId;
  delete result.approvalEvidence;
  return result;
}

function withoutApproval(item) {
  return clearApprovalMetadata({ ...item, plainLanguageSummary: "", summaryProvenance: null, actions: [] });
}

function newsReferences(firestore, id) {
  const publicReference = firestore.collection("newsItems").doc(id);
  return {
    publicReference,
    privateReference: firestore.collection("newsItemState").doc(id),
    revisions: publicReference.collection("revisions"),
  };
}

function newsItemFromSnapshot(snapshot) {
  return snapshot?.exists ? atApiBoundary({ id: snapshot.id, ...snapshot.data() }) : null;
}

function changedFields(current, input) {
  return Object.entries(input).some(([key, value]) =>
    JSON.stringify(atApiBoundary(current[key])) !== JSON.stringify(atApiBoundary(value)));
}

function urgencyRank(item) {
  return urgencyRanks.get(item.urgency) ?? -1;
}

function compareNews(left, right) {
  return urgencyRank(right) - urgencyRank(left)
    || String(right.publishedAt || "").localeCompare(String(left.publishedAt || ""))
    || String(left.id).localeCompare(String(right.id));
}

function filterSignature(filters) {
  return JSON.stringify({
    topic: filters.topic || null,
    visaType: filters.visaType || null,
    universityId: filters.universityId || null,
    legalState: filters.legalState || null,
  });
}

function encodeCursor(item, filters) {
  return Buffer.from(JSON.stringify({
    urgency: item.urgency || null,
    publishedAt: item.publishedAt || null,
    id: item.id,
    filters: filterSignature(filters),
  })).toString("base64url");
}

function decodeCursor(value, filters) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 4_096) throw new Error("News cursor is invalid.");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor.id !== "string" || cursor.filters !== filterSignature(filters)) throw new Error();
    return cursor;
  } catch {
    throw new Error("News cursor is invalid.");
  }
}

function pageResult(items, cursor) {
  Object.defineProperties(items, {
    items: { value: items, enumerable: false },
    cursor: { value: cursor, enumerable: false },
  });
  return items;
}

function matchesNewsFilters(item, filters) {
  if (filters.topic && !item.topics?.includes(filters.topic)) return false;
  if (filters.visaType && !item.visaTypes?.includes(filters.visaType)) return false;
  if (filters.universityId && !item.universityIds?.includes(filters.universityId)) return false;
  return !filters.legalState || item.legalState === filters.legalState;
}

function newsItemStore(firestore) {
  const privateCollection = firestore.collection("newsItemState");
  return {
    async get(id) {
      if (typeof id !== "string" || !id) return null;
      return newsItemFromSnapshot(await privateCollection.doc(id).get());
    },
    async getBySourceKey(sourceKey) {
      if (typeof sourceKey !== "string" || !sourceKey) return null;
      const item = newsItemFromSnapshot(await privateCollection.doc(stableId(sourceKey)).get());
      return item?.sourceKey === sourceKey ? item : null;
    },
    async listInternal() {
      const snapshot = await privateCollection.get();
      return snapshot.docs.map(newsItemFromSnapshot);
    },
    async updateInternal(id, input, { fence } = {}) {
      const references = newsReferences(firestore, id);
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(references.privateReference);
        if (!snapshot.exists) return null;
        await assertFence(transaction, firestore, fence);
        const current = snapshot.data();
        const cleanInput = withoutUndefined(input || {});
        if (cleanInput.editorialState === "approved") cleanInput.editorialState = "review-required";
        const changesReviewContent = ["plainLanguageSummary", "summaryProvenance", "actions"]
          .some((field) => Object.hasOwn(cleanInput, field));
        let item = {
          ...current,
          ...cleanInput,
          id,
          sourceKey: current.sourceKey,
          recordUpdatedAt: new Date(),
        };
        if (current.editorialState === "approved" && changesReviewContent) {
          item = clearApprovalMetadata({ ...item, editorialState: "review-required" });
        }
        transaction.set(references.privateReference, withoutUndefined(item));
        transaction.set(references.publicReference, publicNewsDocument(item));
        return item;
      });
      return result ? atApiBoundary(result) : null;
    },
    async reviseInternal(id, input, { fence } = {}) {
      const references = newsReferences(firestore, id);
      if (!fence) {
        const snapshot = await references.privateReference.get();
        if (!snapshot.exists) return null;
        const current = snapshot.data();
        const cleanInput = withoutUndefined(input || {});
        if (!changedFields(current, cleanInput)) return atApiBoundary({ id, ...current });
        const now = new Date();
        const revisionId = randomUUID();
        const revision = { ...current, id: revisionId, newsItemId: id, revisedAt: now };
        const item = withoutApproval({
          ...current,
          ...cleanInput,
          id,
          sourceKey: current.sourceKey,
          editorialState: current.sourceVerified && current.relevance === "relevant"
            ? "published-source-only"
            : "review-required",
          recordUpdatedAt: now,
        });
        const batch = firestore.batch();
        batch.set(references.revisions.doc(revisionId), withoutUndefined(revision));
        batch.set(references.privateReference, withoutUndefined(item));
        batch.set(references.publicReference, publicNewsDocument(item));
        await batch.commit();
        return atApiBoundary(item);
      }
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(references.privateReference);
        if (!snapshot.exists) return null;
        const current = snapshot.data();
        const cleanInput = withoutUndefined(input || {});
        if (!changedFields(current, cleanInput)) return { item: current, changed: false };
        await assertFence(transaction, firestore, fence);
        const now = new Date();
        const revisionId = randomUUID();
        const revision = { ...current, id: revisionId, newsItemId: id, revisedAt: now };
        const item = withoutApproval({
          ...current,
          ...cleanInput,
          id,
          sourceKey: current.sourceKey,
          editorialState: current.sourceVerified && current.relevance === "relevant"
            ? "published-source-only"
            : "review-required",
          recordUpdatedAt: now,
        });
        transaction.set(references.revisions.doc(revisionId), withoutUndefined(revision));
        transaction.set(references.privateReference, withoutUndefined(item));
        transaction.set(references.publicReference, publicNewsDocument(item));
        return { item, changed: true };
      });
      return result ? atApiBoundary(result.item) : null;
    },
    async upsert(sourceKey, input, { fence } = {}) {
      if (typeof sourceKey !== "string" || !sourceKey) throw new Error("News source key is required.");
      const id = stableId(sourceKey);
      const references = newsReferences(firestore, id);
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(references.privateReference);
        await assertFence(transaction, firestore, fence);
        const current = snapshot.exists ? snapshot.data() : null;
        const cleanInput = withoutUndefined(input || {});
        const now = new Date();
        if (!current) {
          const item = withoutApproval({
            id,
            ...cleanInput,
            editorialState: ingestionEditorialState(null, cleanInput),
            sourceKey,
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            recordUpdatedAt: now,
            relatedIds: [],
            supersedesIds: [],
            supersededByIds: [],
          });
          transaction.set(references.privateReference, withoutUndefined(item));
          transaction.set(references.publicReference, publicNewsDocument(item));
          return { item, created: true, changed: true };
        }
        if (current.sourceKey !== sourceKey) throw new Error("News source key hash collision detected.");
        if (current.contentHash === cleanInput.contentHash) {
          const item = {
            ...current,
            ...(Object.hasOwn(cleanInput, "snapshotPath") ? { snapshotPath: cleanInput.snapshotPath } : {}),
            ...(Object.hasOwn(cleanInput, "snapshotCommitId") ? { snapshotCommitId: cleanInput.snapshotCommitId } : {}),
            lastSeenAt: now,
            recordUpdatedAt: now,
          };
          transaction.set(references.privateReference, withoutUndefined(item));
          transaction.set(references.publicReference, publicNewsDocument(item));
          return { item, created: false, changed: false };
        }
        const revisionId = randomUUID();
        const revision = { ...current, id: revisionId, newsItemId: id, revisedAt: now };
        const item = withoutApproval({
          ...current,
          ...cleanInput,
          id,
          editorialState: ingestionEditorialState(current, cleanInput),
          sourceKey,
          firstSeenAt: current.firstSeenAt,
          lastSeenAt: now,
          createdAt: current.createdAt,
          recordUpdatedAt: now,
        });
        transaction.set(references.revisions.doc(revisionId), withoutUndefined(revision));
        transaction.set(references.privateReference, withoutUndefined(item));
        transaction.set(references.publicReference, publicNewsDocument(item));
        return { item, created: false, changed: true };
      });
      return { ...result, item: atApiBoundary(result.item) };
    },
    async approve(id, {
      reviewerUid, reviewedAt, summary, reviewId, approvalEvidence, actions = [], summaryProvenance = null,
    } = {}) {
      if (typeof reviewerUid !== "string" || !reviewerUid.trim()
        || typeof reviewedAt !== "string" || !reviewedAt
        || typeof reviewId !== "string" || !reviewId) {
        throw new Error("News approval requires reviewer metadata.");
      }
      const references = newsReferences(firestore, id);
      const reviewReference = firestore.collection("reviewQueue").doc(reviewId);
      const item = await firestore.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(references.privateReference);
        const reviewSnapshot = await transaction.get(reviewReference);
        if (!currentSnapshot.exists || !reviewSnapshot.exists || reviewSnapshot.data().newsItemId !== id) {
          throw new Error("News approval requires a matching review record.");
        }
        const next = withoutUndefined({
          ...currentSnapshot.data(),
          id,
          editorialState: "approved",
          plainLanguageSummary: typeof summary === "string" ? summary.trim() : "",
          summaryProvenance,
          actions: Array.isArray(actions) ? actions : [],
          reviewerUid: reviewerUid.trim(),
          reviewedAt,
          reviewId,
          approvalEvidence: approvalEvidence || null,
          recordUpdatedAt: new Date(),
        });
        transaction.set(references.privateReference, next);
        transaction.set(references.publicReference, publicNewsDocument(next));
        return next;
      });
      return atApiBoundary(item);
    },
    async revisions(id) {
      const snapshot = await newsReferences(firestore, id).revisions.get();
      return snapshot.docs.map(documentValue).sort((left, right) =>
        String(left.revisedAt).localeCompare(String(right.revisedAt)) || left.id.localeCompare(right.id));
    },
    async listPublished(filters = {}) {
      const limit = filters.limit === undefined ? 50 : filters.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new Error("News page limit must be between 1 and 50.");
      }
      const cursor = decodeCursor(filters.cursor, filters);
      const snapshot = await firestore.collection("newsItems").get();
      const sorted = snapshot.docs.map(documentValue)
        .filter(isPublished)
        .filter((item) => matchesNewsFilters(item, filters))
        .sort(compareNews)
        .filter((item) => !cursor || compareNews(item, cursor) > 0);
      const page = sorted.slice(0, limit);
      const nextCursor = sorted.length > limit ? encodeCursor(page.at(-1), filters) : null;
      return pageResult(page, nextCursor);
    },
  };
}

function leaseStore(firestore) {
  return {
    async acquire(key, owner, expiresAt) {
      if (typeof key !== "string" || !key || typeof owner !== "string" || !owner) {
        throw new Error("Lease key and owner are required.");
      }
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.valueOf()) || expiry.valueOf() <= Date.now()) {
        throw new Error("Lease expiry must be a future date.");
      }
      const reference = leaseReference(firestore, key);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (current && leaseExpiry(current.expiresAt) > Date.now()) return false;
        transaction.set(reference, { key, owner, expiresAt: expiry, updatedAt: new Date() });
        return true;
      });
    },
    async renew(key, owner, expiresAt) {
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.valueOf()) || expiry.valueOf() <= Date.now()) return false;
      const reference = leaseReference(firestore, key);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (!current || current.key !== key || current.owner !== owner || leaseExpiry(current.expiresAt) <= Date.now()) {
          return false;
        }
        transaction.set(reference, { ...current, expiresAt: expiry, updatedAt: new Date() });
        return true;
      });
    },
    async owns(key, owner) {
      const snapshot = await leaseReference(firestore, key).get();
      const current = snapshot.exists ? snapshot.data() : null;
      return Boolean(current && current.key === key && current.owner === owner && leaseExpiry(current.expiresAt) > Date.now());
    },
    async release(key, owner) {
      const reference = leaseReference(firestore, key);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        if (!current || current.key !== key || current.owner !== owner) return false;
        transaction.delete(reference);
        return true;
      });
    },
  };
}

export function createFirestoreStore(firestore) {
  if (!firestore || typeof firestore.collection !== "function"
    || typeof firestore.runTransaction !== "function" || typeof firestore.batch !== "function") {
    throw new Error("A Firestore adapter with transactions and batches is required.");
  }
  const leases = leaseStore(firestore);
  return {
    profiles: {
      async get(uid) {
        const document = await firestore.collection("users").doc(uid).get();
        return document.exists ? atApiBoundary({ uid, ...document.data() }) : null;
      },
      async set(uid, input) {
        const reference = firestore.collection("users").doc(uid);
        const current = await reference.get();
        const data = withoutUndefined({
          ...(current.exists ? current.data() : {}),
          ...(input || {}),
          updatedAt: new Date(),
        });
        await reference.set(data);
        return atApiBoundary({ uid, ...data });
      },
    },
    tasks: userCollectionStore(firestore, "tasks"),
    documents: userCollectionStore(firestore, "documents"),
    resources: userCollectionStore(firestore, "savedResources"),
    conversations: userCollectionStore(firestore, "conversations"),
    ragChunks: ragChunkStore(firestore),
    news: newsItemStore(firestore),
    newsSources: globalCollectionStore(firestore, "newsSources"),
    newsRuns: globalCollectionStore(firestore, "newsRuns"),
    reviewQueue: globalCollectionStore(firestore, "reviewQueue"),
    leases,
    newsPreferences: newsPreferencesStore(firestore),
    savedNews: userCollectionStore(firestore, "savedNews"),
    notifications: userCollectionStore(firestore, "notifications", { defaults: { read: false } }),
    conversationMessages: conversationMessageStore(firestore),
  };
}
