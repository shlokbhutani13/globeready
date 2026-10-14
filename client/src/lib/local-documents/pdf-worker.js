import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { throwIfCancelled, untilCancelled } from "./cancellation";

export async function extractPdfPages(file, { signal, onProgress } = {}) {
  throwIfCancelled(signal);
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // Font and eval features are not needed to read text and stay off under the site's Content Security Policy.
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true });
  const stop = () => task.destroy();
  signal?.addEventListener("abort", stop, { once: true });
  try {
    const pdf = await untilCancelled(task.promise, signal);
    if (pdf.numPages > 100) throw new Error("Documents may contain at most 100 pages.");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      throwIfCancelled(signal);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push({ page: pageNumber, text: content.items.map((item) => item.str || "").join(" ") });
      onProgress?.({ percent: Math.round((pageNumber / pdf.numPages) * 95), label: `Reading page ${pageNumber} of ${pdf.numPages}` });
    }
    return pages;
  } finally {
    signal?.removeEventListener("abort", stop);
    await task.destroy().catch(() => {});
  }
}
