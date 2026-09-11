import { citationFor, rankChunks } from "./rag.js";

function withEmptyDocumentCitations(result) {
  return { ...result, documentCitations: [] };
}

export function createDocumentAssistant({
  fallback,
  store,
  embed,
  generateAnswer,
  minimumScore = 0.25,
}) {
  if (!store?.ragChunks) throw new Error("The document index store is not configured.");

  return {
    async answer({ uid, question, profile, documentId }) {
      try {
        const queryEmbedding = await embed(question, "RETRIEVAL_QUERY");
        const candidates = await store.ragChunks.list(
          uid,
          documentId ? { documentId } : {},
        );
        const chunks = rankChunks(queryEmbedding, candidates)
          .filter((chunk) => chunk.score >= minimumScore);
        if (!chunks.length) {
          return withEmptyDocumentCitations(await fallback.answer({ question, profile }));
        }

        const result = await generateAnswer({ question, profile, chunks });
        return {
          ...result,
          mode: "live",
          documentCitations: chunks.map(citationFor),
        };
      } catch {
        return withEmptyDocumentCitations(await fallback.answer({ question, profile }));
      }
    },
  };
}
