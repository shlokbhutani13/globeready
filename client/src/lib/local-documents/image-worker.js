export async function extractImagePage(file, { signal } = {}) {
  if (signal?.aborted) throw new DOMException("Document processing was cancelled.", "AbortError");
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    if (signal?.aborted) throw new DOMException("Document processing was cancelled.", "AbortError");
    const result = await worker.recognize(file);
    return [{ page: 1, text: result.data.text || "" }];
  } finally {
    await worker.terminate();
  }
}
