import { describe, expect, test } from "vitest";
import { createDocumentAssistant } from "../src/document-assistant.js";
import { createDemoStore } from "../src/store.js";

const fallback = {
  async answer({ question }) {
    return { answer: `Fallback for ${question}`, sources: [{ title: "Official source" }] };
  },
};

describe("document-grounded answers", () => {
  test("does not present a document-grounded answer when nothing is retrieved", async () => {
    const assistant = createDocumentAssistant({
      fallback,
      store: createDemoStore(),
      embed: async () => [1, 0],
      generateAnswer: async () => ({ answer: "This should not be used" }),
    });

    const result = await assistant.answer({ uid: "student-a", question: "When can I travel?" });

    expect(result.answer).toContain("Fallback");
    expect(result.documentCitations).toEqual([]);
  });

  test("returns citations from only the authenticated user's retrieved chunks", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{
      index: 0,
      text: "A travel signature is valid for one year.",
      documentName: "I-20.pdf",
      page: 2,
      embedding: [1, 0],
    }]);
    await store.ragChunks.replace("student-b", "other", [{
      index: 0,
      text: "Private content for another student.",
      documentName: "Other.pdf",
      page: 1,
      embedding: [1, 0],
    }]);
    const generateAnswer = async ({ chunks }) => ({
      answer: `Grounded in ${chunks[0].documentName}`,
      actions: ["Check the original document."],
      confidence: "medium",
    });
    const assistant = createDocumentAssistant({
      fallback,
      store,
      embed: async () => [1, 0],
      generateAnswer,
    });

    const result = await assistant.answer({ uid: "student-a", question: "When can I travel?" });

    expect(result.answer).toContain("I-20.pdf");
    expect(result.documentCitations).toEqual([{
      documentName: "I-20.pdf",
      page: 2,
      excerpt: "A travel signature is valid for one year.",
    }]);
  });

  test("falls back when the best document chunk is not relevant", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "lease", [{
      index: 0,
      text: "The apartment allows one parking space.",
      documentName: "Lease.pdf",
      embedding: [0, 1],
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      embed: async () => [1, 0],
      generateAnswer: async () => ({ answer: "Invented document answer" }),
    });

    const result = await assistant.answer({
      uid: "student-a",
      question: "When does my travel signature expire?",
    });

    expect(result.answer).toContain("Fallback");
    expect(result.documentCitations).toEqual([]);
  });

  test("limits retrieval to the requested document", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{
      index: 0,
      text: "The travel signature is on page two.",
      documentName: "I-20.pdf",
      embedding: [1, 0],
    }]);
    await store.ragChunks.replace("student-a", "lease", [{
      index: 0,
      text: "The lease also mentions travel.",
      documentName: "Lease.pdf",
      embedding: [1, 0],
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      embed: async () => [1, 0],
      generateAnswer: async ({ chunks }) => ({ answer: chunks[0].documentName }),
    });

    const result = await assistant.answer({
      uid: "student-a",
      question: "Where is the travel signature?",
      documentId: "i20",
    });

    expect(result.answer).toBe("I-20.pdf");
    expect(result.documentCitations).toHaveLength(1);
  });
});
