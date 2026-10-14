import { afterEach, describe, expect, test, vi } from "vitest";

const recognize = vi.fn();
const terminate = vi.fn(async () => {});
const createWorker = vi.fn();
vi.mock("tesseract.js", () => ({ createWorker }));

const { extractImagePage } = await import("../lib/local-documents/image-worker");
const image = () => new File([Uint8Array.from([0x89, 0x50])], "card.png", { type: "image/png" });

afterEach(() => { vi.clearAllMocks(); });

describe("browser OCR worker", () => {
  test("loads the worker, core, and English model only from GlobeReady's own origin", async () => {
    createWorker.mockResolvedValue({ recognize: recognize.mockResolvedValue({ data: { text: "PRINTED TEXT" } }), terminate });
    await expect(extractImagePage(image())).resolves.toEqual([{ page: 1, text: "PRINTED TEXT" }]);
    const [, , options] = createWorker.mock.calls[0];
    for (const key of ["workerPath", "corePath", "langPath"]) expect(options[key]).toMatch(/^\/ocr\/[a-f0-9]{16}/u);
    expect(options.workerBlobURL).toBe(false);
    expect(JSON.stringify(options)).not.toMatch(/https?:/u);
    expect(terminate).toHaveBeenCalledOnce();
  });

  test("maps recognition progress into an increasing percentage", async () => {
    const updates = [];
    createWorker.mockImplementation(async (_lang, _oem, { logger }) => {
      logger({ status: "loading language traineddata", progress: 1 });
      return {
        recognize: async () => { logger({ status: "recognizing text", progress: 0.5 }); logger({ status: "recognizing text", progress: 1 }); return { data: { text: "x" } }; },
        terminate,
      };
    });
    await extractImagePage(image(), { onProgress: (update) => updates.push(update) });
    const percents = updates.map((update) => update.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
    expect(updates.at(-1)).toMatchObject({ percent: 100, label: expect.stringMatching(/reading text/i) });
  });

  test("cancellation stops a running recognition and terminates the worker", async () => {
    const controller = new AbortController();
    createWorker.mockResolvedValue({ recognize: () => new Promise(() => {}), terminate });
    const running = extractImagePage(image(), { signal: controller.signal });
    await vi.waitFor(() => expect(createWorker).toHaveBeenCalled());
    controller.abort();
    await expect(running).rejects.toThrow(/cancel/i);
    expect(terminate).toHaveBeenCalled();
  });
});
