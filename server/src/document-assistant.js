import { citationFor, rankChunksLexically } from "./rag.js";

export const insufficientEvidenceNotice = "GlobeReady could not find this in your uploaded documents or approved sources. Check the document itself, and confirm with your university international student office or the official source before acting.";
export const unavailableNotice = "GlobeReady could not generate a document-grounded answer right now. Try again later, or confirm with your university international student office.";

function withoutDocumentAnswer(result, evidence, notice) {
  return { ...result, evidence, notice, documentCitations: [] };
}

export function createDocumentAssistant({
  fallback,
  store,
  generateAnswer,
  minimumScore = 0.5,
  limit = 6,
  answerUnavailableLabel = "",
}) {
  if (!store?.ragChunks) throw new Error("The document index store is not configured.");

  return {
    async answer({ uid, question, profile, documentId }) {
      let candidates;
      try {
        candidates = await store.ragChunks.list(uid, documentId ? { documentId } : {});
      } catch {
        return withoutDocumentAnswer(await fallback.answer({ question, profile }), "unavailable", unavailableNotice);
      }

      const chunks = rankChunksLexically(question, candidates, { limit, minimumScore });
      if (!chunks.length) {
        return withoutDocumentAnswer(
          await fallback.answer({ question, profile }),
          "insufficient",
          insufficientEvidenceNotice,
        );
      }

      try {
        const result = await generateAnswer({ question, profile, chunks });
        return {
          ...result,
          mode: "live",
          evidence: "grounded",
          documentCitations: chunks.map(citationFor),
        };
      } catch (error) {
        if (error?.code === "answer_generation_not_configured") {
          const notice = `AI answer generation is not configured${answerUnavailableLabel}. The passages below are the closest matches from your documents.`;
          return {
            mode: "retrieved",
            answer: "Relevant passages from your documents are shown below.",
            evidence: "retrieved",
            notice,
            documentCitations: chunks.map(citationFor),
            sources: [],
          };
        }
        return withoutDocumentAnswer(
          await fallback.answer({ question, profile }),
          "unavailable",
          unavailableNotice,
        );
      }
    },
  };
}
