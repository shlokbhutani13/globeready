import { PDFParse } from "pdf-parse";
import { DocumentExtractionError } from "./extraction-errors.js";
import { assertReasonableImage } from "./image-limits.js";

export { DocumentExtractionError };

export const maxDocumentBytes = 10 * 1024 * 1024;
export const maxPdfPages = 100;
const pdfType = "application/pdf";
const imageTypes = new Set(["image/png", "image/jpeg"]);
export const allowedExtractionTypes = new Set([pdfType, ...imageTypes]);

// Declared MIME types are not trusted: the file must carry the signature of the type it claims.
const signatures = {
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/jpeg": [[0xff, 0xd8, 0xff]],
};

export function hasExpectedSignature(bytes, mimeType) {
  if (mimeType === pdfType) {
    // A PDF may have junk before its header; the header must appear near the start.
    const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
    return head.includes("%PDF-");
  }
  return (signatures[mimeType] || []).some((signature) => signature.every((value, index) => bytes[index] === value));
}

export function assertSupportedDocument({ mimeType, size }) {
  if (!allowedExtractionTypes.has(mimeType)) {
    throw new DocumentExtractionError("unsupported_document_type", "Upload a PDF, PNG, or JPEG file.");
  }
  if (!Number.isFinite(size) || size < 0) {
    throw new DocumentExtractionError("invalid_document_bytes", "The document could not be read.");
  }
  if (size === 0) {
    throw new DocumentExtractionError("empty_document", "This file is empty. Upload the document again.");
  }
  if (size > maxDocumentBytes) {
    throw new DocumentExtractionError("document_too_large", "Files must be 10 MB or smaller.");
  }
}

async function parsePdfPages(bytes) {
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    if (result.pages.length > maxPdfPages) {
      throw new DocumentExtractionError(
        "pdf_too_many_pages",
        `This PDF has more than ${maxPdfPages} pages. Upload the pages that matter.`,
      );
    }
    return result.pages.map((page) => ({ page: page.num, text: page.text }));
  } catch (error) {
    if (error instanceof DocumentExtractionError) throw error;
    throw new DocumentExtractionError(
      "pdf_unreadable",
      "This PDF could not be read. It may be damaged or password-protected.",
    );
  } finally {
    await parser.destroy().catch(() => {});
  }
}

export async function extractDocument({ bytes, mimeType, ocr = null, parsePdf = parsePdfPages }) {
  if (!(bytes instanceof Uint8Array)) {
    throw new DocumentExtractionError("invalid_document_bytes", "The document could not be read.");
  }
  assertSupportedDocument({ mimeType, size: bytes.byteLength });
  if (!hasExpectedSignature(bytes, mimeType)) {
    throw new DocumentExtractionError(
      "file_type_mismatch",
      "This file does not match its type. Upload a PDF, PNG, or JPEG file.",
    );
  }

  let pages;
  if (mimeType === pdfType) {
    pages = await parsePdf(bytes);
  } else {
    if (typeof ocr !== "function") {
      throw new DocumentExtractionError(
        "ocr_unavailable",
        "Reading text from images is not enabled for this deployment. Your upload is saved; try again later.",
        { retryable: true, status: 503 },
      );
    }
    assertReasonableImage(bytes, mimeType);
    pages = [{ page: null, text: await ocr({ bytes, mimeType }) }];
  }

  const readable = pages
    .map((entry) => ({
      page: Number.isInteger(entry.page) ? entry.page : null,
      text: String(entry.text || ""),
    }))
    .filter((entry) => entry.text.trim());
  if (!readable.length) {
    throw new DocumentExtractionError(
      "no_readable_text",
      "No readable text was found. Scanned or image-only PDFs and handwriting cannot be read; upload a text-based PDF or a clear, printed photo.",
    );
  }
  return {
    pages: readable,
    text: readable.map((entry) => entry.text).join("\n"),
    warnings: [],
  };
}
