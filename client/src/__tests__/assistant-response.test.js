import { describe, expect, test } from "vitest";
import { assistantMessageFromResponse } from "../pages/AssistantPage";

describe("assistant response presentation", () => {
  test("keeps document citations with an assistant answer", () => {
    expect(assistantMessageFromResponse({
      answer: "Your travel signature is valid for one year.",
      sources: [{ organization: "USCIS", url: "https://www.uscis.gov" }],
      documentCitations: [{ documentName: "I-20.pdf", page: 2, excerpt: "Travel signature" }],
    })).toMatchObject({
      role: "assistant",
      source: "USCIS",
      documentCitations: [{ documentName: "I-20.pdf", page: 2 }],
    });
  });
});
