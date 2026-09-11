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
