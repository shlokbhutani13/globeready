import { createHash, randomUUID } from "node:crypto";
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
    async purgeUser(uid) {
      byUser.delete(uid);
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

function auditId(reviewId, decision) {
  return createHash("sha256").update(`${reviewId}\0${decision}`).digest("hex");
}

function readOnlyGlobalCollection(items) {
  return {
    async listGlobal() {
      return [...items.values()].sort((left, right) =>
        String(right.reviewedAt || right.createdAt).localeCompare(String(left.reviewedAt || left.createdAt)));
    },
    async get(id) {
      return items.get(id) || null;
    },
  };
}

function decisionAudit({ review, decision, reviewerUid, reviewedAt }) {
  return {
    id: auditId(review.id, decision),
    type: "review-decision-audit",
    decision,
    reviewerUid,
    reviewedAt,
    reviewId: review.id,
    newsItemId: review.newsItemId || null,
    contentHash: review.contentHash || null,
    revisionId: review.revisionId || null,
    createdAt: reviewedAt,
  };
}

function assertNewAudit(auditItems, audit) {
  const existing = auditItems.get(audit.id);
  if (existing && JSON.stringify(existing) !== JSON.stringify(audit)) {
    throw new Error("Review decision audit already exists with different metadata.");
  }
  return existing;
}

function createNewsStore({ reviewItems, auditItems, leases }) {
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
    async decideReview(id, { decision, ...metadata } = {}) {
      if (decision === "approve") return this.approve(id, metadata);
      if (decision === "reject") return this.reject(id, metadata);
      throw new Error("News review decision must be approve or reject.");
    },
    async approve(id, { reviewerUid, reviewedAt, reviewId, validation } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      const review = reviewItems.get(reviewId);
      if (!current || !review || review.newsItemId !== id) {
        throw new Error("News approval requires a matching review record.");
      }
      if (typeof reviewerUid !== "string" || !reviewerUid.trim() || typeof reviewedAt !== "string" || !reviewedAt) {
        throw new Error("News approval requires reviewer metadata.");
      }
      if (review.status === "consumed") {
        if (current.editorialState === "approved" && current.reviewId === reviewId
          && review.consumedBy === reviewerUid.trim() && review.consumedAt === reviewedAt) {
          const audit = decisionAudit({ review, decision: "approve", reviewerUid: reviewerUid.trim(), reviewedAt });
          assertNewAudit(auditItems, audit);
          auditItems.set(audit.id, audit);
          return current;
        }
        throw new Error("News approval cannot reuse a consumed review.");
      }
      const inlineValidation = review.status === "pending" && Boolean(validation);
      const reviewForApproval = inlineValidation
        ? {
          ...review,
          status: "validated",
          draft: validation.draft,
          validationEvidence: validation.evidence,
          validatedBy: reviewerUid.trim(),
          validatedAt: reviewedAt,
        }
        : review;
      if ((inlineValidation && current.editorialState !== "review-required")
        || reviewForApproval.status !== "validated"
        || reviewForApproval.editorialState !== "review-required"
        || typeof reviewForApproval.reason !== "string" || !reviewForApproval.reason.trim()
        || reviewForApproval.contentHash !== current.contentHash
        || reviewForApproval.revisionId !== current.currentRevisionId) {
        throw new Error("News approval requires a validated review for the current content revision.");
      }
      const evidence = reviewForApproval.validationEvidence;
      if (!evidence || evidence.contentHash !== current.contentHash
        || evidence.revisionId !== current.currentRevisionId || evidence.sourceVerified !== true
        || (evidence.sourceId ?? null) !== (current.sourceId ?? null)
        || (evidence.snapshotPath ?? null) !== (current.snapshotPath ?? null)
        || evidence.snapshotCommitId !== (current.snapshotCommitId ?? null)
        || (inlineValidation && (typeof evidence.validatedAt !== "string"
          || evidence.validatedAt !== reviewedAt))) {
        throw new Error("News approval requires validation evidence for the current content revision.");
      }
      if (!reviewForApproval.draft || typeof reviewForApproval.draft.plainLanguageSummary !== "string"
        || !Array.isArray(reviewForApproval.draft.actions)) {
        throw new Error("News approval requires a stored reviewed draft.");
      }

      const item = {
        ...current,
        editorialState: "approved",
        plainLanguageSummary: reviewForApproval.draft.plainLanguageSummary.trim(),
        actions: reviewForApproval.draft.actions,
        summaryProvenance: evidence,
        reviewerUid: reviewerUid.trim(),
        reviewedAt,
        reviewId,
        approvalEvidence: evidence,
        recordUpdatedAt: new Date().toISOString(),
      };
      const nextReview = {
        ...reviewForApproval,
        status: "consumed",
        consumedBy: reviewerUid.trim(),
        consumedAt: reviewedAt,
        approvalNewsItemId: id,
        updatedAt: reviewedAt,
      };
      const audit = decisionAudit({ review, decision: "approve", reviewerUid: reviewerUid.trim(), reviewedAt });
      assertNewAudit(auditItems, audit);
      itemsBySourceKey.set(item.sourceKey, item);
      reviewItems.set(reviewId, nextReview);
      auditItems.set(audit.id, audit);
      return item;
    },
    async reject(id, { reviewerUid, reviewedAt, reviewId } = {}) {
      const current = [...itemsBySourceKey.values()].find((item) => item.id === id);
      const review = reviewItems.get(reviewId);
      if (!current || !review || review.newsItemId !== id) {
        throw new Error("News rejection requires a matching review record.");
      }
      if (typeof reviewerUid !== "string" || !reviewerUid.trim() || typeof reviewedAt !== "string" || !reviewedAt) {
        throw new Error("News rejection requires reviewer metadata.");
      }
      if (review.status !== "pending" || review.editorialState !== "review-required"
        || review.contentHash !== current.contentHash || review.revisionId !== current.currentRevisionId) {
        throw new Error("News rejection requires a pending review for the current content revision.");
      }
      const item = {
        ...current,
        editorialState: "rejected",
        plainLanguageSummary: "",
        summaryProvenance: null,
        actions: [],
        recordUpdatedAt: reviewedAt,
      };
      delete item.reviewerUid;
      delete item.reviewedAt;
      delete item.reviewId;
      delete item.approvalEvidence;
      const nextReview = {
        ...review,
        status: "rejected",
        rejectedBy: reviewerUid.trim(),
        rejectedAt: reviewedAt,
        updatedAt: reviewedAt,
      };
      const audit = decisionAudit({ review, decision: "reject", reviewerUid: reviewerUid.trim(), reviewedAt });
      assertNewAudit(auditItems, audit);
      itemsBySourceKey.set(item.sourceKey, item);
      reviewItems.set(reviewId, nextReview);
      auditItems.set(audit.id, audit);
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
    async purgeUser(uid) {
      preferencesByUser.delete(uid);
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
    async purgeUser(uid) {
      byUser.delete(uid);
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
    async purgeUser(uid) {
      byUser.delete(uid);
    },
  };
}

export function createDemoStore() {
  const profiles = new Map();
  const leases = createLeaseStore();
  const sourceItems = new Map();
  const runItems = new Map();
  const reviewItems = new Map();
  const auditItems = new Map();
  const reviewQueue = createGlobalCollection({ leases, items: reviewItems });
  reviewQueue.resolve = async (id, { decision, reviewerUid, reviewedAt } = {}) => {
    const review = reviewItems.get(id);
    if (!review || review.type !== "source-suggestion" || review.status !== "pending"
      || !["reject", "resolve"].includes(decision)
      || typeof reviewerUid !== "string" || !reviewerUid.trim()
      || typeof reviewedAt !== "string" || !reviewedAt) {
      throw new Error("Source suggestion decision is invalid.");
    }
    const next = {
      ...review,
      status: decision === "reject" ? "rejected" : "resolved",
      decidedBy: reviewerUid.trim(),
      decidedAt: reviewedAt,
      updatedAt: reviewedAt,
    };
    const audit = decisionAudit({ review, decision, reviewerUid: reviewerUid.trim(), reviewedAt });
    assertNewAudit(auditItems, audit);
    reviewItems.set(id, next);
    auditItems.set(audit.id, audit);
    return next;
  };
  const newsSources = createGlobalCollection({ leases, items: sourceItems });
  const newsRuns = createGlobalCollection({ leases, items: runItems });
  const tasks = createCollection();
  const documents = createCollection();
  const resources = createCollection();
  const conversations = createCollection();
  const ragChunks = createRagChunkCollection();
  const newsPreferences = createNewsPreferencesStore();
  const savedNews = createCollection();
  const notifications = createCollection();
  const conversationMessages = createConversationMessageCollection();
  const userScoped = [tasks, documents, resources, conversations, ragChunks, newsPreferences, savedNews, notifications, conversationMessages];
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
    tasks,
    documents,
    resources,
    conversations,
    ragChunks,
    async purgeUser(uid) {
      profiles.delete(uid);
      await Promise.all(userScoped.map((collection) => collection.purgeUser(uid)));
    },
    news: createNewsStore({ reviewItems, auditItems, leases }),
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
    reviewAudit: readOnlyGlobalCollection(auditItems),
    leases,
    newsPreferences,
    savedNews,
    notifications,
    conversationMessages,
  };
}
