import { describe, expect, test } from "vitest";

import { extractStoredDocument } from "../src/document-index.js";

function fakeBucket({ size = 1024, contentType = "application/pdf", bytes = Buffer.from("%PDF-1.4\n") } = {}) {
  const calls = { metadata: 0, download: 0 };
  return {
    calls,
    file() {
      return {
        async getMetadata() {
          calls.metadata += 1;
          return [{ size: String(size), contentType }];
        },
        async download() {
          calls.download += 1;
          return [bytes];
        },
      };
    },
  };
}

const document = {
  id: "doc-1",
  name: "I-20.pdf",
  contentType: "application/pdf",
  storagePath: "users/student-a/documents/doc-1/I-20.pdf",
};

describe("stored document extraction checks the real storage object", () => {
  test("refuses a stored object whose real type is not allowed, without downloading it", async () => {
    const bucket = fakeBucket({ contentType: "application/x-msdownload" });

    await expect(extractStoredDocument({ uid: "student-a", document, bucket, parsePdf: async () => [] }))
      .rejects.toMatchObject({ code: "unsupported_document_type" });
    expect(bucket.calls.download).toBe(0);
  });

  test("refuses a stored object over 10 MB even if the record claims a small size", async () => {
    const bucket = fakeBucket({ size: 11 * 1024 * 1024 });

    await expect(extractStoredDocument({ uid: "student-a", document, bucket, parsePdf: async () => [] }))
      .rejects.toMatchObject({ code: "document_too_large" });
    expect(bucket.calls.download).toBe(0);
  });

  test("extracts an allowed stored object using its verified storage content type", async () => {
    const bucket = fakeBucket({ contentType: "application/pdf" });

    const result = await extractStoredDocument({
      uid: "student-a",
      document,
      bucket,
      parsePdf: async () => [{ page: 1, text: "Travel signature valid until May." }],
    });

    expect(result.pages).toEqual([{ page: 1, text: "Travel signature valid until May." }]);
    expect(bucket.calls.download).toBe(1);
  });

  test("refuses to read a path outside the document's private folder", async () => {
    const bucket = fakeBucket();

    await expect(extractStoredDocument({
      uid: "student-a",
      document: { ...document, storagePath: "users/student-b/documents/doc-1/I-20.pdf" },
      bucket,
      parsePdf: async () => [],
    })).rejects.toThrow(/private document folder/);
    expect(bucket.calls.metadata).toBe(0);
  });
});
