import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { extractDocument } from "../src/document-extraction.js";
import { createDocumentIndexer } from "../src/document-index.js";
import { createLocalOcr } from "../src/ocr.js";
import { createDemoStore } from "../src/store.js";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/documents/${name}`, import.meta.url));
const bytesOf = (name) => new Uint8Array(readFileSync(fixture(name)));

function fakeBucket(files) {
  return {
    file(path) {
      const entry = files[path];
      return {
        async getMetadata() {
          return [{ size: String(entry.bytes.byteLength), contentType: entry.contentType }];
        },
        async download() {
          return [Buffer.from(entry.bytes)];
        },
      };
    },
  };
}

describe("production PDF extraction (real parser, no injected parse function)", () => {
  test("extracts every page of a multi-page PDF with its page reference", async () => {
    const result = await extractDocument({ bytes: bytesOf("multipage.pdf"), mimeType: "application/pdf" });

    expect(result.pages.map((page) => page.page)).toEqual([1, 2, 3]);
    expect(result.pages[1].text).toContain("travel signature valid until May 2031");
  });

  test("reports a scanned, image-only PDF as having no readable text, not as an empty success", async () => {
    await expect(extractDocument({ bytes: bytesOf("scanned.pdf"), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "no_readable_text" });
  });

  test("reports a blank PDF as having no readable text", async () => {
    await expect(extractDocument({ bytes: bytesOf("blank.pdf"), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "no_readable_text" });
  });

  test("maps a truncated PDF to a safe, non-retryable unreadable error without exposing parser internals", async () => {
    const error = await extractDocument({ bytes: bytesOf("malformed.pdf"), mimeType: "application/pdf" })
      .catch((caught) => caught);

    expect(error.code).toBe("pdf_unreadable");
    expect(error.retryable).toBe(false);
    expect(error.safeMessage).not.toMatch(/Invalid PDF structure|stack|at /);
  });

  test("rejects a PDF over the page limit before indexing it", async () => {
    await expect(extractDocument({ bytes: bytesOf("many-pages.pdf"), mimeType: "application/pdf" }))
      .rejects.toMatchObject({ code: "pdf_too_many_pages" });
  });
});

describe("production image extraction (real local OCR)", () => {
  const ocr = createLocalOcr();

  test("reads the text of a PNG photo of a document", async () => {
    const result = await extractDocument({ bytes: bytesOf("passport.png"), mimeType: "image/png", ocr });

    expect(result.text.toUpperCase()).toContain("PASSPORT");
    expect(result.text).toContain("2031");
    expect(result.pages[0].page).toBeNull();
  }, 60_000);

  test("reads the text of a JPEG photo of a document", async () => {
    const result = await extractDocument({ bytes: bytesOf("passport.jpg"), mimeType: "image/jpeg", ocr });

    expect(result.text.toUpperCase()).toContain("PASSPORT");
    expect(result.text).toContain("2031");
  }, 60_000);

  test("refuses an image that declares an oversized canvas before any OCR runs", async () => {
    const header = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
    header.writeUInt32BE(13, 8);
    header.write("IHDR", 12, "ascii");
    header.writeUInt32BE(9000, 16);
    header.writeUInt32BE(9000, 20);
    let ocrCalled = false;

    await expect(extractDocument({
      bytes: new Uint8Array(header),
      mimeType: "image/png",
      ocr: async () => { ocrCalled = true; return "x"; },
    })).rejects.toMatchObject({ code: "image_too_large" });
    expect(ocrCalled).toBe(false);
  });

  test("reports bytes labelled as an image that are not an image as unreadable", async () => {
    await expect(extractDocument({
      bytes: new Uint8Array(Buffer.from("not an image at all, just text")),
      mimeType: "image/jpeg",
      ocr,
    })).rejects.toMatchObject({ code: "image_unreadable" });
  });

  test("a recognition failure is safe and retryable and leaves no partial index", async () => {
    const failingOcr = createLocalOcr({
      workerFactory: async () => ({
        recognize: async () => { throw new Error("worker crashed with internal detail"); },
        terminate: async () => {},
      }),
    });
    const store = createDemoStore();
    const indexer = createDocumentIndexer({
      store,
      bucket: fakeBucket({ "users/student-a/documents/d1/passport.png": { bytes: bytesOf("passport.png"), contentType: "image/png" } }),
      ocr: failingOcr,
    });

    const error = await indexer.index({
      uid: "student-a",
      document: { id: "d1", name: "passport.png", storagePath: "users/student-a/documents/d1/passport.png" },
    }).catch((caught) => caught);

    expect(error.code).toBe("ocr_failed");
    expect(error.retryable).toBe(true);
    expect(error.safeMessage).not.toMatch(/internal detail/);
    expect(await store.ragChunks.list("student-a", { documentId: "d1" })).toEqual([]);
  });

  test("a recognition that exceeds its time limit fails retryably", async () => {
    const hangingOcr = createLocalOcr({
      timeoutMs: 20,
      workerFactory: async () => ({
        recognize: () => new Promise(() => {}),
        terminate: async () => {},
      }),
    });

    await expect(hangingOcr({ bytes: bytesOf("passport.png"), mimeType: "image/png" }))
      .rejects.toMatchObject({ code: "ocr_timeout", retryable: true });
  });
});

describe("indexing real PDFs through the production extractor with page references", () => {
  test("stores page-referenced chunks for a multi-page PDF and keeps none for a scanned one", async () => {
    const store = createDemoStore();
    const bucket = fakeBucket({
      "users/student-a/documents/d1/multipage.pdf": { bytes: bytesOf("multipage.pdf"), contentType: "application/pdf" },
      "users/student-a/documents/d2/scanned.pdf": { bytes: bytesOf("scanned.pdf"), contentType: "application/pdf" },
    });
    const indexer = createDocumentIndexer({ store, bucket, ocr: null });

    await indexer.index({ uid: "student-a", document: { id: "d1", name: "multipage.pdf", storagePath: "users/student-a/documents/d1/multipage.pdf" } });
    const chunks = await store.ragChunks.list("student-a", { documentId: "d1" });
    expect(new Set(chunks.map((chunk) => chunk.page))).toEqual(new Set([1, 2, 3]));

    await expect(indexer.index({ uid: "student-a", document: { id: "d2", name: "scanned.pdf", storagePath: "users/student-a/documents/d2/scanned.pdf" } }))
      .rejects.toMatchObject({ code: "no_readable_text" });
    expect(await store.ragChunks.list("student-a", { documentId: "d2" })).toEqual([]);
  });
});
