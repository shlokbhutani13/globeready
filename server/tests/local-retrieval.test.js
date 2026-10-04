import { describe, expect, test } from "vitest";

import { createDocumentAssistant } from "../src/document-assistant.js";
import { createDemoStore } from "../src/store.js";

const fallback = { async answer() { return { answer: "canned", sources: [] }; } };

describe("retrieval without an answer provider", () => {
  test("shows the real retrieved passages and an accurate not-configured notice, with no invented answer", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{
      index: 0, page: 2, text: "A travel signature is valid for one year.", documentName: "I-20-synthetic.pdf",
    }]);
    const notConfigured = Object.assign(new Error("Answer generation is not configured."), { code: "answer_generation_not_configured" });
    const assistant = createDocumentAssistant({ fallback, store, generateAnswer: async () => { throw notConfigured; } });

    const result = await assistant.answer({ uid: "student-a", question: "How long is my travel signature?" });

    expect(result.evidence).toBe("retrieved");
    expect(result.notice).toMatch(/AI answer generation is not configured/);
    expect(result.answer).not.toBe("canned");
    expect(result.documentCitations).toEqual([{ documentName: "I-20-synthetic.pdf", page: 2, excerpt: "A travel signature is valid for one year." }]);
  });

  test("an unrelated question still reports insufficient evidence, not a passage", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{ index: 0, page: 2, text: "A travel signature is valid for one year.", documentName: "I-20-synthetic.pdf" }]);
    const assistant = createDocumentAssistant({ fallback, store, generateAnswer: async () => ({}) });
    const result = await assistant.answer({ uid: "student-a", question: "When does my lease end?" });
    expect(result.evidence).toBe("insufficient");
    expect(result.documentCitations).toEqual([]);
  });
});
