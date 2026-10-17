import { describe, expect, test } from "vitest";
import { readImageDimensions, validateLocalFile } from "../lib/local-documents/file-policy";
import { indexDocumentPages, localIndexLimits, redactSensitiveIdentifiers } from "../lib/local-documents/chunks";

function file(bytes, name, type) {
  return new File([Uint8Array.from(bytes)], name, { type });
}

function png(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width, height, { exifBytes = 0 } = {}) {
  const exif = exifBytes ? [0xff, 0xe1, ((exifBytes + 2) >> 8) & 0xff, (exifBytes + 2) & 0xff, ...new Array(exifBytes).fill(0)] : [];
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), ...exif,
    0xff, 0xc0, 0x00, 0x11, 0x08, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 0x03,
    ...new Array(9).fill(0),
  ]);
}

describe("browser-local document policy", () => {
  test("masks common immigration document identifiers before text is chunked", () => {
    const text = [
      "SEVIS ID: N0012345678",
      "USCIS receipt number IOE0912345678",
      "Passport Number A12345678",
      "Visa number 12345678",
      "Program start date 2026-08-20",
    ].join("\n");
    const redacted = redactSensitiveIdentifiers(text);
    expect(redacted).not.toContain("N0012345678");
    expect(redacted).not.toContain("IOE0912345678");
    expect(redacted).not.toContain("A12345678");
    expect(redacted).not.toContain("Visa number 12345678");
    expect(redacted).toContain("2026-08-20");
    expect(redacted.match(/\[REDACTED\]/gu)).toHaveLength(4);
  });

  test("does not broadly remove unlabeled dates or ordinary numbers", () => {
    expect(redactSensitiveIdentifiers("Class code 12345678. Date 2026-08-20. Amount $1234."))
      .toBe("Class code 12345678. Date 2026-08-20. Amount $1234.");
  });

  test("accepts supported files only when MIME type and magic bytes agree", async () => {
    await expect(validateLocalFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], "i20.pdf", "application/pdf"))).resolves.toMatchObject({ contentType: "application/pdf" });
    await expect(validateLocalFile(file(png(1200, 800), "visa.png", "image/png"))).resolves.toMatchObject({ contentType: "image/png", width: 1200, height: 800 });
    await expect(validateLocalFile(file(jpeg(3000, 4000), "passport.jpg", "image/jpeg"))).resolves.toMatchObject({ contentType: "image/jpeg", width: 3000, height: 4000 });
    await expect(validateLocalFile(file([0x3c, 0x68, 0x74, 0x6d, 0x6c], "renamed.pdf", "application/pdf"))).rejects.toThrow(/contents do not match/i);
  });

  test("refuses unsupported and oversized files before parsing", async () => {
    await expect(validateLocalFile(file([1, 2, 3], "notes.txt", "text/plain"))).rejects.toThrow(/PDF, PNG, or JPEG/i);
    const oversized = { name: "huge.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1, slice: () => new Blob([]) };
    await expect(validateLocalFile(oversized)).rejects.toThrow(/10 MB/i);
  });

  test("reads image dimensions from headers, including JPEGs with large metadata blocks", () => {
    expect(readImageDimensions(png(640, 480), "image/png")).toEqual({ width: 640, height: 480 });
    expect(readImageDimensions(jpeg(2048, 1536, { exifBytes: 60_000 }), "image/jpeg")).toEqual({ width: 2048, height: 1536 });
    expect(readImageDimensions(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg")).toBeNull();
  });

  test("refuses images too large to decode safely on a phone", async () => {
    await expect(validateLocalFile(file(png(9000, 300), "wide.png", "image/png"))).rejects.toThrow(/8,000 pixels/i);
    await expect(validateLocalFile(file(jpeg(6000, 6000), "huge.jpg", "image/jpeg"))).rejects.toThrow(/25 megapixels/i);
    await expect(validateLocalFile(file([0xff, 0xd8, 0xff, 0xd9], "broken.jpg", "image/jpeg"))).rejects.toThrow(/dimensions could not be read/i);
  });

  test("indexes every page, reports pages without text, and keeps chunks within limits", () => {
    const pages = [
      { page: 1, text: "alpha ".repeat(900) },
      { page: 2, text: "   " },
      { page: 3, text: "beta gamma" },
    ];
    const index = indexDocumentPages(pages);
    expect(index).toMatchObject({ pageCount: 3, pagesWithText: 2 });
    expect(index.chunks.length).toBeGreaterThan(1);
    expect(index.chunks.every((chunk) => chunk.text.length <= localIndexLimits.maxChunkLength)).toBe(true);
    expect(index.chunks.at(-1)).toEqual({ page: 3, text: "beta gamma" });
    expect(index.chunks.map((chunk) => chunk.text).join(" ").split(/\s+/u).filter((word) => word === "alpha")).toHaveLength(900);
  });

  test("never splits a word between chunks", () => {
    const text = Array.from({ length: 2000 }, (_, index) => `word${index}`).join(" ");
    const { chunks } = indexDocumentPages([{ page: 1, text }]);
    const rebuilt = chunks.map((chunk) => chunk.text).join(" ");
    expect(rebuilt).toBe(text);
  });

  test("refuses documents with more text than can be stored, instead of truncating them", () => {
    const dense = Array.from({ length: 100 }, (_, index) => ({ page: index + 1, text: `page ${index + 1} `.padEnd(9_000, "x ") }));
    expect(() => indexDocumentPages(dense)).toThrow(/more text than the free beta can store/i);
    expect(() => indexDocumentPages(dense)).toThrow(/split it into smaller files/i);
  });

  test("measures the storage budget in bytes, so non-Latin text cannot exceed Firestore's limit", () => {
    const pages = Array.from({ length: 60 }, (_, index) => ({ page: index + 1, text: "学生签证".repeat(1_200) }));
    expect(() => indexDocumentPages(pages)).toThrow(/more text than the free beta can store/i);
  });

  test("refuses empty extraction and more than 100 pages", () => {
    expect(() => indexDocumentPages([{ page: 1, text: "  " }])).toThrow(/no readable text/i);
    expect(() => indexDocumentPages(Array.from({ length: 101 }, (_, index) => ({ page: index + 1, text: "x" })))).toThrow(/100 pages/i);
  });
});
