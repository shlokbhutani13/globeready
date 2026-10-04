import request from "supertest";
import { beforeEach, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

const fallback = {
  mode: "demo",
  async answer({ question }) {
    return { mode: "demo", answer: `General guidance for ${question}`, sources: [], documentCitations: [] };
  },
};

describe("assistant conversations", () => {
  let store;
  let app;

  beforeEach(async () => {
    store = createDemoStore();
    const assistant = {
      mode: "live",
      async answer({ uid, question, documentId }) {
        if (uid === "student-a" && /travel/i.test(question) && documentId === "i20") {
          return {
            mode: "live",
            evidence: "grounded",
            answer: "Your I-20 shows a travel signature.",
            documentCitations: [{ documentName: "I-20.pdf", page: 2, excerpt: "travel signature" }],
          };
        }
        return { ...(await fallback.answer({ question })), evidence: "insufficient" };
      },
    };
    app = createApp({ store, auth: null, assistant });
    await store.ragChunks.replace("student-a", "i20", [{ index: 0, text: "travel signature", documentName: "I-20.pdf", page: 2 }]);
  });

  const demo = (method, path, user = "student-a") => request(app)[method](path).set("x-demo-user", user);

  test("persists the question, answer, and citations into a student's conversation", async () => {
    const response = await demo("post", "/api/assistant")
      .send({ question: "How long is my travel signature?", documentId: "i20" })
      .expect(200);

    const conversationId = response.body.data.conversationId;
    expect(conversationId).toEqual(expect.any(String));

    const messages = (await demo("get", `/api/assistant/conversations/${conversationId}/messages`)).body.data;
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1].documentCitations).toEqual([
      { documentName: "I-20.pdf", page: 2, excerpt: "travel signature" },
    ]);
  });

  test("continues an existing conversation rather than starting a new one", async () => {
    const first = await demo("post", "/api/assistant").send({ question: "How long is my travel signature?" });
    const conversationId = first.body.data.conversationId;

    const second = await demo("post", "/api/assistant")
      .send({ question: "What about my passport?", conversationId })
      .expect(200);

    expect(second.body.data.conversationId).toBe(conversationId);
    const list = await demo("get", "/api/assistant/conversations");
    expect(list.body.data).toHaveLength(1);
  });

  test("keeps conversations isolated between students", async () => {
    const first = await demo("post", "/api/assistant").send({ question: "How long is my travel signature?" });
    const conversationId = first.body.data.conversationId;

    expect((await demo("get", "/api/assistant/conversations", "student-b")).body.data).toEqual([]);
    await demo("get", `/api/assistant/conversations/${conversationId}/messages`, "student-b").expect(404);
    await demo("post", "/api/assistant", "student-b")
      .send({ question: "Follow up on that", conversationId })
      .expect(404);
  });

  test("does not let a student read a conversation they do not own by guessing its ID", async () => {
    const created = await demo("post", "/api/assistant").send({ question: "Private question about my visa" });
    const conversationId = created.body.data.conversationId;

    const response = await demo("get", `/api/assistant/conversations/${conversationId}/messages`, "student-b");
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain("Private question");
  });

  test("rejects a malformed conversation identifier", async () => {
    await demo("get", "/api/assistant/conversations/..%2Fother/messages").expect(404);
  });

  test("attaches a professional referral to high-risk questions", async () => {
    const response = await demo("post", "/api/assistant")
      .send({ question: "Can I be deported after overstaying my visa?" })
      .expect(200);

    expect(response.body.data.referral.message).toMatch(/attorney/i);
  });
});
