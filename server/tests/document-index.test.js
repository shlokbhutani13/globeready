import { describe, expect, test } from "vitest";
import { createDocumentIndexer } from "../src/document-index.js";
import { createDemoStore } from "../src/store.js";

const document = {
  id: "doc-1",
  name: "I-20.pdf",
  contentType: "application/pdf",
  storagePath: "users/student-a/documents/doc-1/I-20.pdf",
};

describe("document indexing", () => {
  test("stores chunks only below the document owner's account", async () => {
    const store = createDemoStore();
    const indexer = createDocumentIndexer({
      store,
      extractText: async () => "Travel signatures are valid for one year.",
      embed: async () => [1, 0, 0],
    });

    await indexer.index({ uid: "student-a", document });

    expect(await store.ragChunks.list("student-a", { documentId: "doc-1" })).toEqual([
      expect.objectContaining({
        documentId: "doc-1",
        documentName: "I-20.pdf",
        text: expect.stringContaining("Travel signatures"),
      }),
    ]);
    expect(await store.ragChunks.list("student-b")).toEqual([]);
  });

  test("preserves PDF page numbers and uses document embeddings", async () => {
    const store = createDemoStore();
    const embeddingCalls = [];
    const indexer = createDocumentIndexer({
      store,
      extractText: async () => [
        { page: 1, text: "Student name and university." },
        { page: 2, text: "Travel signature valid until May." },
      ],
      embed: async (text, taskType) => {
        embeddingCalls.push({ text, taskType });
        return [1, 0, 0];
      },
    });

    await indexer.index({ uid: "student-a", document });

    const chunks = await store.ragChunks.list("student-a", { documentId: "doc-1" });
    expect(chunks.map(({ index, page, text }) => ({ index, page, text }))).toEqual([
      { index: 0, page: 1, text: "Student name and university." },
      { index: 1, page: 2, text: "Travel signature valid until May." },
    ]);
    expect(embeddingCalls.map((call) => call.taskType)).toEqual([
      "RETRIEVAL_DOCUMENT",
      "RETRIEVAL_DOCUMENT",
    ]);
  });

  test("does not retain a partial index when embedding fails", async () => {
    const store = createDemoStore();
    const indexer = createDocumentIndexer({
      store,
      extractText: async () => "Travel signatures are valid for one year.",
      embed: async () => {
        throw new Error("embedding quota reached");
      },
    });

    await expect(indexer.index({ uid: "student-a", document })).rejects.toThrow(
      "embedding quota reached",
    );
    expect(await store.ragChunks.list("student-a", { documentId: "doc-1" })).toEqual([]);
  });

  test("rejects documents that would exceed the safe index size", async () => {
    const store = createDemoStore();
    const indexer = createDocumentIndexer({
      store,
      maxChunks: 200,
      extractText: async () => Array.from({ length: 201 }, (_, index) => ({
        page: index + 1,
        text: `Readable page ${index + 1}`,
      })),
      embed: async () => [1, 0, 0],
    });

    await expect(indexer.index({ uid: "student-a", document })).rejects.toThrow(
      /too much readable text/i,
    );
    expect(await store.ragChunks.list("student-a", { documentId: "doc-1" })).toEqual([]);
  });

  test("bounds concurrent embedding requests", async () => {
    let active = 0;
    let peak = 0;
    const indexer = createDocumentIndexer({
      store: createDemoStore(),
      maxConcurrentEmbeddings: 2,
      extractText: async () => Array.from({ length: 6 }, (_, index) => ({
        page: index + 1,
        text: `Readable page ${index + 1}`,
      })),
      embed: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return [1, 0, 0];
      },
    });

    await indexer.index({ uid: "student-a", document });

    expect(peak).toBeLessThanOrEqual(2);
  });

  test("refuses a storage path outside the authenticated user's folder", async () => {
    const indexer = createDocumentIndexer({
      store: createDemoStore(),
      extractText: async () => "irrelevant",
      embed: async () => [1, 0, 0],
    });

    await expect(
      indexer.index({
        uid: "student-a",
        document: { ...document, storagePath: "users/student-b/documents/doc-1/I-20.pdf" },
      }),
    ).rejects.toThrow("private document folder");
  });
});
