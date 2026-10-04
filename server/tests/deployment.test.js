import request from "supertest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { normalizePrivateKey } from "../src/firebase-admin.js";
import { createDemoStore } from "../src/store.js";

describe("deployment services", () => {
  test("documents the storage billing gate and client upload switch", async () => {
    const deployment = await readFile(resolve(process.cwd(), "../DEPLOYMENT.md"), "utf8");
    expect(deployment).toContain("Blaze");
    expect(deployment).toContain("VITE_DOCUMENT_UPLOADS_ENABLED=true");
  });

  test("normalizes escaped service-account private keys", () => {
    expect(normalizePrivateKey("line-one\\nline-two")).toBe("line-one\nline-two");
  });

  test("analyzes only a document owned by the authenticated user", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", {
      name: "I-20.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-a/documents/i20.pdf",
    });
    const assistant = {
      answer: vi.fn(),
      analyzeDocument: vi.fn().mockResolvedValue({
        summary: "This is an I-20.",
        actions: ["Check the program start date."],
        importantDates: [],
        terms: [],
        confidence: "medium",
        disclaimer: "Verify with your international student office.",
      }),
    };
    const app = createApp({ store, auth: null, assistant });

    const response = await request(app)
      .post(`/api/documents/${document.id}/analyze`)
      .set("x-demo-user", "student-a")
      .expect(200);

    expect(response.body.data.summary).toMatch(/I-20/);
    expect(assistant.analyzeDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "student-a", document }),
    );
  });

  test("rejects document metadata that points outside the authenticated user's storage folder", async () => {
    const store = createDemoStore({ seedConsent: ["student-a", "student-b", "student-c", "student-d", "victim-uid"] });
    const document = await store.documents.create("student-a", {
      name: "Unknown.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-b/documents/private.pdf",
    });
    const assistant = {
      mode: "live",
      answer: vi.fn(),
      analyzeDocument: vi.fn(),
    };

    const response = await request(createApp({ store, auth: null, assistant }))
      .post(`/api/documents/${document.id}/analyze`)
      .set("x-demo-user", "student-a")
      .expect(422);

    expect(response.body.error.code).toBe("invalid_storage_path");
    expect(assistant.analyzeDocument).not.toHaveBeenCalled();
  });
});
