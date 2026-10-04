import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

describe("document indexing route", () => {
  test("indexes only the requesting student's private document", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", {
      name: "I-20.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-a/documents/doc-1/I-20.pdf",
    });
    const assistant = {
      mode: "live",
      async indexDocument({ uid, document: received }) {
        expect(uid).toBe("student-a");
        expect(received.id).toBe(document.id);
        return { summary: "Indexed for document chat.", chunkCount: 1 };
      },
      async analyzeDocument() { return {}; },
      async answer() { return {}; },
    };
    const app = createApp({ store, auth: null, assistant });

    const response = await request(app)
      .post(`/api/documents/${document.id}/index`)
      .set("x-demo-user", "student-a")
      .expect(200);

    expect(response.body.data.chunkCount).toBe(1);
    expect((await store.documents.list("student-a"))[0]).toMatchObject({
      analysisStatus: "indexed",
      indexedAt: expect.any(String),
    });
  });

  test("rejects an index path outside the authenticated student's folder", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", {
      name: "I-20.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-b/documents/doc-1/I-20.pdf",
    });
    const app = createApp({
      store,
      auth: null,
      assistant: {
        mode: "live",
        async indexDocument() { throw new Error("must not run"); },
        async answer() { return {}; },
        async analyzeDocument() { return {}; },
      },
    });

    const response = await request(app)
      .post(`/api/documents/${document.id}/index`)
      .set("x-demo-user", "student-a")
      .expect(422);

    expect(response.body.error.code).toBe("invalid_storage_path");
  });

  test("records a failed index without retaining partial chunks", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", {
      name: "Unreadable.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-a/documents/doc-2/Unreadable.pdf",
    });
    await store.ragChunks.replace("student-a", document.id, [{
      index: 0,
      text: "stale text",
      embedding: [1, 0],
    }]);
    const app = createApp({
      store,
      auth: null,
      assistant: {
        mode: "live",
        async indexDocument() {
          await store.ragChunks.removeForDocument("student-a", document.id);
          throw new Error("PDF has no readable text");
        },
        async answer() { return {}; },
        async analyzeDocument() { return {}; },
      },
    });

    const response = await request(app)
      .post(`/api/documents/${document.id}/index`)
      .set("x-demo-user", "student-a")
      .expect(422);

    expect(response.body.error.code).toBe("document_index_failed");
    expect((await store.documents.list("student-a"))[0].analysisStatus).toBe("index_failed");
    expect(await store.ragChunks.list("student-a", { documentId: document.id })).toEqual([]);
  });

  test("deleting a document also removes its private index", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", { name: "Old.pdf" });
    await store.ragChunks.replace("student-a", document.id, [{
      index: 0,
      text: "private text",
      embedding: [1, 0],
    }]);

    await request(createApp({ store, auth: null }))
      .delete(`/api/documents/${document.id}`)
      .set("x-demo-user", "student-a")
      .expect(204);

    expect(await store.ragChunks.list("student-a", { documentId: document.id })).toEqual([]);
  });

  test("passes an optional document scope to the assistant", async () => {
    const app = createApp({
      auth: null,
      store: createDemoStore({ seedConsent: ["student-a"] }),
      assistant: {
        async answer({ documentId }) {
          return { answer: `Scoped to ${documentId}`, sources: [] };
        },
        async analyzeDocument() { return {}; },
      },
    });

    const response = await request(app)
      .post("/api/assistant")
      .set("x-demo-user", "student-a")
      .send({ question: "What date is listed?", documentId: "doc-9" })
      .expect(200);

    expect(response.body.data.answer).toBe("Scoped to doc-9");
  });
});
