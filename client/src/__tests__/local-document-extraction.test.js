import { describe, expect, test, vi } from "vitest";
import { extractLocalDocument } from "../lib/local-documents/extract";

const pdf = () => new File([new TextEncoder().encode("%PDF-1.7\n")], "status.pdf", { type: "application/pdf" });

describe("browser-local extraction orchestration", () => {
  test("persists only after complete extraction, with page counts, and keeps original bytes out of the record", async () => {
    const persist = vi.fn(async () => {});
    const result = await extractLocalDocument(pdf(), {
      pdfExtractor: async () => [{ page: 1, text: "Maintain full-time enrollment." }, { page: 2, text: "" }],
      persist,
      id: "doc-00",
    });
    expect(result).toMatchObject({ id: "doc-00", pageCount: 2, pagesWithText: 1, chunks: [{ page: 1, text: "Maintain full-time enrollment." }] });
    expect(persist).toHaveBeenCalledOnce();
    expect(JSON.stringify(persist.mock.calls[0])).not.toContain("%PDF");
  });

  test("reports progress from the extractor and finishes at 100%", async () => {
    const progress = [];
    await extractLocalDocument(pdf(), {
      id: "doc-00",
      onProgress: (update) => progress.push(update),
      pdfExtractor: async (_file, { onProgress }) => { onProgress({ percent: 50, label: "Reading page 1 of 2" }); return [{ page: 1, text: "text" }]; },
      persist: async () => {},
    });
    expect(progress[0]).toMatchObject({ percent: expect.any(Number), label: expect.stringMatching(/checking/i) });
    expect(progress).toContainEqual({ percent: 49, label: "Reading page 1 of 2" });
    expect(progress.map((update) => update.percent)).toEqual([...progress.map((update) => update.percent)].sort((a, b) => a - b));
    expect(progress.at(-1)).toMatchObject({ percent: 100 });
  });

  test("writes nothing after parser failure, empty extraction, oversize text, or cancellation", async () => {
    const persist = vi.fn();
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => { throw new Error("Encrypted PDF"); }, persist, id: "doc-00" })).rejects.toThrow(/Encrypted/);
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => [], persist, id: "doc-00" })).rejects.toThrow(/readable text/i);
    await expect(extractLocalDocument(pdf(), {
      pdfExtractor: async () => Array.from({ length: 100 }, (_, index) => ({ page: index + 1, text: "word ".repeat(2_000) })), persist, id: "doc-00",
    })).rejects.toThrow(/more text/i);
    const controller = new AbortController();
    await expect(extractLocalDocument(pdf(), {
      pdfExtractor: async () => { controller.abort(); return [{ page: 1, text: "x" }]; }, persist, id: "doc-00", signal: controller.signal,
    })).rejects.toThrow(/cancel/i);
    expect(persist).not.toHaveBeenCalled();
  });

  test("explains password-protected PDFs instead of showing a parser error", async () => {
    const passwordError = Object.assign(new Error("No password given"), { name: "PasswordException" });
    await expect(extractLocalDocument(pdf(), { pdfExtractor: async () => { throw passwordError; }, persist: vi.fn(), id: "doc-00" }))
      .rejects.toThrow(/password-protected/i);
  });

  test("refuses more than 100 PDF pages", async () => {
    await expect(extractLocalDocument(pdf(), {
      pdfExtractor: async () => Array.from({ length: 101 }, (_, index) => ({ page: index + 1, text: "text" })),
      persist: vi.fn(), id: "doc-00",
    })).rejects.toThrow(/100 pages/i);
  });
});
