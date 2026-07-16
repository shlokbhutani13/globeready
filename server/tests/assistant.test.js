import { describe, expect, test } from "vitest";

import { createAssistant } from "../src/assistant.js";

describe("assistant sources", () => {
  test("selects a relevant official source for the student's question", async () => {
    const answer = await createAssistant().answer({
      question: "What should I compare when opening a bank account?",
      profile: null,
    });

    expect(answer.sources[0].organization).toBe("Consumer Financial Protection Bureau");
    expect(answer.answer).toMatch(/fees/i);
  });
});
