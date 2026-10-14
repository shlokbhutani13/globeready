import { throwIfCancelled, untilCancelled } from "./cancellation";

/* global __GLOBEREADY_OCR_BASE__ */
// Content-addressed folder published by vite-plugins/ocr-assets.js. No OCR file is fetched from a third party.
export const ocrAssetBase = __GLOBEREADY_OCR_BASE__;

// Tesseract reports several setup phases and then recognition. Setup is shown as the first 30%.
const phases = [
  ["loading tesseract core", 0, 10],
  ["initializing tesseract", 10, 15],
  ["loading language traineddata", 15, 27],
  ["initializing api", 27, 30],
  ["recognizing text", 30, 100],
];

function progressFor(message, last) {
  const phase = phases.find(([status]) => status === message?.status);
  if (!phase) return null;
  const [status, from, to] = phase;
  const fraction = Math.min(1, Math.max(0, Number(message.progress) || 0));
  const percent = Math.max(last, Math.round(from + (to - from) * fraction));
  return { percent, label: status === "recognizing text" ? "Reading text on this device" : "Preparing text recognition on this device" };
}

export async function extractImagePage(file, { signal, onProgress } = {}) {
  throwIfCancelled(signal);
  const { createWorker } = await import("tesseract.js");
  let last = 0;
  const logger = (message) => {
    const update = progressFor(message, last);
    if (!update) return;
    last = update.percent;
    onProgress?.(update);
  };
  const starting = createWorker("eng", 1, {
    workerPath: `${ocrAssetBase}/worker.min.js`,
    corePath: ocrAssetBase,
    langPath: ocrAssetBase,
    workerBlobURL: false,
    logger,
  });
  let worker;
  try {
    worker = await untilCancelled(starting, signal);
    const result = await untilCancelled(worker.recognize(file), signal);
    return [{ page: 1, text: result?.data?.text || "" }];
  } finally {
    // A cancelled start still creates a worker; stop it as soon as it exists.
    if (worker) await worker.terminate().catch(() => {});
    else starting.then((late) => late?.terminate()).catch(() => {});
  }
}
