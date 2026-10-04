import { DocumentExtractionError, extractDocument, maxDocumentBytes, allowedExtractionTypes } from "./document-extraction.js";
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

export async function extractStoredDocument({ uid, document, bucket, ocr = null, parsePdf }) {
  if (!bucket) throw new Error("Private document storage is not configured.");
  assertPrivateStoragePath(uid, document.storagePath);

  const file = bucket.file(document.storagePath);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata?.size);
  if (!allowedExtractionTypes.has(metadata?.contentType)) {
    throw new DocumentExtractionError("unsupported_document_type", "Upload a PDF, PNG, or JPEG file.");
  }
  if (!Number.isFinite(size) || size <= 0 || size > maxDocumentBytes) {
    throw new DocumentExtractionError("document_too_large", "Files must be 10 MB or smaller.");
  }

  const [bytes] = await file.download();
  return extractDocument({ bytes: new Uint8Array(bytes), mimeType: metadata.contentType, ocr, parsePdf });
}

export function createDocumentIndexer({
  store,
  bucket,
  embed = null,
  ocr = null,
  extractText = ({ uid, document }) => extractStoredDocument({ uid, document, bucket, ocr }),
  maxChunks = 200,
  maxConcurrentEmbeddings = 4,
}) {
  if (!store?.ragChunks) throw new Error("The document index store is not configured.");
  if (embed !== null && typeof embed !== "function") throw new Error("An embedding function must be a function when provided.");
  if (!Number.isInteger(maxConcurrentEmbeddings) || maxConcurrentEmbeddings < 1) {
    throw new Error("Embedding concurrency must be a positive integer.");
  }

  return {
    async index({ uid, document }) {
      assertPrivateStoragePath(uid, document.storagePath);
      try {
        const extracted = await extractText({ uid, document, bucket });
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
            ...(embed ? { embedding: await embed(chunk.text, "RETRIEVAL_DOCUMENT") } : {}),
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
