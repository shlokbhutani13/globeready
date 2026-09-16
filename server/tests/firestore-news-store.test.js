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
    documents.sort((left, right) => {
      for (const { field, direction } of ordering) {
        const leftValue = field === "__name__" ? left.id : left.data()?.[field];
        const rightValue = field === "__name__" ? right.id : right.data()?.[field];
        const comparison = String(leftValue ?? "").localeCompare(String(rightValue ?? ""));
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
      return left.id.localeCompare(right.id);
    });

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

    const review = await store.reviewQueue.create({ newsItemId: item.id, draft: { text: "private" } });
    const approved = await store.news.approve(item.id, {
      reviewerUid: "editor-1",
      reviewedAt: "2026-09-16T12:00:00.000Z",
      summary: " Reviewed summary ",
      reviewId: review.id,
      approvalEvidence: { sourceHash: "hash-one" },
      summaryProvenance: { sourceHash: "hash-one", reviewerUid: "editor-1" },
      actions: [{ label: "Read official notice", url: "https://www.federalregister.gov/d/2026-14439" }],
    });

    expect(approved).toMatchObject({ editorialState: "approved", reviewerUid: "editor-1" });
    const [publicItem] = await store.news.listPublished({});
    expect(publicItem).toMatchObject({
      editorialState: "approved",
      plainLanguageSummary: "Reviewed summary",
      actions: [{ label: "Read official notice" }],
    });
    expect(publicItem).not.toHaveProperty("reviewerUid");
    expect(publicItem).not.toHaveProperty("reviewId");
    expect(publicItem).not.toHaveProperty("approvalEvidence");
    expect(publicItem).not.toHaveProperty("summaryProvenance");
    expect(firestore.documents.get(`newsItems/${item.id}`)).not.toHaveProperty("reviewerUid");
  });

  test("demotes post-approval generated content to a private review draft", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:approved-update", published());
    const review = await store.reviewQueue.create({ newsItemId: item.id });
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

  test("batches an unfenced internal revision with its current projections", async () => {
    const firestore = new FakeFirestore();
    const store = createFirestoreStore(firestore);
    const { item } = await store.news.upsert("agency:relation", published({ relevance: "relevant" }));

    await store.news.reviseInternal(item.id, { legalState: "superseded", relatedIds: ["successor"] });

    expect(firestore.batchCommits).toBe(1);
    expect(await store.news.revisions(item.id)).toHaveLength(1);
    expect(await store.news.get(item.id)).toMatchObject({
      legalState: "superseded",
      relatedIds: ["successor"],
    });
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
});
