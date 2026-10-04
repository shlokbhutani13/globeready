function finiteVector(vector) {
  return Array.isArray(vector) && vector.length > 0 && vector.every(Number.isFinite);
}

export function chunkText(value, { chunkSize = 900, overlap = 150 } = {}) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  if (!Number.isInteger(chunkSize) || !Number.isInteger(overlap) || chunkSize < 1 || overlap < 0 || overlap >= chunkSize) {
    throw new Error("Chunk size must be greater than overlap.");
  }
  const step = chunkSize - overlap;
  const chunks = [];
  for (let offset = 0, index = 0; offset < text.length; offset += step, index += 1) {
    chunks.push({ index, offset, text: text.slice(offset, offset + chunkSize) });
    if (offset + chunkSize >= text.length) break;
  }
  return chunks;
}

export function cosineSimilarity(left, right) {
  if (!finiteVector(left) || !finiteVector(right) || left.length !== right.length) return null;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return null;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankChunks(queryEmbedding, chunks, limit = 6) {
  return chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryEmbedding, chunk.embedding) }))
    .filter((chunk) => Number.isFinite(chunk.score))
    .sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)))
    .slice(0, limit);
}

export function citationFor(chunk) {
  return {
    documentName: chunk.documentName || "Untitled document",
    ...(Number.isFinite(chunk.page) ? { page: chunk.page } : {}),
    excerpt: String(chunk.text || "").slice(0, 240),
  };
}

const fillerWords = new Set([
  "a", "about", "am", "an", "and", "are", "at", "be", "by", "can", "do", "does", "for", "from", "how",
  "i", "if", "in", "is", "it", "me", "my", "of", "on", "or", "should", "the", "their", "this", "that",
  "to", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

function normalizeTerm(term) {
  return term.length > 4 && term.endsWith("s") ? term.slice(0, -1) : term;
}

export function meaningfulTerms(value) {
  const terms = String(value || "").toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(terms.filter((term) => term.length > 1 && !fillerWords.has(term)).map(normalizeTerm))];
}

export function lexicalScore(question, text) {
  const query = meaningfulTerms(question);
  if (!query.length) return 0;
  const haystack = new Set(meaningfulTerms(text));
  return query.filter((term) => haystack.has(term)).length / query.length;
}

export function rankChunksLexically(question, chunks, { limit = 6, minimumScore = 0.5 } = {}) {
  return chunks
    .map((chunk) => ({ ...chunk, score: lexicalScore(question, chunk.text) }))
    .filter((chunk) => chunk.score > 0 && chunk.score >= minimumScore)
    .sort((left, right) => right.score - left.score
      || (left.index ?? 0) - (right.index ?? 0)
      || String(left.id).localeCompare(String(right.id)))
    .slice(0, limit);
}
