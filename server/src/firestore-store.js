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
  "lastSeenAt", "createdAt", "recordUpdatedAt", "urgencyRank", "audienceKeys",
]);
const publishedStates = ["published-source-only", "approved"];
const newsOrder = "urgencyRank:desc,publishedAt:desc,id:asc";

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

function reviewAuditId(reviewId, decision) {
  return stableId(`${reviewId}\0${decision}`);
}

function reviewAuditRecord(review, { decision, reviewerUid, reviewedAt, createdAt }) {
  return withoutUndefined({
    type: "review-decision-audit",
    decision,
    reviewerUid,
    reviewedAt,
    reviewId: review.id,
    newsItemId: review.newsItemId ?? null,
    contentHash: review.contentHash ?? null,
    revisionId: review.revisionId ?? null,
    createdAt,
  });
}

function auditMatches(audit, expected) {
  return audit && ["type", "decision", "reviewerUid", "reviewedAt", "reviewId", "newsItemId", "contentHash", "revisionId"]
    .every((field) => (audit[field] ?? null) === (expected[field] ?? null));
}

function currentDate(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("Store clock returned an invalid date.");
  return date;
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

async function assertFence(transaction, firestore, fence, clock) {
  if (!fence) return;
  if (typeof fence.key !== "string" || !fence.key || typeof fence.owner !== "string" || !fence.owner) {
    throw leaseLostError();
  }
  const snapshot = await transaction.get(leaseReference(firestore, fence.key));
  const lease = snapshot.exists ? snapshot.data() : null;
  if (!lease || lease.key !== fence.key || lease.owner !== fence.owner
    || leaseExpiry(lease.expiresAt) <= currentDate(clock).valueOf()) {
    throw leaseLostError();
  }
}

function timestampedInput(input, current = null, now = new Date()) {
  return {
    ...(current || {}),
    ...withoutUndefined(input || {}),
    ...(current ? {} : { createdAt: now }),
    updatedAt: now,
  };
}

function globalCollectionStore(firestore, name, clock) {
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
        await assertFence(transaction, firestore, fence, clock);
        const next = timestampedInput(input, null, currentDate(clock));
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
        await assertFence(transaction, firestore, fence, clock);
        const current = snapshot.exists ? snapshot.data() : null;
        const cleanInput = withoutUndefined(input || {});
        const changed = !current || Object.entries(cleanInput)
          .some(([key, value]) => JSON.stringify(atApiBoundary(current[key])) !== JSON.stringify(atApiBoundary(value)));
        const item = timestampedInput(cleanInput, current, currentDate(clock));
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
        await assertFence(transaction, firestore, fence, clock);
        const item = timestampedInput(input, snapshot.data(), currentDate(clock));
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

function readOnlyGlobalCollectionStore(firestore, name, clock) {
  const collection = globalCollectionStore(firestore, name, clock);
  return { listGlobal: collection.listGlobal, get: collection.get };
}

function reviewQueueStore(firestore, clock) {
  const reviews = globalCollectionStore(firestore, "reviewQueue", clock);
  return {
    ...reviews,
    async resolve(id, { decision, reviewerUid, reviewedAt } = {}) {
      if (!["reject", "resolve"].includes(decision)
        || typeof reviewerUid !== "string" || !reviewerUid.trim()
        || typeof reviewedAt !== "string" || !reviewedAt) {
        throw new Error("Source suggestion decision is invalid.");
      }
      const reference = firestore.collection("reviewQueue").doc(id);
      const auditReference = firestore.collection("newsReviewAudits").doc(reviewAuditId(id, decision));
      const result = await firestore.runTransaction(async (transaction) => {
        const reviewSnapshot = await transaction.get(reference);
        const auditSnapshot = await transaction.get(auditReference);
        if (!reviewSnapshot.exists) throw new Error("Source suggestion was not found.");
        const review = { id, ...reviewSnapshot.data() };
        if (review.type !== "source-suggestion" || review.status !== "pending") {
          throw new Error("Source suggestion decision is invalid.");
        }
        const now = currentDate(clock);
        const audit = reviewAuditRecord(review, {
          decision, reviewerUid: reviewerUid.trim(), reviewedAt, createdAt: now,
        });
        if (auditSnapshot.exists && !auditMatches(auditSnapshot.data(), audit)) {
          throw new Error("Review decision audit already exists with different metadata.");
        }
        const next = withoutUndefined({
          ...reviewSnapshot.data(),
          status: decision === "reject" ? "rejected" : "resolved",
          decidedBy: reviewerUid.trim(),
          decidedAt: reviewedAt,
          updatedAt: now,
        });
        transaction.set(reference, next);
        if (!auditSnapshot.exists) transaction.set(auditReference, audit);
        return next;
      });
      return atApiBoundary({ id, ...result });
    },
  };
}

function userCollectionStore(firestore, name, clock, { defaults = {} } = {}) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection(name);
  return {
    async list(uid) {
      const snapshot = await reference(uid).orderBy("updatedAt", "desc").get();
      return snapshot.docs.map(documentValue);
    },
    async create(uid, input) {
      const id = randomUUID();
      const now = currentDate(clock);
      const item = withoutUndefined({ ...defaults, ...(input || {}), createdAt: now, updatedAt: now });
      await reference(uid).doc(id).set(item);
      return atApiBoundary({ id, ...item });
    },
    async update(uid, id, input) {
      const document = reference(uid).doc(id);
      const item = await firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(document);
        if (!existing.exists) return null;
        const next = withoutUndefined({
          ...existing.data(),
          ...(input || {}),
          updatedAt: currentDate(clock),
        });
        transaction.set(document, next);
        return next;
      });
      return item ? atApiBoundary({ id, ...item }) : null;
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

function newsPreferencesStore(firestore, clock) {
  const reference = (uid) => firestore.collection("users").doc(uid).collection("newsPreferences").doc("profile");
  return {
    async get(uid) {
      const snapshot = await reference(uid).get();
      return snapshot.exists ? atApiBoundary({ uid, ...snapshot.data() }) : null;
    },
    async set(uid, input) {
      const document = reference(uid);
      const item = await firestore.runTransaction(async (transaction) => {
        const current = await transaction.get(document);
        const next = withoutUndefined({
          ...(current.exists ? current.data() : {}),
          ...(input || {}),
          updatedAt: currentDate(clock),
        });
        transaction.set(document, next);
        return next;
      });
      return atApiBoundary({ uid, ...item });
    },
  };
}

function conversationMessageStore(firestore, clock) {
  const reference = (uid, conversationId) => firestore.collection("users").doc(uid)
    .collection("conversations").doc(conversationId).collection("messages");
  return {
    async list(uid, conversationId) {
      const snapshot = await reference(uid, conversationId).orderBy("createdAt", "asc").get();
      return snapshot.docs.map(documentValue);
    },
    async create(uid, conversationId, input) {
      const id = randomUUID();
      const now = currentDate(clock);
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

function ragChunkStore(firestore, clock) {
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
      const now = currentDate(clock);
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
  publicItem.urgencyRank = urgencyRanks.get(item.urgency) ?? -1;
  publicItem.audienceKeys = audienceKeysFor(item);
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

function revisionIdFor(sourceKey, contentHash) {
  return stableId(`${sourceKey}\u0000${contentHash || "missing-content-hash"}`);
}

function changedFields(current, input) {
  return Object.entries(input).some(([key, value]) =>
    JSON.stringify(atApiBoundary(current[key])) !== JSON.stringify(atApiBoundary(value)));
}

function filterSignature(filters) {
  return JSON.stringify({
    topic: filters.topic || null,
    visaType: filters.visaType || null,
    universityId: filters.universityId || null,
    legalState: filters.legalState || null,
  });
}

function audienceKey(filters) {
  return [
    filters.topic ? `topic=${filters.topic}` : null,
    filters.visaType ? `visa=${filters.visaType}` : null,
    filters.universityId ? `university=${filters.universityId}` : null,
  ].filter(Boolean).join("|");
}

function audienceKeysFor(item) {
  const topics = Array.isArray(item.topics) ? [...new Set(item.topics)] : [];
  const visaTypes = Array.isArray(item.visaTypes) ? [...new Set(item.visaTypes)] : [];
  const universityIds = Array.isArray(item.universityIds) ? [...new Set(item.universityIds)] : [];
  const keys = new Set();
  for (const topic of topics) keys.add(audienceKey({ topic }));
  for (const visaType of visaTypes) keys.add(audienceKey({ visaType }));
  for (const universityId of universityIds) keys.add(audienceKey({ universityId }));
  for (const topic of topics) for (const visaType of visaTypes) {
    keys.add(audienceKey({ topic, visaType }));
  }
  for (const topic of topics) for (const universityId of universityIds) {
    keys.add(audienceKey({ topic, universityId }));
  }
  for (const visaType of visaTypes) for (const universityId of universityIds) {
    keys.add(audienceKey({ visaType, universityId }));
  }
  for (const topic of topics) for (const visaType of visaTypes) for (const universityId of universityIds) {
    keys.add(audienceKey({ topic, visaType, universityId }));
  }
  return [...keys].sort();
}

function cursorPayload(item, filters) {
  return {
    version: 1,
    filters: filterSignature(filters),
    order: newsOrder,
    position: {
      urgency: item.urgency,
      urgencyRank: item.urgencyRank,
      publishedAt: item.publishedAt ?? null,
      id: item.id,
    },
  };
}

function encodeCursor(item, filters) {
  const payload = cursorPayload(item, filters);
  return Buffer.from(JSON.stringify({ ...payload, checksum: stableId(JSON.stringify(payload)) })).toString("base64url");
}

function validDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function decodeCursor(value, filters) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 4_096) throw new Error("News cursor is invalid.");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const position = cursor?.position;
    const payload = cursor && {
      version: cursor.version,
      filters: cursor.filters,
      order: cursor.order,
      position,
    };
    if (!cursor || cursor.version !== 1 || cursor.filters !== filterSignature(filters)
      || cursor.order !== newsOrder || cursor.checksum !== stableId(JSON.stringify(payload))
      || !position || !urgencyRanks.has(position.urgency)
      || position.urgencyRank !== urgencyRanks.get(position.urgency)
      || !validDate(position.publishedAt)
      || typeof position.id !== "string" || !/^[0-9a-f]{64}$/u.test(position.id)) throw new Error();
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

function newsItemStore(firestore, clock) {
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
        await assertFence(transaction, firestore, fence, clock);
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
          recordUpdatedAt: currentDate(clock),
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
      const result = await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(references.privateReference);
        if (!snapshot.exists) return null;
        const current = snapshot.data();
        const cleanInput = withoutUndefined(input || {});
        if (!changedFields(current, cleanInput)) return { item: current, changed: false };
        await assertFence(transaction, firestore, fence, clock);
        const now = currentDate(clock);
        const priorRevisionId = current.currentRevisionId || randomUUID();
        const currentRevisionId = randomUUID();
        const revision = { ...current, id: priorRevisionId, newsItemId: id, revisedAt: now };
        const merged = { ...current, ...cleanInput };
        const item = withoutApproval({
          ...merged,
          id,
          sourceKey: current.sourceKey,
          currentRevisionId,
          editorialState: merged.sourceVerified && merged.relevance === "relevant"
            ? "published-source-only"
            : "review-required",
          recordUpdatedAt: now,
        });
        transaction.set(references.revisions.doc(priorRevisionId), withoutUndefined(revision));
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
        await assertFence(transaction, firestore, fence, clock);
        const current = snapshot.exists ? snapshot.data() : null;
        const cleanInput = withoutUndefined(input || {});
        const now = currentDate(clock);
        if (!current) {
          const currentRevisionId = revisionIdFor(sourceKey, cleanInput.contentHash);
          const item = withoutApproval({
            id,
            ...cleanInput,
            editorialState: ingestionEditorialState(null, cleanInput),
            sourceKey,
            currentRevisionId,
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
          const currentRevisionId = current.currentRevisionId
            || revisionIdFor(sourceKey, current.contentHash);
          const item = {
            ...current,
            currentRevisionId,
            ...(Object.hasOwn(cleanInput, "snapshotPath") ? { snapshotPath: cleanInput.snapshotPath } : {}),
            ...(Object.hasOwn(cleanInput, "snapshotCommitId") ? { snapshotCommitId: cleanInput.snapshotCommitId } : {}),
            lastSeenAt: now,
            recordUpdatedAt: now,
          };
          transaction.set(references.privateReference, withoutUndefined(item));
          transaction.set(references.publicReference, publicNewsDocument(item));
          return { item, created: false, changed: false };
        }
        const priorRevisionId = current.currentRevisionId || revisionIdFor(sourceKey, current.contentHash);
        const currentRevisionId = revisionIdFor(sourceKey, cleanInput.contentHash);
        const revision = { ...current, id: priorRevisionId, newsItemId: id, revisedAt: now };
        const item = withoutApproval({
          ...current,
          ...cleanInput,
          id,
          editorialState: ingestionEditorialState(current, cleanInput),
          sourceKey,
          currentRevisionId,
          firstSeenAt: current.firstSeenAt,
          lastSeenAt: now,
          createdAt: current.createdAt,
          recordUpdatedAt: now,
        });
        transaction.set(references.revisions.doc(priorRevisionId), withoutUndefined(revision));
        transaction.set(references.privateReference, withoutUndefined(item));
        transaction.set(references.publicReference, publicNewsDocument(item));
        return { item, created: false, changed: true };
      });
      return { ...result, item: atApiBoundary(result.item) };
    },
    async decideReview(id, { decision, ...metadata } = {}) {
      if (decision === "approve") return this.approve(id, metadata);
      if (decision === "reject") return this.reject(id, metadata);
      throw new Error("News review decision must be approve or reject.");
    },
    async approve(id, { reviewerUid, reviewedAt, reviewId, validation } = {}) {
      if (typeof reviewerUid !== "string" || !reviewerUid.trim()
        || typeof reviewedAt !== "string" || !reviewedAt
        || typeof reviewId !== "string" || !reviewId) {
        throw new Error("News approval requires reviewer metadata.");
      }
      const references = newsReferences(firestore, id);
      const reviewReference = firestore.collection("reviewQueue").doc(reviewId);
      const auditReference = firestore.collection("newsReviewAudits").doc(reviewAuditId(reviewId, "approve"));
      const item = await firestore.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(references.privateReference);
        const reviewSnapshot = await transaction.get(reviewReference);
        const auditSnapshot = await transaction.get(auditReference);
        if (!currentSnapshot.exists || !reviewSnapshot.exists || reviewSnapshot.data().newsItemId !== id) {
          throw new Error("News approval requires a matching review record.");
        }
        const current = currentSnapshot.data();
        const review = reviewSnapshot.data();
        const audit = reviewAuditRecord({ id: reviewId, ...review }, {
          decision: "approve", reviewerUid: reviewerUid.trim(), reviewedAt, createdAt: currentDate(clock),
        });
        if (review.status === "consumed") {
          if (current.editorialState === "approved" && current.reviewId === reviewId
            && review.consumedBy === reviewerUid.trim() && review.consumedAt === reviewedAt
            && auditSnapshot.exists && auditMatches(auditSnapshot.data(), audit)) return current;
          throw new Error("News approval cannot reuse a consumed review.");
        }
        const inlineValidation = review.status === "pending" && Boolean(validation);
        const reviewForApproval = inlineValidation
          ? withoutUndefined({
            ...review,
            status: "validated",
            draft: validation.draft,
            validationEvidence: validation.evidence,
            validatedBy: reviewerUid.trim(),
            validatedAt: reviewedAt,
          })
          : review;
        if ((inlineValidation && current.editorialState !== "review-required")
          || reviewForApproval.status !== "validated"
          || reviewForApproval.editorialState !== "review-required"
          || typeof reviewForApproval.reason !== "string" || !reviewForApproval.reason.trim()) {
          throw new Error("News approval requires a validated review with a reason.");
        }
        if (reviewForApproval.contentHash !== current.contentHash
          || reviewForApproval.revisionId !== current.currentRevisionId) {
          throw new Error("News approval review does not match the current content revision.");
        }
        const evidence = reviewForApproval.validationEvidence;
        if (!evidence || evidence.contentHash !== current.contentHash
          || evidence.revisionId !== current.currentRevisionId || evidence.sourceVerified !== true
          || (evidence.sourceId ?? null) !== (current.sourceId ?? null)
          || (evidence.snapshotPath ?? null) !== (current.snapshotPath ?? null)
          || typeof evidence.validatedAt !== "string" || !evidence.validatedAt
          || (inlineValidation && evidence.validatedAt !== reviewedAt)
          || evidence.snapshotCommitId !== (current.snapshotCommitId ?? null)) {
          throw new Error("News approval requires validation evidence for the current content revision.");
        }
        const draft = reviewForApproval.draft;
        if (!draft || typeof draft.plainLanguageSummary !== "string" || !Array.isArray(draft.actions)) {
          throw new Error("News approval requires a stored reviewed draft.");
        }
        const next = withoutUndefined({
          ...current,
          id,
          editorialState: "approved",
          plainLanguageSummary: draft.plainLanguageSummary.trim(),
          summaryProvenance: evidence,
          actions: draft.actions,
          reviewerUid: reviewerUid.trim(),
          reviewedAt,
          reviewId,
          approvalEvidence: evidence,
          recordUpdatedAt: currentDate(clock),
        });
        transaction.set(references.privateReference, next);
        transaction.set(references.publicReference, publicNewsDocument(next));
        transaction.set(reviewReference, withoutUndefined({
          ...reviewForApproval,
          status: "consumed",
          consumedBy: reviewerUid.trim(),
          consumedAt: reviewedAt,
          approvalNewsItemId: id,
          updatedAt: currentDate(clock),
        }));
        if (auditSnapshot.exists) {
          if (!auditMatches(auditSnapshot.data(), audit)) {
            throw new Error("Review decision audit already exists with different metadata.");
          }
        } else {
          transaction.set(auditReference, audit);
        }
        return next;
      });
      return atApiBoundary(item);
    },
    async reject(id, { reviewerUid, reviewedAt, reviewId } = {}) {
      if (typeof reviewerUid !== "string" || !reviewerUid.trim()
        || typeof reviewedAt !== "string" || !reviewedAt
        || typeof reviewId !== "string" || !reviewId) {
        throw new Error("News rejection requires reviewer metadata.");
      }
      const references = newsReferences(firestore, id);
      const reviewReference = firestore.collection("reviewQueue").doc(reviewId);
      const auditReference = firestore.collection("newsReviewAudits").doc(reviewAuditId(reviewId, "reject"));
      const item = await firestore.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(references.privateReference);
        const reviewSnapshot = await transaction.get(reviewReference);
        const auditSnapshot = await transaction.get(auditReference);
        if (!currentSnapshot.exists || !reviewSnapshot.exists || reviewSnapshot.data().newsItemId !== id) {
          throw new Error("News rejection requires a matching review record.");
        }
        const current = currentSnapshot.data();
        const review = reviewSnapshot.data();
        if (review.status !== "pending" || review.editorialState !== "review-required"
          || review.contentHash !== current.contentHash || review.revisionId !== current.currentRevisionId) {
          throw new Error("News rejection requires a pending review for the current content revision.");
        }
        const now = currentDate(clock);
        const next = withoutApproval({
          ...current,
          id,
          editorialState: "rejected",
          recordUpdatedAt: now,
        });
        const audit = reviewAuditRecord({ id: reviewId, ...review }, {
          decision: "reject", reviewerUid: reviewerUid.trim(), reviewedAt, createdAt: now,
        });
        if (auditSnapshot.exists && !auditMatches(auditSnapshot.data(), audit)) {
          throw new Error("Review decision audit already exists with different metadata.");
        }
        transaction.set(references.privateReference, next);
        transaction.set(references.publicReference, publicNewsDocument(next));
        transaction.set(reviewReference, withoutUndefined({
          ...review,
          status: "rejected",
          rejectedBy: reviewerUid.trim(),
          rejectedAt: reviewedAt,
          updatedAt: now,
        }));
        if (!auditSnapshot.exists) transaction.set(auditReference, audit);
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
      let query = firestore.collection("newsItems").where("editorialState", "in", publishedStates);
      if (filters.legalState) query = query.where("legalState", "==", filters.legalState);
      const audienceFilters = [filters.topic, filters.visaType, filters.universityId].filter(Boolean);
      if (audienceFilters.length > 1) {
        query = query.where("audienceKeys", "array-contains", audienceKey(filters));
      } else if (filters.topic) {
        query = query.where("topics", "array-contains", filters.topic);
      } else if (filters.visaType) {
        query = query.where("visaTypes", "array-contains", filters.visaType);
      } else if (filters.universityId) {
        query = query.where("universityIds", "array-contains", filters.universityId);
      }
      query = query.orderBy("urgencyRank", "desc").orderBy("publishedAt", "desc").orderBy("id", "asc");
      if (cursor) {
        query = query.startAfter(
          cursor.position.urgencyRank,
          cursor.position.publishedAt,
          cursor.position.id,
        );
      }
      const snapshot = await query.limit(limit + 1).get();
      const results = snapshot.docs.map(documentValue).filter(isPublished);
      const page = results.slice(0, limit);
      const nextCursor = results.length > limit ? encodeCursor(page.at(-1), filters) : null;
      return pageResult(page, nextCursor);
    },
  };
}

function newsSyncStateStore(firestore, clock) {
  return {
    async commit(sourceId, sourceInput, runInput, { fence } = {}) {
      if (typeof sourceId !== "string" || !sourceId) throw new Error("News source ID is required.");
      const sourceReference = firestore.collection("newsSources").doc(sourceId);
      const runId = randomUUID();
      const runReference = firestore.collection("newsRuns").doc(runId);
      const result = await firestore.runTransaction(async (transaction) => {
        const sourceSnapshot = await transaction.get(sourceReference);
        await assertFence(transaction, firestore, fence, clock);
        const now = currentDate(clock);
        const source = timestampedInput(
          sourceInput,
          sourceSnapshot.exists ? sourceSnapshot.data() : null,
          now,
        );
        const run = timestampedInput(runInput, null, now);
        transaction.set(sourceReference, source);
        transaction.set(runReference, run);
        return { source, run };
      });
      return {
        source: atApiBoundary({ id: sourceId, ...result.source }),
        run: atApiBoundary({ id: runId, ...result.run }),
      };
    },
  };
}

function leaseStore(firestore, clock) {
  return {
    async acquire(key, owner, expiresAt) {
      if (typeof key !== "string" || !key || typeof owner !== "string" || !owner) {
        throw new Error("Lease key and owner are required.");
      }
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.valueOf()) || expiry.valueOf() <= currentDate(clock).valueOf()) {
        throw new Error("Lease expiry must be a future date.");
      }
      const reference = leaseReference(firestore, key);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        const now = currentDate(clock);
        if (current && leaseExpiry(current.expiresAt) > now.valueOf()) return false;
        transaction.set(reference, { key, owner, expiresAt: expiry, updatedAt: now });
        return true;
      });
    },
    async renew(key, owner, expiresAt) {
      const expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.valueOf()) || expiry.valueOf() <= currentDate(clock).valueOf()) return false;
      const reference = leaseReference(firestore, key);
      return firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        const current = snapshot.exists ? snapshot.data() : null;
        const now = currentDate(clock);
        if (!current || current.key !== key || current.owner !== owner || leaseExpiry(current.expiresAt) <= now.valueOf()) {
          return false;
        }
        transaction.set(reference, { ...current, expiresAt: expiry, updatedAt: now });
        return true;
      });
    },
    async owns(key, owner) {
      const snapshot = await leaseReference(firestore, key).get();
      const current = snapshot.exists ? snapshot.data() : null;
      return Boolean(current && current.key === key && current.owner === owner
        && leaseExpiry(current.expiresAt) > currentDate(clock).valueOf());
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

export function createFirestoreStore(firestore, { clock = () => new Date() } = {}) {
  if (!firestore || typeof firestore.collection !== "function"
    || typeof firestore.runTransaction !== "function" || typeof firestore.batch !== "function") {
    throw new Error("A Firestore adapter with transactions and batches is required.");
  }
  if (typeof clock !== "function") throw new Error("Firestore store clock must be a function.");
  // Lease decisions use one injected process clock. Production hosts must keep it synchronized;
  // Firestore server timestamps cannot be resolved inside the transaction that must compare expiry.
  const leases = leaseStore(firestore, clock);
  const newsSources = globalCollectionStore(firestore, "newsSources", clock);
  const newsRuns = globalCollectionStore(firestore, "newsRuns", clock);
  return {
    profiles: {
      async get(uid) {
        const document = await firestore.collection("users").doc(uid).get();
        return document.exists ? atApiBoundary({ uid, ...document.data() }) : null;
      },
      async set(uid, input) {
        const reference = firestore.collection("users").doc(uid);
        const data = await firestore.runTransaction(async (transaction) => {
          const current = await transaction.get(reference);
          const next = withoutUndefined({
            ...(current.exists ? current.data() : {}),
            ...(input || {}),
            updatedAt: currentDate(clock),
          });
          transaction.set(reference, next);
          return next;
        });
        return atApiBoundary({ uid, ...data });
      },
    },
    tasks: userCollectionStore(firestore, "tasks", clock),
    documents: userCollectionStore(firestore, "documents", clock),
    resources: userCollectionStore(firestore, "savedResources", clock),
    conversations: userCollectionStore(firestore, "conversations", clock),
    ragChunks: ragChunkStore(firestore, clock),
    news: newsItemStore(firestore, clock),
    newsSources,
    newsRuns,
    newsSyncState: newsSyncStateStore(firestore, clock),
    reviewQueue: reviewQueueStore(firestore, clock),
    reviewAudit: readOnlyGlobalCollectionStore(firestore, "newsReviewAudits", clock),
    leases,
    newsPreferences: newsPreferencesStore(firestore, clock),
    savedNews: userCollectionStore(firestore, "savedNews", clock),
    notifications: userCollectionStore(firestore, "notifications", clock, { defaults: { read: false } }),
    conversationMessages: conversationMessageStore(firestore, clock),
    async purgeUser(uid) {
      await firestore.recursiveDelete(firestore.collection("users").doc(uid));
    },
  };
}
