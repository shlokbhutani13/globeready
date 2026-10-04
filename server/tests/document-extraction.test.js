import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { DocumentExtractionError, extractDocument, maxDocumentBytes } from "../src/document-extraction.js";

const fixture = (name) => fileURLToPath(new URL(`./fixtures/documents/${name}`, import.meta.url));
const pdfBytes = Buffer.from("%PDF-1.4 fake");
const parsePdf = async () => [
  { page: 1, text: "Student name and university." },
  { page: 2, text: "Travel signature valid until May." },
];

describe("extractDocument", () => {
  test("accepts PDF, PNG, and JPEG and rejects any other type", async () => {
    await expect(extractDocument({ bytes: pdfBytes, mimeType: "application/pdf", parsePdf })).resolves.toBeTruthy();
    await expect(extractDocument({ bytes: pdfBytes, mimeType: "text/plain", parsePdf })).rejects.toMatchObject({
      code: "unsupported_document_type",
    });
    await expect(extractDocument({ bytes: pdfBytes, mimeType: "application/x-msdownload", parsePdf })).rejects.toMatchObject({
      code: "unsupported_document_type",
    });
  });

  test("rejects a file larger than 10 MB before parsing it", async () => {
    let parsed = false;
    const oversized = Buffer.alloc(maxDocumentBytes + 1);
    await expect(extractDocument({
      bytes: oversized,
      mimeType: "application/pdf",
      parsePdf: async () => { parsed = true; return []; },
    })).rejects.toMatchObject({ code: "document_too_large" });
    expect(parsed).toBe(false);
  });

  test("keeps PDF page references for each extracted page", async () => {
    const result = await extractDocument({ bytes: pdfBytes, mimeType: "application/pdf", parsePdf });

    expect(result.pages).toEqual([
      { page: 1, text: "Student name and university." },
      { page: 2, text: "Travel signature valid until May." },
    ]);
    expect(result.text).toContain("Travel signature");
  });

  test("fails closed for images when no OCR adapter is configured, as a retryable state", async () => {
    const error = await extractDocument({
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]),
      mimeType: "image/png",
      ocr: null,
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(DocumentExtractionError);
    expect(error.code).toBe("ocr_unavailable");
    expect(error.retryable).toBe(true);
  });

  test("uses an injected OCR adapter for a real JPEG without inventing a page number", async () => {
    const result = await extractDocument({
      bytes: new Uint8Array(readFileSync(fixture("passport.jpg"))),
      mimeType: "image/jpeg",
      ocr: async () => "Passport number and expiry date.",
    });

    expect(result.pages).toEqual([{ page: null, text: "Passport number and expiry date." }]);
  });

  test("reports a document with no readable text instead of returning an empty success", async () => {
    await expect(extractDocument({
      bytes: pdfBytes,
      mimeType: "application/pdf",
      parsePdf: async () => [{ page: 1, text: "   " }],
    })).rejects.toMatchObject({ code: "no_readable_text" });
  });
});
