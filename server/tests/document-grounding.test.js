import { describe, expect, test } from "vitest";

import { createDocumentAssistant } from "../src/document-assistant.js";
import { createDocumentIndexer } from "../src/document-index.js";
import { lexicalScore, rankChunksLexically } from "../src/rag.js";
import { referralFor } from "../src/referrals.js";
import { createDemoStore } from "../src/store.js";

const fallback = {
  async answer({ question }) {
    return { answer: `Fallback for ${question}`, sources: [{ title: "Official source" }] };
  },
};

describe("deterministic lexical retrieval", () => {
  test("scores by the share of meaningful question terms found in a chunk", () => {
    expect(lexicalScore("When does my travel signature expire?", "The travel signature is valid for one year.")).toBeCloseTo(2 / 3);
    expect(lexicalScore("When does my travel signature expire?", "The apartment allows one parking space.")).toBe(0);
  });

  test("ignores a chunk that shares only filler words with the question", () => {
    expect(lexicalScore("Can I do it?", "You can do it when the lease is signed.")).toBe(0);
  });

  test("ranks deterministically and drops chunks below the minimum score", () => {
    const ranked = rankChunksLexically("travel signature", [
      { id: "b", index: 1, text: "A travel letter." },
      { id: "a", index: 0, text: "The travel signature is on page two." },
      { id: "c", index: 2, text: "Parking rules." },
    ]);
    expect(ranked.map((chunk) => chunk.id)).toEqual(["a", "b"]);
  });
});

describe("grounded document answers", () => {
  test("cites only the authenticated user's real chunks, with the page where it exists", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{
      index: 0, text: "A travel signature is valid for one year.", documentName: "I-20.pdf", page: 2,
    }]);
    await store.ragChunks.replace("student-b", "other", [{
      index: 0, text: "Private travel signature for another student.", documentName: "Other.pdf", page: 1,
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      generateAnswer: async ({ chunks }) => ({ answer: `Per ${chunks[0].documentName}`, confidence: "medium" }),
    });

    const result = await assistant.answer({ uid: "student-a", question: "How long is the travel signature?" });

    expect(result.evidence).toBe("grounded");
    expect(result.documentCitations).toEqual([{
      documentName: "I-20.pdf", page: 2, excerpt: "A travel signature is valid for one year.",
    }]);
    expect(JSON.stringify(result)).not.toContain("Other.pdf");
  });

  test("never attaches a page number to an image source that has none", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "passport", [{
      index: 0, text: "Passport expiry date is listed.", documentName: "passport.jpg", page: null,
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      generateAnswer: async () => ({ answer: "Listed on the passport image." }),
    });

    const result = await assistant.answer({ uid: "student-a", question: "What is the passport expiry date?" });

    expect(result.documentCitations[0]).not.toHaveProperty("page");
  });

  test("states insufficient evidence instead of inventing a document answer", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "lease", [{
      index: 0, text: "The apartment allows one parking space.", documentName: "Lease.pdf",
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      generateAnswer: async () => ({ answer: "Invented document answer" }),
    });

    const result = await assistant.answer({ uid: "student-a", question: "When does my travel signature expire?" });

    expect(result.evidence).toBe("insufficient");
    expect(result.notice).toMatch(/could not find this/i);
    expect(result.documentCitations).toEqual([]);
    expect(result.answer).not.toContain("Invented");
  });

  test("reports unavailable rather than a grounded answer when generation fails", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-a", "i20", [{
      index: 0, text: "A travel signature is valid for one year.", documentName: "I-20.pdf",
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      generateAnswer: async () => { throw new Error("quota exceeded"); },
    });

    const result = await assistant.answer({ uid: "student-a", question: "How long is the travel signature?" });

    expect(result.evidence).toBe("unavailable");
    expect(result.documentCitations).toEqual([]);
  });

  test("never retrieves another document when a documentId is supplied for a document the user does not own", async () => {
    const store = createDemoStore();
    await store.ragChunks.replace("student-b", "their-doc", [{
      index: 0, text: "Their travel signature details.", documentName: "B.pdf",
    }]);
    const assistant = createDocumentAssistant({
      fallback,
      store,
      generateAnswer: async () => ({ answer: "should not run" }),
    });

    const result = await assistant.answer({
      uid: "student-a", question: "travel signature", documentId: "their-doc",
    });

    expect(result.evidence).toBe("insufficient");
    expect(result.documentCitations).toEqual([]);
  });
});

describe("high-risk referrals", () => {
  test("directs immigration-status questions to the DSO without concluding anything", () => {
    const referral = referralFor("Am I still in status if I dropped a class?");
    expect(referral.message).toMatch(/Designated School Official|DSO/);
    expect(referral.message).not.toMatch(/you (are|are not) (in status|eligible)/i);
  });

  test("directs legal questions to an attorney", () => {
    expect(referralFor("Can I be deported after overstaying?").message).toMatch(/attorney/i);
  });

  test("directs tax questions to a tax professional", () => {
    expect(referralFor("Do I need to file Form 8843?").message).toMatch(/tax/i);
  });

  test("returns no referral for ordinary administrative questions", () => {
    expect(referralFor("What is a campus housing deposit?")).toBeNull();
  });
});

describe("document indexing preserves the upload when extraction fails", () => {
  const document = {
    id: "doc-1",
    name: "passport.jpg",
    contentType: "image/jpeg",
    storagePath: "users/student-a/documents/doc-1/passport.jpg",
  };

  test("a failed image extraction leaves no partial index and rejects with a retryable code", async () => {
    const store = createDemoStore();
    const indexer = createDocumentIndexer({
      store,
      extractText: async () => {
        const error = new Error("OCR is not configured.");
        error.code = "ocr_unavailable";
        error.retryable = true;
        throw error;
      },
    });

    await expect(indexer.index({ uid: "student-a", document })).rejects.toMatchObject({ code: "ocr_unavailable" });
    expect(await store.ragChunks.list("student-a", { documentId: "doc-1" })).toEqual([]);
  });
});
