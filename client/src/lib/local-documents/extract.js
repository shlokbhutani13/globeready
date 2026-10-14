import { chunkDocumentPages } from "./chunks";
import { validateLocalFile } from "./file-policy";
import { extractImagePage } from "./image-worker";
import { extractPdfPages } from "./pdf-worker";

function cancelled(signal) {
  if (signal?.aborted) throw new DOMException("Document processing was cancelled.", "AbortError");
}

export async function extractLocalDocument(file, {
  id,
  signal,
  pdfExtractor = extractPdfPages,
  imageExtractor = extractImagePage,
  persist,
} = {}) {
  const metadata = await validateLocalFile(file);
  cancelled(signal);
  const pages = metadata.contentType === "application/pdf"
    ? await pdfExtractor(file, { signal })
    : await imageExtractor(file, { signal });
  cancelled(signal);
  if (pages.length > 100) throw new Error("Documents may contain at most 100 pages.");
  const chunks = chunkDocumentPages(pages);
  if (!chunks.length) throw new Error("No readable text was found. Scanned PDFs and handwriting are not supported.");
  const result = { id, metadata, chunks };
  if (persist) await persist(result);
  return result;
}
