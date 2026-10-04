import { createRequire } from "node:module";
import { createWorker } from "tesseract.js";
import { DocumentExtractionError } from "./extraction-errors.js";
import { assertReasonableImage } from "./image-limits.js";

const require = createRequire(import.meta.url);
const languageDirectory = require.resolve("@tesseract.js-data/eng/package.json").replace(/package\.json$/u, "4.0.0_best_int");
const recognitionTimeoutMs = 45_000;

export function createLocalOcr({ timeoutMs = recognitionTimeoutMs, workerFactory = createWorker } = {}) {
  let worker = null;
  let queue = Promise.resolve();

  const start = async () => {
    if (!worker) {
      worker = await workerFactory("eng", 1, { langPath: languageDirectory, cacheMethod: "none", gzip: true });
    }
    return worker;
  };

  const recognize = async (bytes) => {
    const active = await start();
    const { data } = await active.recognize(Buffer.from(bytes));
    return data.text;
  };

  const reset = async () => {
    const stale = worker;
    worker = null;
    if (stale) await stale.terminate().catch(() => {});
  };

  const ocr = async function ocr({ bytes, mimeType }) {
    assertReasonableImage(bytes, mimeType);
    const job = queue.then(() => Promise.race([
      recognize(bytes),
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new DocumentExtractionError(
          "ocr_timeout",
          "Reading this image took too long. Your upload is saved; try again.",
          { retryable: true, status: 503 },
        )), timeoutMs).unref();
      }),
    ]));
    queue = job.catch(() => {});
    try {
      return await job;
    } catch (error) {
      await reset();
      throw error instanceof DocumentExtractionError ? error : new DocumentExtractionError(
        "ocr_failed",
        "This image could not be read. Your upload is saved; try again.",
        { retryable: true, status: 503 },
      );
    }
  };
  // Releases the recognition worker during graceful shutdown.
  ocr.shutdown = reset;
  return ocr;
}
