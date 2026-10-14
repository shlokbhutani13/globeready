import { describe, expect, test, vi } from "vitest";
import { extractLocalDocument } from "../lib/local-documents/extract";

const pdf = () => new File([new TextEncoder().encode("%PDF-1.7\n")], "status.pdf", { type: "application/pdf" });

describe("browser-local extraction orchestration", () => {
  test("persists only after complete extraction and keeps original bytes out of the record", async () => {
    const persist = vi.fn(async () => {});
    const result = await extractLocalDocument(pdf(), {
      pdfExtractor: async () => [{ page: 1, text: "Maintain full-time enrollment." }],
      persist,
      id: "doc-1",
    });
    expect(result.chunks).toEqual([{ page: 1, text: "Maintain full-time enrollment." }]);
    expect(persist).toHaveBeenCalledOnce();
    expect(JSON.stringify(persist.mock.calls[0])).not.toContain("%PDF");
  });

  test("writes nothing after parser failure, empty extraction, or cancellation", async () => {
    const persist = vi.fn();
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => { throw new Error("Encrypted PDF"); }, persist, id: "doc-1" })).rejects.toThrow(/Encrypted/);
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => [], persist, id: "doc-1" })).rejects.toThrow(/readable text/i);
    const controller = new AbortController(); controller.abort();
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => [{ page: 1, text: "x" }], persist, id: "doc-1", signal: controller.signal })).rejects.toThrow(/cancel/i);
    expect(persist).not.toHaveBeenCalled();
  });

  test("refuses more than 100 PDF pages", async () => {
    await expect(extractLocalDocument(pdf(), {
      pdfExtractor: async () => Array.from({ length: 101 }, (_, index) => ({ page: index + 1, text: "text" })),
      persist: vi.fn(), id: "doc-1",
    })).rejects.toThrow(/100 pages/i);
  });
});
