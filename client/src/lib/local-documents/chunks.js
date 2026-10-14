const maxChunkLength = 4_000;
const maxChunks = 100;

export function chunkDocumentPages(pages) {
  if (!Array.isArray(pages) || pages.length > 100) throw new Error("Documents may contain at most 100 pages.");
  const chunks = [];
  for (const page of pages) {
    const text = String(page?.text || "").replace(/\s+/gu, " ").trim();
    for (let start = 0; start < text.length && chunks.length < maxChunks; start += maxChunkLength) {
      const piece = text.slice(start, start + maxChunkLength).trim();
      if (piece) chunks.push({ page: Number.isInteger(page.page) ? page.page : 1, text: piece });
    }
  }
  return chunks;
}
