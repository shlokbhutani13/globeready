import { createHash } from "node:crypto";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createFirestoreStore } from "../src/firestore-store.js";

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assertNoUndefined(value, path = "root") {
  if (value === undefined) throw new Error(`Firestore write contains undefined at ${path}.`);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefined(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [key, entry] of Object.entries(value)) assertNoUndefined(entry, `${path}.${key}`);
  }
}

class FakeDocumentSnapshot {
  constructor(reference, data) {
    this.ref = reference;
    this.id = reference.id;
    this.exists = data !== undefined;
    this._data = clone(data);
  }

  data() {
    return clone(this._data);
  }
}

class FakeDocumentReference {
  constructor(firestore, path) {
    this.firestore = firestore;
    this.path = path;
    this.id = path.split("/").at(-1);
  }

  collection(name) {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  async get() {
    return this.firestore._snapshot(this);
  }

  async set(data, options) {
    this.firestore._write("set", this, data, options);
  }

  async update(data) {
    this.firestore._write("update", this, data, { merge: true });
  }

  async delete() {
    this.firestore._write("delete", this);
  }
}

class FakeQuery {
  constructor(firestore, path, clauses = []) {
    this.firestore = firestore;
    this.path = path;
    this.clauses = clauses;
  }

  where(field, operator, value) {
    return new FakeQuery(this.firestore, this.path, [...this.clauses, { kind: "where", field, operator, value }]);
  }

  orderBy(field, direction = "asc") {
    return new FakeQuery(this.firestore, this.path, [...this.clauses, { kind: "orderBy", field, direction }]);
  }

  limit(count) {
    return new FakeQuery(this.firestore, this.path, [...this.clauses, { kind: "limit", count }]);
  }

  startAfter(...values) {
    return new FakeQuery(this.firestore, this.path, [...this.clauses, { kind: "startAfter", values }]);
  }

  async get() {
    this.firestore.queries.push({ path: this.path, clauses: clone(this.clauses) });
    return { docs: this.firestore._query(this.path, this.clauses) };
  }
}

class FakeCollectionReference extends FakeQuery {
  doc(id) {
    const resolved = id || `auto-${++this.firestore.autoId}`;
    return new FakeDocumentReference(this.firestore, `${this.path}/${resolved}`);
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.writes = [];
    this.autoId = 0;
    this.transactionRuns = 0;
    this.batchCommits = 0;
    this.queries = [];
    this._transactionTail = Promise.resolve();
  }

  collection(name) {
    return new FakeCollectionReference(this, name);
  }

  batch() {
    const operations = [];
    return {
      set: (reference, data, options) => operations.push(["set", reference, data, options]),
      update: (reference, data) => operations.push(["update", reference, data, { merge: true }]),
      delete: (reference) => operations.push(["delete", reference]),
      commit: async () => {
        for (const operation of operations) this._write(...operation, "batch");
        this.batchCommits += 1;
      },
    };
  }

  async runTransaction(callback) {
    const execute = async () => {
      this.transactionRuns += 1;
      const operations = [];
      const transaction = {
        get: async (reference) => this._snapshot(reference),
        set: (reference, data, options) => operations.push(["set", reference, data, options]),
        update: (reference, data) => operations.push(["update", reference, data, { merge: true }]),
        delete: (reference) => operations.push(["delete", reference]),
      };
      const result = await callback(transaction);
      for (const operation of operations) this._write(...operation, "transaction");
      return result;
    };
    const result = this._transactionTail.then(execute, execute);
    this._transactionTail = result.catch(() => {});
    return result;
  }

  _snapshot(reference) {
    return new FakeDocumentSnapshot(reference, this.documents.get(reference.path));
  }

  _write(operation, reference, data, options, via = "direct") {
    if (operation === "delete") {
      this.documents.delete(reference.path);
      this.writes.push({ operation, path: reference.path, via });
      return;
    }
    assertNoUndefined(data);
    const current = this.documents.get(reference.path) || {};
    const stored = options?.merge ? { ...current, ...clone(data) } : clone(data);
    this.documents.set(reference.path, stored);
    this.writes.push({ operation, path: reference.path, data: clone(data), options, via });
  }

  _query(path, clauses) {
    const depth = path.split("/").length + 1;
    let documents = [...this.documents.entries()]
      .filter(([documentPath]) => documentPath.startsWith(`${path}/`) && documentPath.split("/").length === depth)
      .map(([documentPath, data]) => new FakeDocumentSnapshot(new FakeDocumentReference(this, documentPath), data));

    for (const clause of clauses.filter(({ kind }) => kind === "where")) {
      documents = documents.filter((document) => {
        const value = document.data()?.[clause.field];
        if (clause.operator === "==") return value === clause.value;
        if (clause.operator === "in") return clause.value.includes(value);
        if (clause.operator === "array-contains") return Array.isArray(value) && value.includes(clause.value);
        throw new Error(`Unsupported fake query operator: ${clause.operator}`);
      });
    }

    const ordering = clauses.filter(({ kind }) => kind === "orderBy");
    const compare = (left, rightValues) => {
      for (const { field, direction } of ordering) {
        const leftValue = field === "__name__" ? left.id : left.data()?.[field];
        const rightValue = Array.isArray(rightValues)
          ? rightValues[ordering.findIndex((entry) => entry.field === field)]
          : field === "__name__" ? rightValues.id : rightValues.data()?.[field];
        const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
      return Array.isArray(rightValues) ? 0 : left.id.localeCompare(rightValues.id);
    };
    documents.sort(compare);

    const startAfter = clauses.find(({ kind }) => kind === "startAfter");
    if (startAfter) documents = documents.filter((document) => compare(document, startAfter.values) > 0);

    const limit = clauses.find(({ kind }) => kind === "limit");
    return limit ? documents.slice(0, limit.count) : documents;
  }
}

function published(overrides = {}) {
  return {
    title: "Official notice",
    canonicalUrl: "https://www.federalregister.gov/d/2026-14439",
    publisher: "Federal Register",
    contentHash: "hash-one",
    editorialState: "published-source-only",
    urgency: "medium",
    publishedAt: "2026-09-15",
    legalState: "final",
    topics: ["status"],
    visaTypes: ["F-1"],
    universityIds: ["unc"],
    normalizedText: "private source text",
    classifierExplanation: "private classifier audit",
    snapshotPath: "news-source-snapshots/source/hash-one.txt",
    actions: [{ label: "Generated action", url: "https://example.gov/draft" }],
    ...overrides,
  };
}

function validatedReview(item, overrides = {}) {
  return {
    newsItemId: item.id,
    contentHash: item.contentHash,
    revisionId: item.currentRevisionId,
    editorialState: "review-required",
    status: "validated",
    reason: "generated-summary",
    draft: {
      plainLanguageSummary: "Stored reviewed summary",
      actions: [{ label: "Stored action", sourceUrl: item.canonicalUrl }],
    },
    validationEvidence: {
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      sourceId: item.sourceId ?? null,
      snapshotPath: item.snapshotPath ?? null,
      snapshotCommitId: item.snapshotCommitId ?? null,
      sourceVerified: true,
      validatedAt: "2026-09-16T11:59:00.000Z",
    },
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("Firestore news store", () => {
  test("keeps a stable news ID, stores private revisions, and strips undefined writes", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const first = await store.news.upsert("federal-register:2026-14439", published({ optional: undefined }));
    const sameStoreRestarted = createFirestoreStore(firestore);
    const found = await sameStoreRestarted.news.getBySourceKey("federal-register:2026-14439");
    const changed = await sameStoreRestarted.news.upsert("federal-register:2026-14439", published({
      title: "Corrected official notice",
      contentHash: "hash-two",
      optional: undefined,
    }));

    expect(found.id).toBe(first.item.id);
    expect(changed).toMatchObject({ created: false, changed: true });
    expect(changed.item.id).toBe(first.item.id);
    expect(await store.news.revisions(first.item.id)).toEqual([
      expect.objectContaining({
        newsItemId: first.item.id,
        title: "Official notice",
        contentHash: "hash-one",
      }),
    ]);

    const publicDocument = firestore.documents.get(`newsItems/${first.item.id}`);
    expect(publicDocument).toMatchObject({
      title: "Corrected official notice",
      editorialState: "published-source-only",
      plainLanguageSummary: "",
      actions: [],
    });
    expect(publicDocument).not.toHaveProperty("normalizedText");
    expect(publicDocument).not.toHaveProperty("contentHash");
    expect(publicDocument).not.toHaveProperty("classifierExplanation");
    expect(publicDocument).not.toHaveProperty("snapshotPath");
    expect(firestore.writes.every(({ data }) => data === undefined || JSON.stringify(data) !== undefined)).toBe(true);
  });

  test("requires a review record for approval and keeps review metadata private", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:reviewed", published({
      editorialState: "review-required",
      plainLanguageSummary: "unreviewed generated summary",
      summaryProvenance: { model: "draft" },
    }));

    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      summary: "Reviewed summary",
      reviewId: "missing",
    })).rejects.toThrow(/matching review record/i);

    const review = await store.reviewQueue.create(validatedReview(item));
    const approved = await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      summary: "Caller-controlled summary",
      reviewId: review.id,
      actions: [{ label: "Caller-controlled action", url: "https://attacker.example" }],
    });

    expect(approved).toMatchObject({
      editorialState: "approved",
      reviewerUid: "editor-1",
      plainLanguageSummary: "Stored reviewed summary",
      actions: [{ label: "Stored action" }],
    });
    const [publicItem] = await store.news.listPublished({});
    expect(publicItem).toMatchObject({
      editorialState: "approved",
      plainLanguageSummary: "Stored reviewed summary",
      actions: [{ label: "Stored action" }],
    });
    expect(publicItem).not.toHaveProperty("reviewerUid");
    expect(publicItem).not.toHaveProperty("reviewId");
    expect(publicItem).not.toHaveProperty("approvalEvidence");
    expect(publicItem).not.toHaveProperty("summaryProvenance");
    expect(firestore.documents.get(`newsItems/${item.id}`)).not.toHaveProperty("reviewerUid");
    expect(await store.reviewQueue.get(review.id)).toMatchObject({
      status: "consumed",
      consumedBy: "editor-1",
      consumedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({
        decision: "approve", reviewId: review.id, newsItemId: item.id, reviewerUid: "editor-1",
      }),
    ]);
    expect(firestore.writes.at(-1)).toMatchObject({ via: "transaction" });

    const writeCount = firestore.writes.length;
    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      reviewId: review.id,
    })).resolves.toEqual(approved);
    expect(firestore.writes).toHaveLength(writeCount);
  });

  test("atomically rejects current review content and writes an immutable audit document", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:rejected", published({
      editorialState: "review-required", plainLanguageSummary: "Private draft",
    }));
    const review = await store.reviewQueue.create({
      newsItemId: item.id, contentHash: item.contentHash, revisionId: item.currentRevisionId,
      editorialState: "review-required", status: "pending", reason: "high-impact",
    });
    const before = firestore.transactionRuns;

    const rejected = await store.news.decideReview(item.id, {
      decision: "reject",
      reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z", reviewId: review.id,
    });

    expect(firestore.transactionRuns).toBe(before + 1);
    expect(rejected).toMatchObject({ editorialState: "rejected", plainLanguageSummary: "", actions: [] });
    expect(await store.reviewQueue.get(review.id)).toMatchObject({ status: "rejected", rejectedBy: "editor-1" });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "reject", reviewId: review.id, newsItemId: item.id }),
    ]);
    expect(store.reviewAudit).not.toHaveProperty("update");
  });

  test("atomically validates and approves a pending review with its audit", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:pending-approval", published({
      sourceId: "agency", editorialState: "review-required",
      snapshotPath: "news-source-snapshots/agency/hash-one.txt", snapshotCommitId: "commit-1",
    }));
    const review = await store.reviewQueue.create({
      newsItemId: item.id, sourceId: item.sourceId, contentHash: item.contentHash,
      revisionId: item.currentRevisionId, editorialState: "review-required", status: "pending",
      reason: "editorial-review",
    });
    const evidence = {
      contentHash: item.contentHash, revisionId: item.currentRevisionId, sourceId: item.sourceId,
      snapshotPath: item.snapshotPath, snapshotCommitId: item.snapshotCommitId,
      sourceVerified: true, validatedAt: "2026-09-16T12:00:00.000Z",
    };
    const before = firestore.transactionRuns;

    const approved = await store.news.decideReview(item.id, {
      decision: "approve", reviewerUid: "editor-1", reviewedAt: evidence.validatedAt,
      reviewId: review.id,
      validation: { draft: { plainLanguageSummary: "Reviewed summary", actions: [] }, evidence },
    });

    expect(firestore.transactionRuns).toBe(before + 1);
    expect(approved).toMatchObject({ editorialState: "approved", plainLanguageSummary: "Reviewed summary" });
    expect(await store.reviewQueue.get(review.id)).toMatchObject({
      status: "consumed", validatedBy: "editor-1", consumedBy: "editor-1",
    });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "approve", reviewId: review.id }),
    ]);
  });

  test("atomically resolves a source suggestion with its immutable audit", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const suggestion = await store.reviewQueue.create({
      type: "source-suggestion",
      canonicalUrl: "https://international.unc.edu/alerts",
      status: "pending",
      trusted: false,
    });
    const before = firestore.transactionRuns;

    const resolved = await store.reviewQueue.resolve(suggestion.id, {
      decision: "resolve", reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(firestore.transactionRuns).toBe(before + 1);
    expect(resolved).toMatchObject({ status: "resolved", decidedBy: "editor-1" });
    expect(await store.reviewAudit.listGlobal()).toEqual([
      expect.objectContaining({ decision: "resolve", reviewId: suggestion.id, reviewerUid: "editor-1" }),
    ]);
  });

  test("rolls back approval when an immutable audit identity conflicts", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:audit-conflict", published({ editorialState: "review-required" }));
    const review = await store.reviewQueue.create(validatedReview(item));
    const auditId = createHash("sha256").update(`${review.id}\0approve`).digest("hex");
    firestore.documents.set(`newsReviewAudits/${auditId}`, {
      type: "malformed-audit",
      decision: "approve",
      reviewId: review.id,
      newsItemId: item.id,
      contentHash: review.contentHash,
      revisionId: review.revisionId,
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
    });

    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z", reviewId: review.id,
    })).rejects.toThrow(/audit/i);

    expect(await store.news.get(item.id)).toMatchObject({ editorialState: "review-required" });
    expect(await store.reviewQueue.get(review.id)).toMatchObject({ status: "validated" });
  });

  test("rejects approval evidence bound to another snapshot path or source", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:snapshot-mismatch", published({
      sourceId: "agency",
      editorialState: "review-required",
      snapshotPath: "news-source-snapshots/agency/hash-one.txt",
      snapshotCommitId: "commit-1",
    }));
    const review = await store.reviewQueue.create(validatedReview(item, {
      validationEvidence: {
        ...validatedReview(item).validationEvidence,
        sourceId: "other-agency",
        snapshotPath: "news-source-snapshots/other-agency/hash-one.txt",
      },
    }));

    await expect(store.news.decideReview(item.id, {
      decision: "approve",
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      reviewId: review.id,
    })).rejects.toThrow(/validation evidence|snapshot/i);
    expect(await store.news.get(item.id)).toMatchObject({ editorialState: "review-required" });
    expect(await store.reviewAudit.listGlobal()).toEqual([]);
  });

  test("rejects stale, unvalidated, mismatched, and consumed review approvals", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:stale-review", published());
    expect(item.currentRevisionId).toEqual(expect.any(String));

    const pending = await store.reviewQueue.create(validatedReview(item, { status: "pending" }));
    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z", reviewId: pending.id,
    })).rejects.toThrow(/validated review/i);

    const stale = await store.reviewQueue.create(validatedReview(item));
    await store.news.upsert("agency:stale-review", published({ contentHash: "hash-two" }));
    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z", reviewId: stale.id,
    })).rejects.toThrow(/current content|revision/i);

    const current = await store.news.get(item.id);
    const mismatched = await store.reviewQueue.create(validatedReview(current, {
      validationEvidence: { ...validatedReview(current).validationEvidence, contentHash: "wrong" },
    }));
    await expect(store.news.approve(item.id, {
      reviewerUid: "editor-1", reviewedAt: "2026-09-16T12:00:00.000Z", reviewId: mismatched.id,
    })).rejects.toThrow(/validation evidence/i);
  });

  test("demotes post-approval generated content to a private review draft", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:approved-update", published());
    const review = await store.reviewQueue.create(validatedReview(item));
    await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      summary: "Reviewed summary",
      reviewId: review.id,
    });

    const draft = await store.news.updateInternal(item.id, {
      plainLanguageSummary: "New generated draft",
      actions: [{ label: "Generated action", url: "https://example.gov/draft" }],
    });

    expect(draft).toMatchObject({
      editorialState: "review-required",
      plainLanguageSummary: "New generated draft",
      actions: [{ label: "Generated action" }],
    });
    expect(draft).not.toHaveProperty("reviewerUid");
    expect(await store.news.listPublished({})).toEqual([]);
    expect(firestore.documents.get(`newsItems/${item.id}`)).toMatchObject({
      editorialState: "review-required",
      plainLanguageSummary: "",
      actions: [],
    });
  });

  test("transactions an unfenced internal revision with its current projections", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:relation", published({ relevance: "relevant" }));

    const before = firestore.transactionRuns;
    await store.news.reviseInternal(item.id, { legalState: "superseded", relatedIds: ["successor"] });

    expect(firestore.transactionRuns).toBe(before + 1);
    expect(await store.news.revisions(item.id)).toHaveLength(1);
    expect(await store.news.get(item.id)).toMatchObject({
      legalState: "superseded",
      relatedIds: ["successor"],
    });
  });

  test("derives revised publication state from the merged next record", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    const { item } = await store.news.upsert("agency:merged-state", published({
      sourceVerified: true,
      relevance: "borderline",
      editorialState: "review-required",
    }));

    const revised = await store.news.reviseInternal(item.id, { relevance: "relevant" });

    expect(revised.editorialState).toBe("published-source-only");
  });

  test("never lets ingestion turn classifier output into approval", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    const result = await store.news.upsert("agency:unsafe-approval", published({
      editorialState: "approved",
      classifierConfidence: 1,
      plainLanguageSummary: "Generated draft",
    }));

    expect(result.item.editorialState).toBe("review-required");
    expect(await store.news.listPublished({})).toEqual([]);
  });

  test("merges source health without erasing validators", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    await store.newsSources.upsert("federal-register", {
      status: "healthy",
      etag: "etag-one",
      lastModified: "Tue, 15 Sep 2026 10:00:00 GMT",
    });
    await store.newsSources.upsert("federal-register", {
      status: "degraded",
      consecutiveFailures: 2,
      etag: undefined,
    });

    expect(await store.newsSources.get("federal-register")).toMatchObject({
      id: "federal-register",
      status: "degraded",
      consecutiveFailures: 2,
      etag: "etag-one",
      lastModified: "Tue, 15 Sep 2026 10:00:00 GMT",
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u),
    });
  });

  test("isolates saved news, notification unread state, preferences, and conversation messages by uid", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    const saved = await store.savedNews.create("student-a", { newsItemId: "news-1" });
    const notification = await store.notifications.create("student-a", { title: "New rule" });
    await store.newsPreferences.set("student-a", { topics: ["employment"] });
    await store.conversationMessages.create("student-a", "conversation-1", { text: "Question" });

    expect(notification.read).toBe(false);
    expect(await store.savedNews.list("student-b")).toEqual([]);
    expect(await store.notifications.list("student-b")).toEqual([]);
    expect(await store.newsPreferences.get("student-b")).toBeNull();
    expect(await store.conversationMessages.list("student-b", "conversation-1")).toEqual([]);

    await store.notifications.update("student-a", notification.id, { read: true });
    expect((await store.notifications.list("student-a"))[0].read).toBe(true);
    expect(await store.savedNews.remove("student-b", saved.id)).toBe(false);
    expect(await store.savedNews.list("student-a")).toHaveLength(1);
  });

  test("stores the user pre-filter required by the RAG vector index", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);

    const [chunk] = await store.ragChunks.replace("student-a", "document-1", [{
      index: 0,
      text: "Travel signature",
      embedding: [1, 0],
    }]);

    expect(chunk).toMatchObject({ uid: "student-a", documentId: "document-1" });
    expect(firestore.documents.get(`users/student-a/ragChunks/${chunk.id}`)).toMatchObject({
      uid: "student-a",
      documentId: "document-1",
    });
  });

  test("preserves unrelated profile and user fields across concurrent patches", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    await store.profiles.set("student-a", { displayName: "Student" });
    const task = await store.tasks.create("student-a", { title: "Initial", completed: false });

    await Promise.all([
      store.profiles.set("student-a", { universityId: "unc" }),
      store.profiles.set("student-a", { visaType: "F-1" }),
      store.tasks.update("student-a", task.id, { completed: true }),
      store.tasks.update("student-a", task.id, { dueDate: "2026-10-01" }),
    ]);

    expect(await store.profiles.get("student-a")).toMatchObject({
      displayName: "Student",
      universityId: "unc",
      visaType: "F-1",
    });
    expect((await store.tasks.list("student-a"))[0]).toMatchObject({
      title: "Initial",
      completed: true,
      dueDate: "2026-10-01",
    });
  });

  test("commits source health and run history in one fenced transaction", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const before = firestore.transactionRuns;

    const result = await store.newsSyncState.commit("federal-register", { etag: "etag-one" }, {
      status: "success",
      startedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(result).toMatchObject({ source: { id: "federal-register", etag: "etag-one" } });
    expect(result.run).toMatchObject({ id: expect.any(String), status: "success" });
    expect(firestore.transactionRuns).toBe(before + 1);
    const transactionWrites = firestore.writes.slice(-2);
    expect(transactionWrites).toHaveLength(2);
    expect(transactionWrites.every(({ via }) => via === "transaction")).toBe(true);
  });

  test("uses the injected authoritative clock for lease expiry decisions", async () => {
    const store = createFirestoreStore(new FakeFirestore(), {
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
    });

    await expect(store.leases.acquire(
      "news-source:federal-register",
      "worker-a",
      "2029-12-31T23:59:59.000Z",
    )).rejects.toThrow(/future date/i);
  });

  test("serializes lease contention and rejects stale owners", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);

    expect(await Promise.all([
      store.leases.acquire("news-source:federal-register", "worker-a", "2026-09-16T12:01:00.000Z"),
      store.leases.acquire("news-source:federal-register", "worker-b", "2026-09-16T12:01:00.000Z"),
    ])).toEqual([true, false]);
    expect(await store.leases.renew("news-source:federal-register", "worker-b", "2026-09-16T12:02:00.000Z"))
      .toBe(false);

    vi.setSystemTime(new Date("2026-09-16T12:01:01.000Z"));
    expect(await store.leases.acquire("news-source:federal-register", "worker-b", "2026-09-16T12:03:00.000Z"))
      .toBe(true);
    expect(await store.leases.release("news-source:federal-register", "worker-a")).toBe(false);
    expect(await store.leases.owns("news-source:federal-register", "worker-b")).toBe(true);
    expect(firestore.transactionRuns).toBeGreaterThanOrEqual(5);
  });

  test("returns array-compatible filtered pages in stable urgency, date, and ID order", async () => {
    const store = createFirestoreStore(new FakeFirestore());
    await store.news.upsert("agency:medium", published({
      title: "Medium",
      contentHash: "medium",
      urgency: "medium",
      publishedAt: "2026-09-16",
    }));
    await store.news.upsert("agency:urgent-new", published({
      title: "Urgent new",
      contentHash: "urgent-new",
      urgency: "urgent",
      publishedAt: "2026-09-16",
    }));
    await store.news.upsert("agency:urgent-old", published({
      title: "Urgent old",
      contentHash: "urgent-old",
      urgency: "urgent",
      publishedAt: "2026-09-15",
    }));
    await store.news.upsert("agency:other-topic", published({
      title: "Other topic",
      contentHash: "other-topic",
      urgency: "critical",
      topics: ["tax"],
    }));

    const firstPage = await store.news.listPublished({
      topic: "status",
      visaType: "F-1",
      universityId: "unc",
      legalState: "final",
      limit: 2,
    });
    const secondPage = await store.news.listPublished({
      topic: "status",
      visaType: "F-1",
      universityId: "unc",
      legalState: "final",
      limit: 2,
      cursor: firstPage.cursor,
    });

    expect(Array.isArray(firstPage)).toBe(true);
    expect(firstPage.items).toBe(firstPage);
    expect(firstPage.map(({ title }) => title)).toEqual(["Urgent new", "Urgent old"]);
    expect(firstPage.cursor).toEqual(expect.any(String));
    expect(secondPage.map(({ title }) => title)).toEqual(["Medium"]);
    expect(secondPage.cursor).toBeNull();
  });

  test("uses bounded query shapes and rejects semantically tampered cursors", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    for (const [key, urgency] of [["one", "urgent"], ["two", "medium"], ["three", "low"]]) {
      await store.news.upsert(`agency:${key}`, published({ contentHash: key, urgency }));
    }

    const page = await store.news.listPublished({
      topic: "status", visaType: "F-1", universityId: "unc", legalState: "final", limit: 2,
    });
    const query = firestore.queries.at(-1);
    expect(query.clauses).toEqual(expect.arrayContaining([
      { kind: "where", field: "editorialState", operator: "in", value: ["published-source-only", "approved"] },
      { kind: "where", field: "legalState", operator: "==", value: "final" },
      expect.objectContaining({ kind: "where", field: "audienceKeys", operator: "array-contains" }),
      { kind: "orderBy", field: "urgencyRank", direction: "desc" },
      { kind: "orderBy", field: "publishedAt", direction: "desc" },
      { kind: "orderBy", field: "id", direction: "asc" },
      { kind: "limit", count: 3 },
    ]));

    const decoded = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8"));
    decoded.position.urgency = "impossible";
    const tampered = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    await expect(store.news.listPublished({
      topic: "status", visaType: "F-1", universityId: "unc", legalState: "final", limit: 2, cursor: tampered,
    })).rejects.toThrow(/cursor is invalid/i);
  });
});
