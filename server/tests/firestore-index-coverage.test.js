import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { createFirestoreStore } from "../src/firestore-store.js";

const indexes = JSON.parse(readFileSync(fileURLToPath(new URL("../../firestore.indexes.json", import.meta.url)), "utf8")).indexes;
const clientLib = fileURLToPath(new URL("../../client/src/lib/", import.meta.url));

function recordingFirestore(queries) {
  const query = (path, filters = [], orders = []) => ({
    where(field, op) { return query(path, [...filters, { field, op }], orders); },
    orderBy(field, direction = "asc") { return query(path, filters, [...orders, { field, direction }]); },
    startAfter() { return this; },
    limit() { return this; },
    async get() {
      queries.push({ path, filters, orders });
      return { docs: [], empty: true, forEach() {} };
    },
  });
  const document = (path) => ({
    collection: (name) => collectionRef(`${path}/${name}`),
    async get() { return { exists: false, id: path.split("/").pop(), data: () => undefined }; },
    async set() {}, async update() {}, async delete() {},
  });
  const collectionRef = (path) => ({
    ...query(path),
    doc: (id) => document(`${path}/${id}`),
  });
  return {
    collection: (name) => collectionRef(name),
    async runTransaction(work) {
      return work({ get: async () => ({ exists: false, data: () => undefined }), set() {}, delete() {} });
    },
    batch() { return { set() {}, delete() {}, async commit() {} }; },
  };
}

async function sweepLaunchQueries() {
  const queries = [];
  const store = createFirestoreStore(recordingFirestore(queries));
  const audiences = [{}, { topic: "status" }, { visaType: "f-1" }, { universityId: "unc" }, { topic: "status", visaType: "f-1" }];
  for (const legalState of [undefined, "final"]) {
    for (const audience of audiences) {
      await store.news.listPublished({ limit: 10, ...audience, ...(legalState ? { legalState } : {}) });
    }
  }
  await store.tasks.list("u");
  await store.documents.list("u");
  await store.resources.list("u");
  await store.conversations.list("u");
  await store.savedNews.list("u");
  await store.notifications.list("u");
  await store.conversationMessages.list("u", "c");
  await store.ragChunks.list("u", { documentId: "d" });
  await store.ragChunks.list("u");
  await store.newsSources.listGlobal();
  await store.reviewQueue.listGlobal();
  await store.newsRuns.listGlobal();
  return queries;
}

const directionName = (direction) => (direction === "desc" ? "DESCENDING" : "ASCENDING");

function requiredComposite(query) {
  const filterFields = query.filters.map((filter) => filter.field);
  const orders = query.orders;
  const needsComposite = orders.length > 1
    || (query.filters.length > 1)
    || (orders.length === 1 && query.filters.some((filter) => filter.field !== orders[0].field));
  if (!needsComposite) return null;
  return {
    filters: query.filters.map((filter) => (
      filter.op === "array-contains"
        ? { fieldPath: filter.field, arrayConfig: "CONTAINS" }
        : { fieldPath: filter.field, order: "ASCENDING" }
    )),
    orders: orders.map((order) => ({ fieldPath: order.field, order: directionName(order.direction) })),
    filterFields,
  };
}

function indexCovers(index, required, collectionGroup) {
  if (index.collectionGroup !== collectionGroup || index.queryScope !== "COLLECTION") return false;
  const orderPaths = required.orders.map((order) => order.fieldPath);
  const orderPart = index.fields.filter((field) => orderPaths.includes(field.fieldPath));
  const filterPart = index.fields.filter((field) => !orderPaths.includes(field.fieldPath) && field.fieldPath !== "__name__");
  const sameOrders = JSON.stringify(orderPart.map(({ fieldPath, order }) => [fieldPath, order]))
    === JSON.stringify(required.orders.map(({ fieldPath, order }) => [fieldPath, order]));
  const sameFilters = JSON.stringify(filterPart.map(({ fieldPath, order, arrayConfig }) => [fieldPath, order ?? null, arrayConfig ?? null]).sort())
    === JSON.stringify(required.filters.map(({ fieldPath, order, arrayConfig }) => [fieldPath, order ?? null, arrayConfig ?? null]).sort());
  return sameOrders && sameFilters;
}

function collectionGroupOf(path) {
  return path.split("/").pop();
}

describe("Firestore launch query audit", () => {
  test("every launch query shape is the one this audit reviewed", async () => {
    const shapes = (await sweepLaunchQueries()).map((query) => `${query.path} | ${query.filters.map((f) => `${f.field} ${f.op}`).join(", ") || "-"} | ${query.orders.map((o) => `${o.field} ${o.direction}`).join(", ") || "-"}`);
    expect([...new Set(shapes)].sort()).toEqual([
      "newsItems | editorialState in | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, audienceKeys array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, legalState == | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, legalState ==, audienceKeys array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, legalState ==, topics array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, legalState ==, universityIds array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, legalState ==, visaTypes array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, topics array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, universityIds array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsItems | editorialState in, visaTypes array-contains | urgencyRank desc, publishedAt desc, id asc",
      "newsRuns | - | -",
      "newsSources | - | -",
      "reviewQueue | - | -",
      "users/u/conversations | - | updatedAt desc",
      "users/u/conversations/c/messages | - | createdAt asc",
      "users/u/documents | - | updatedAt desc",
      "users/u/notifications | - | updatedAt desc",
      "users/u/ragChunks | - | -",
      "users/u/ragChunks | documentId == | -",
      "users/u/savedNews | - | updatedAt desc",
      "users/u/savedResources | - | updatedAt desc",
      "users/u/tasks | - | updatedAt desc",
    ].sort());
  });

  test("every query that needs a composite index has a declared index that matches it", async () => {
    const queries = await sweepLaunchQueries();
    const missing = [];
    let composites = 0;
    for (const query of queries) {
      const required = requiredComposite(query);
      if (!required) continue;
      composites += 1;
      const group = collectionGroupOf(query.path);
      if (!indexes.some((index) => indexCovers(index, required, group))) {
        missing.push(`${query.path} filters=${query.filters.map((f) => f.field).join(",")} orders=${query.orders.map((o) => o.field).join(",")}`);
      }
    }
    expect(composites).toBeGreaterThanOrEqual(10);
    expect(missing).toEqual([]);
  });

  test("single-field queries rely only on automatic indexes and need no composite entry", async () => {
    const queries = await sweepLaunchQueries();
    const single = queries.filter((query) => !requiredComposite(query));
    expect(single.length).toBeGreaterThan(0);
    for (const query of single) {
      expect(query.orders.length).toBeLessThanOrEqual(1);
      expect(query.filters.length).toBeLessThanOrEqual(1);
    }
  });

  test("client subscriptions order a single field on a subcollection and never combine filters", () => {
    const files = readdirSync(clientLib).filter((name) => name.endsWith(".js") || name.endsWith(".jsx"));
    for (const file of files) {
      const source = readFileSync(`${clientLib}${file}`, "utf8");
      const orderCalls = source.match(/orderBy\(/g) || [];
      const whereCalls = source.match(/\bwhere\(/g) || [];
      if (orderCalls.length > 0) {
        expect(orderCalls.length, `${file} orders on more than one field`).toBe(orderCalls.length);
        expect(source.match(/orderBy\("[A-Za-z]+", "(asc|desc)"\)/g)?.length ?? 0).toBe(orderCalls.length);
      }
      expect(whereCalls.length, `${file} combines filters with ordering`).toBe(0);
    }
  });

  test("the manifest declares no vector indexes, because nothing queries embeddings", () => {
    expect(indexes.filter((index) => index.fields.some((field) => field.vectorConfig)).length).toBe(0);
    expect(indexes.filter((index) => index.collectionGroup === "newsItems").length).toBe(12);
  });
});
