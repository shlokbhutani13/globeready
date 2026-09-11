import { describe, expect, test } from "vitest";

import { chunkText, citationFor, rankChunks } from "../src/rag.js";

describe("RAG retrieval helpers", () => {
  test("creates overlapping chunks without losing the final source text", () => {
    const chunks = chunkText("a".repeat(1000), { chunkSize: 900, overlap: 150 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ index: 0, offset: 0, text: "a".repeat(900) });
    expect(chunks[1]).toMatchObject({ index: 1, offset: 750, text: "a".repeat(250) });
  });

  test("does not create an overlap-only chunk at an exact boundary", () => {
    const chunks = chunkText("a".repeat(900), { chunkSize: 900, overlap: 150 });

    expect(chunks).toHaveLength(1);
  });

  test("ranks the closest document chunk first", () => {
    const ranked = rankChunks([1, 0], [
      { id: "lease", embedding: [0, 1], documentName: "Lease.pdf", text: "Monthly rent" },
      { id: "i20", embedding: [0.9, 0.1], documentName: "I-20.pdf", text: "Travel signature", page: 2 },
    ]);

    expect(ranked.map((chunk) => chunk.id)).toEqual(["i20", "lease"]);
    expect(citationFor(ranked[0])).toEqual({
      documentName: "I-20.pdf",
      page: 2,
      excerpt: "Travel signature",
    });
  });

  test("does not rank malformed or zero-vector chunks", () => {
    expect(rankChunks([1, 0], [
      { id: "zero", embedding: [0, 0], text: "ignored" },
      { id: "wrong-length", embedding: [1], text: "ignored" },
    ])).toEqual([]);
  });
});
