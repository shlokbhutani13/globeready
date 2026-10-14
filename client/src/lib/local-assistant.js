import { excerptFor, rankLocalChunks } from "./local-documents/retrieval";
import { referralFor } from "./referrals";

const passageNotice = "Exact quotes from your documents that match your question. They are not an answer or legal advice; read the cited page before acting.";
const noMatchNotice = "No passage in your documents matched enough of your question. Try the words your document uses (for example, \"program end date\"), or choose one document.";

export function answerFromLocalChunks({ question, chunks, documentId = "" }) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) throw new Error("Enter a question about your documents.");
  if (normalizedQuestion.length > 500) throw new Error("Questions must be 500 characters or fewer.");

  const referral = referralFor(normalizedQuestion);
  const passages = rankLocalChunks(normalizedQuestion, chunks, { documentId, limit: 3 })
    .map(({ chunk, matched }) => ({
      documentId: String(chunk.documentId || ""),
      documentName: String(chunk.documentName || "Document").slice(0, 200),
      page: Number.isInteger(chunk.page) ? chunk.page : undefined,
      excerpt: excerptFor(chunk.text, matched),
    }))
    .filter((passage) => passage.excerpt);

  return {
    kind: "passages",
    noMatch: passages.length === 0,
    evidence: passages.length ? "document" : "insufficient",
    answer: "",
    notice: passages.length ? passageNotice : noMatchNotice,
    passages,
    documentCitations: passages,
    referral,
    sources: [],
  };
}
