import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { extractDocument, hasExpectedSignature, maxDocumentBytes } from "../src/document-extraction.js";
import { extractStoredDocument } from "../src/document-index.js";
import { isOwnedDocumentPath, maxStoredFileNameLength, privateDocumentPath } from "../src/storage-paths.js";
import { createDemoStore } from "../src/store.js";

const pdf = Buffer.from("%PDF-1.4\n%synthetic\n");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

describe("owned document paths are exact, not prefix-matched", () => {
  test("accepts exactly users/<uid>/documents/<id>/<file>", () => {
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc_1-A/passport.pdf")).toBe(true);
    expect(isOwnedDocumentPath("student-a", privateDocumentPath("student-a", "Z9", "scan_2.png"))).toBe(true);
  });

  test("rejects traversal, extra segments, and another student's folder", () => {
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/../../users/student-b/documents/d/f.pdf")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/sub/f.pdf")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-b/documents/doc/f.pdf")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/..")).toBe(false);
  });

  test("rejects unexpected characters, a leading dot, and over-long names", () => {
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/.hidden.pdf")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/pass port.pdf")).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/.doc/f.pdf")).toBe(false);
    const tooLong = `${"a".repeat(maxStoredFileNameLength + 1)}.pdf`;
    expect(isOwnedDocumentPath("student-a", `users/student-a/documents/doc/${tooLong}`)).toBe(false);
    expect(isOwnedDocumentPath("student-a", "users/student-a/documents/doc/f%2F..pdf")).toBe(false);
  });

  test("a malformed uid never qualifies", () => {
    expect(isOwnedDocumentPath("", "users//documents/d/f.pdf")).toBe(false);
    expect(isOwnedDocumentPath("a/b", "users/a/b/documents/d/f.pdf")).toBe(false);
    expect(isOwnedDocumentPath(undefined, "users/undefined/documents/d/f.pdf")).toBe(false);
  });
});

describe("document routes enforce the owned path", () => {
  async function appWithDocument(storagePath, { deleteStoredFile } = {}) {
    const store = createDemoStore();
    const document = await store.documents.create("student-a", {
      name: "i20.pdf", contentType: "application/pdf", storagePath,
    });
    const app = createApp({ store, auth: null, demoMode: true, deleteStoredFile });
    return { store, app, document };
  }

  test("indexing rejects a traversal path before any storage read", async () => {
    const reads = vi.fn();
    const store = createDemoStore();
    const document = await store.documents.create("student-a", {
      name: "i20.pdf",
      contentType: "application/pdf",
      storagePath: "users/student-a/documents/../../users/student-b/documents/d/f.pdf",
    });
    const app = createApp({ store, auth: null, demoMode: true, assistant: { indexDocument: reads, mode: "live" } });
    const response = await request(app).post(`/api/documents/${document.id}/index`).set("x-demo-user", "student-a").expect(422);
    expect(reads).not.toHaveBeenCalled();
    expect(response.body.error.code).toBe("invalid_storage_path");
  });

  test("the storage object is deleted before its record, and the record goes only after success", async () => {
    const calls = [];
    const deleteStoredFile = vi.fn(async (path) => { calls.push(`storage:${path}`); });
    const { store, app, document } = await appWithDocument("users/student-a/documents/doc1/i20.pdf", { deleteStoredFile });
    await request(app).delete(`/api/documents/${document.id}`).set("x-demo-user", "student-a").expect(204);
    expect(deleteStoredFile).toHaveBeenCalledWith("users/student-a/documents/doc1/i20.pdf");
    expect(await store.documents.list("student-a")).toEqual([]);
    expect(calls).toEqual(["storage:users/student-a/documents/doc1/i20.pdf"]);
  });

  test("a failed storage delete keeps the record so the student can retry", async () => {
    const deleteStoredFile = vi.fn(async () => { throw new Error("storage unavailable"); });
    const { store, app, document } = await appWithDocument("users/student-a/documents/doc1/i20.pdf", { deleteStoredFile });
    const response = await request(app).delete(`/api/documents/${document.id}`).set("x-demo-user", "student-a").expect(503);
    expect(response.body.error.code).toBe("document_storage_unavailable");
    expect(JSON.stringify(response.body)).not.toContain("storage unavailable");
    expect(await store.documents.list("student-a")).toHaveLength(1);
  });

  test("a stored file with no deletion adapter is refused rather than orphaned", async () => {
    const { store, app, document } = await appWithDocument("users/student-a/documents/doc1/i20.pdf");
    await request(app).delete(`/api/documents/${document.id}`).set("x-demo-user", "student-a").expect(503);
    expect(await store.documents.list("student-a")).toHaveLength(1);
  });

  test("a record pointing outside the owner's folder never reaches storage, and only the record is removed", async () => {
    const deleteStoredFile = vi.fn();
    const { store, app, document } = await appWithDocument("users/student-b/documents/doc1/i20.pdf", { deleteStoredFile });
    await request(app).delete(`/api/documents/${document.id}`).set("x-demo-user", "student-a").expect(204);
    expect(deleteStoredFile).not.toHaveBeenCalled();
    expect(await store.documents.list("student-a")).toEqual([]);
  });
});

describe("document bytes are checked against their declared type", () => {
  test("a PDF header is required and tolerated only near the start", () => {
    expect(hasExpectedSignature(new Uint8Array(pdf), "application/pdf")).toBe(true);
    expect(hasExpectedSignature(new Uint8Array(Buffer.from("junk before header %PDF-1.7")), "application/pdf")).toBe(true);
    expect(hasExpectedSignature(new Uint8Array(png), "application/pdf")).toBe(false);
  });

  test("PNG and JPEG signatures must match exactly", () => {
    expect(hasExpectedSignature(new Uint8Array(png), "image/png")).toBe(true);
    expect(hasExpectedSignature(new Uint8Array(pdf), "image/png")).toBe(false);
    expect(hasExpectedSignature(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
    expect(hasExpectedSignature(new Uint8Array(png), "image/jpeg")).toBe(false);
  });

  test("a PNG labelled as a PDF is refused as a type mismatch", async () => {
    await expect(extractDocument({ bytes: new Uint8Array(png), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "file_type_mismatch" });
  });

  test("an empty file is reported as empty, not as too large", async () => {
    await expect(extractDocument({ bytes: new Uint8Array(0), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "empty_document" });
  });

  test("bytes larger than the limit are refused even when the stored metadata claims they are small", async () => {
    const bucket = {
      file() {
        return {
          async getMetadata() { return [{ size: "1024", contentType: "application/pdf" }]; },
          async download() { return [Buffer.alloc(maxDocumentBytes + 1)]; },
        };
      },
    };
    await expect(extractStoredDocument({
      uid: "student-a",
      document: { storagePath: "users/student-a/documents/d1/big.pdf" },
      bucket,
      parsePdf: async () => [{ page: 1, text: "never reached" }],
    })).rejects.toMatchObject({ code: "document_too_large" });
  });

  test("a stored object with a mismatched content type is refused before download", async () => {
    const download = vi.fn();
    const bucket = {
      file() {
        return {
          async getMetadata() { return [{ size: "1024", contentType: "text/html" }]; },
          download,
        };
      },
    };
    await expect(extractStoredDocument({
      uid: "student-a",
      document: { storagePath: "users/student-a/documents/d1/page.pdf" },
      bucket,
      parsePdf: async () => [],
    })).rejects.toMatchObject({ code: "unsupported_document_type" });
    expect(download).not.toHaveBeenCalled();
  });
});
