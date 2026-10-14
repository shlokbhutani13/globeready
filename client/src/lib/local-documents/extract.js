import { indexDocumentPages } from "./chunks";
import { throwIfCancelled } from "./cancellation";
import { validateLocalFile } from "./file-policy";
import { extractImagePage } from "./image-worker";
import { extractPdfPages } from "./pdf-worker";

function friendlyParserError(error) {
  if (error?.name === "AbortError") return error;
  if (error?.name === "PasswordException") return new Error("This PDF is password-protected. Save an unprotected copy and try again.");
  if (error?.name === "InvalidPDFException") return new Error("This PDF could not be read. It may be damaged; try saving it again.");
  return error;
}

// Validates, extracts, and indexes a file entirely in the browser. persist() is called only after every page was read
// and the complete index fits the storage budget; any failure or cancellation writes nothing.
export async function extractLocalDocument(file, {
  id,
  signal,
  onProgress,
  pdfExtractor = extractPdfPages,
  imageExtractor = extractImagePage,
  persist,
} = {}) {
  // Reading takes 2-95% of the bar and saving the rest; the reported percentage never moves backwards.
  let last = 0;
  const report = (percent, label) => {
    last = Math.max(last, Math.min(100, Math.round(percent)));
    onProgress?.({ percent: last, label });
  };
  const readingProgress = (update) => report(2 + (Number(update?.percent) || 0) * 0.93, update?.label || "Reading");
  report(1, "Checking the file");
  const metadata = await validateLocalFile(file);
  throwIfCancelled(signal);
  let pages;
  try {
    pages = metadata.contentType === "application/pdf"
      ? await pdfExtractor(file, { signal, onProgress: readingProgress })
      : await imageExtractor(file, { signal, onProgress: readingProgress });
  } catch (error) {
    throw friendlyParserError(error);
  }
  throwIfCancelled(signal);
  const index = indexDocumentPages(pages);
  const result = { id, metadata: { name: metadata.name, contentType: metadata.contentType, size: metadata.size }, ...index };
  report(97, "Saving extracted text");
  if (persist) await persist(result);
  report(100, "Ready for Ask");
  return result;
}
