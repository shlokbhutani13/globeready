import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoStore } from "../src/store.js";

const fakeIndexer = () => ({
  async indexDocument({ document }) {
    if (!document.storagePath?.startsWith("users/student-a/documents/")) {
      const error = new Error("not private");
      error.status = 422;
      error.code = "invalid_storage_path";
      throw error;
    }
    return { summary: `${document.name} indexed`, chunkCount: 1, mode: "live" };
  },
  answer: async () => ({ answer: "ok", documentCitations: [], evidence: "insufficient" }),
});

describe("document registration and indexing", () => {
  test("the supported flow registers a stored upload with its private path and indexes it", async () => {
    const store = createDemoStore();
    const app = createApp({ store, auth: null, assistant: fakeIndexer() });
    const storagePath = "users/student-a/documents/doc-1/I-20.pdf";
    const registered = await store.documents.create("student-a", {
      name: "I-20.pdf",
      storagePath,
      contentType: "application/pdf",
      size: 1200,
      analysisStatus: "not_requested",
    });

    const response = await request(app)
      .post(`/api/documents/${registered.id}/index`)
      .set("x-demo-user", "student-a")
      .expect(200);

    expect(response.body.data.chunkCount).toBe(1);
    const [document] = await store.documents.list("student-a");
    expect(document.analysisStatus).toBe("indexed");
  });

  test("a record without a private storage path cannot be indexed", async () => {
    const store = createDemoStore();
    const app = createApp({ store, auth: null, assistant: fakeIndexer() });
    const unusable = await store.documents.create("student-a", {
      name: "orphan.pdf",
      contentType: "application/pdf",
      size: 1200,
      analysisStatus: "not_requested",
    });

    await request(app)
      .post(`/api/documents/${unusable.id}/index`)
      .set("x-demo-user", "student-a")
      .expect(422);
  });
});
