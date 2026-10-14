import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

export async function extractPdfPages(file, { signal } = {}) {
  if (signal?.aborted) throw new DOMException("Document processing was cancelled.", "AbortError");
  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  signal?.addEventListener("abort", () => task.destroy(), { once: true });
  const pdf = await task.promise;
  if (pdf.numPages > 100) throw new Error("Documents may contain at most 100 pages.");
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (signal?.aborted) throw new DOMException("Document processing was cancelled.", "AbortError");
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push({ page: pageNumber, text: content.items.map((item) => item.str || "").join(" ") });
  }
  await pdf.destroy();
  return pages;
}
