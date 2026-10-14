const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "does", "for", "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "who", "why", "with",
]);

function terms(value) {
  return [...new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((term) => term.length > 1 && !stopWords.has(term));
}

export function rankLocalChunks(question, chunks, { documentId = "", limit = 3 } = {}) {
  const questionTerms = terms(question);
  if (questionTerms.length === 0) return [];
  return (Array.isArray(chunks) ? chunks : [])
    .filter((chunk) => !documentId || chunk?.documentId === documentId)
    .slice(0, 100)
    .map((chunk, index) => {
      const textTerms = new Set(terms(String(chunk?.text || "").slice(0, 4_000)));
      const matches = questionTerms.filter((term) => textTerms.has(term));
      return { chunk, index, matches: matches.length, coverage: matches.length / questionTerms.length };
    })
    .filter((candidate) => candidate.matches > 0)
    .sort((left, right) => right.coverage - left.coverage || right.matches - left.matches || left.index - right.index)
    .slice(0, Math.max(1, Math.min(limit, 3)));
}
