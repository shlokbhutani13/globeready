import { describe, expect, test } from "vitest";
import { validateLocalFile } from "../lib/local-documents/file-policy";
import { chunkDocumentPages } from "../lib/local-documents/chunks";

function file(bytes, name, type) {
  return new File([Uint8Array.from(bytes)], name, { type });
}

describe("browser-local document policy", () => {
  test("accepts supported files only when MIME type and magic bytes agree", async () => {
    await expect(validateLocalFile(file([0x25, 0x50, 0x44, 0x46, 0x2d], "i20.pdf", "application/pdf"))).resolves.toMatchObject({ contentType: "application/pdf" });
    await expect(validateLocalFile(file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "visa.png", "image/png"))).resolves.toMatchObject({ contentType: "image/png" });
    await expect(validateLocalFile(file([0xff, 0xd8, 0xff, 0xe0], "passport.jpg", "image/jpeg"))).resolves.toMatchObject({ contentType: "image/jpeg" });
    await expect(validateLocalFile(file([0x3c, 0x68, 0x74, 0x6d], "renamed.pdf", "application/pdf"))).rejects.toThrow(/contents do not match/i);
  });

  test("refuses unsupported and oversized files before parsing", async () => {
    await expect(validateLocalFile(file([1, 2, 3], "notes.txt", "text/plain"))).rejects.toThrow(/PDF, PNG, or JPEG/i);
    const oversized = { name: "huge.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1, slice: () => new Blob([]) };
    await expect(validateLocalFile(oversized)).rejects.toThrow(/10 MB/i);
  });

  test("creates bounded page-aware chunks", () => {
    const chunks = chunkDocumentPages([{ page: 1, text: "alpha ".repeat(900) }, { page: 2, text: "beta" }]);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(100);
    expect(chunks.every((chunk) => chunk.text.length <= 4000)).toBe(true);
    expect(chunks.at(-1)).toEqual({ page: 2, text: "beta" });
  });
});
