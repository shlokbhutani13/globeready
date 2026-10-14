import { rankLocalChunks } from "./local-documents/retrieval";

const noMatch = {
  answer: "No matching passage found.",
  evidence: "insufficient",
  confidence: "none",
  noMatch: true,
  notice: "GlobeReady could not find a matching passage in your processed documents.",
  documentCitations: [],
  sources: [],
};

export function answerFromLocalChunks({ question, chunks, documentId = "" }) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) throw new Error("Enter a question about your documents.");
  if (normalizedQuestion.length > 500) throw new Error("Questions must be 500 characters or fewer.");

  const [result] = rankLocalChunks(normalizedQuestion, chunks, { documentId, limit: 1 });
  if (!result) return { ...noMatch };

  const excerpt = String(result.chunk?.text || "").slice(0, 4_000).trim();
  if (!excerpt) return { ...noMatch };
  return {
    answer: excerpt,
    evidence: "document",
    confidence: result.coverage >= 0.6 ? "high" : "medium",
    noMatch: false,
    notice: "Verbatim passage found on this device. Review the cited document before acting.",
    documentCitations: [{
      documentId: String(result.chunk.documentId || ""),
      documentName: String(result.chunk.documentName || "Document").slice(0, 200),
      page: Number.isInteger(result.chunk.page) ? result.chunk.page : undefined,
      excerpt,
    }],
    sources: [],
  };
}
