import { PDFParse } from "pdf-parse";

import { chunkText } from "./rag.js";

function assertPrivateStoragePath(uid, storagePath) {
  const ownedPrefix = `users/${uid}/documents/`;
  if (!storagePath || !storagePath.startsWith(ownedPrefix)) {
    throw new Error("Document must be stored in the authenticated user's private document folder.");
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export async function extractPdfText({ document, bucket }) {
  if (document.contentType !== "application/pdf") {
    throw new Error("Only PDF documents can be indexed for document chat.");
  }
  if (!bucket) throw new Error("Private document storage is not configured.");

  const [bytes] = await bucket.file(document.storagePath).download();
  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.pages.map((page) => ({ page: page.num, text: page.text }));
  } finally {
    await parser.destroy();
  }
}

export function createDocumentIndexer({
  store,
  bucket,
  embed,
  extractText = extractPdfText,
  maxChunks = 200,
  maxConcurrentEmbeddings = 4,
}) {
  if (!store?.ragChunks) throw new Error("The document index store is not configured.");
  if (typeof embed !== "function") throw new Error("An embedding function is required.");
  if (!Number.isInteger(maxConcurrentEmbeddings) || maxConcurrentEmbeddings < 1) {
    throw new Error("Embedding concurrency must be a positive integer.");
  }

  return {
    async index({ uid, document }) {
      assertPrivateStoragePath(uid, document.storagePath);
      try {
        const extracted = await extractText({ document, bucket });
        const pages = Array.isArray(extracted)
          ? extracted
          : [{ page: null, text: extracted }];
        const chunks = pages
          .flatMap(({ page, text }) => chunkText(text).map((chunk) => ({ ...chunk, page })))
          .map((chunk, index) => ({ ...chunk, index }));
        if (!chunks.length) throw new Error("No readable text was found in this document.");
        if (chunks.length > maxChunks) {
          throw new Error(`This PDF contains too much readable text to index safely (${chunks.length} sections).`);
        }

        const indexedChunks = await mapWithConcurrency(
          chunks,
          maxConcurrentEmbeddings,
          async (chunk) => ({
            ...chunk,
            documentName: document.name,
            embedding: await embed(chunk.text, "RETRIEVAL_DOCUMENT"),
          }),
        );
        await store.ragChunks.replace(uid, document.id, indexedChunks);
        return { chunkCount: indexedChunks.length };
      } catch (error) {
        await store.ragChunks.removeForDocument(uid, document.id);
        throw error;
      }
    },
  };
}
