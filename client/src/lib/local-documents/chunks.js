// Turns extracted pages into the passages stored with a browser-local document. Nothing is ever dropped: if the text
// does not fit the free beta's storage budget, the whole document is refused with an explanation.

export const localIndexLimits = Object.freeze({
  maxPages: 100,
  maxChunkLength: 1_500,
  maxChunks: 400,
  // Firestore documents are limited to 1 MiB. Passage text gets 800 KB (UTF-8), leaving room for metadata.
  maxTextBytes: 800_000,
});

const encoder = new TextEncoder();

// Mask high-risk immigration identifiers only when their format is distinctive or a nearby label identifies them.
// Broad number stripping would also destroy dates, fees and other passages students need to find. This is a safety
// net, not a guarantee: the consent copy tells students that uncommon formats or OCR errors can evade it.
export function redactSensitiveIdentifiers(value) {
  let text = String(value || "");
  const labelled = [
    /(\bsevis(?:\s+(?:id|number))?\s*[:#-]?\s*)N?\d{10}\b/giu,
    /(\b(?:uscis\s+)?receipt(?:\s+(?:id|number))?\s*[:#-]?\s*)(?:EAC|WAC|LIN|SRC|NBC|MSC|IOE|YSC)\d{10}\b/giu,
    /(\bpassport(?:\s+(?:no\.?|number))?\s*[:#-]?\s*)(?=[A-Z0-9]{6,12}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{6,12}\b/giu,
    /(\bvisa(?:\s+(?:foil\s+)?(?:no\.?|number))\s*[:#-]?\s*)(?=[A-Z0-9]{7,9}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{7,9}\b/giu,
  ];
  for (const pattern of labelled) text = text.replace(pattern, "$1[REDACTED]");
  return text;
}

function splitPage(text, maxLength) {
  const pieces = [];
  let rest = text;
  while (rest.length > maxLength) {
    // Break at the last space inside the window; text without spaces (for example CJK) breaks at the limit.
    let cut = rest.lastIndexOf(" ", maxLength);
    if (cut <= 0) cut = maxLength;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces.filter(Boolean);
}

function tooLarge(pageCount, characters) {
  return new Error(
    `This document has more text than the free beta can store (${pageCount} page${pageCount === 1 ? "" : "s"}, `
    + `about ${characters.toLocaleString("en-US")} characters). Nothing was saved. Split it into smaller files `
    + "(for example, the pages you need) and add each one.",
  );
}

export function indexDocumentPages(pages) {
  const { maxPages, maxChunkLength, maxChunks, maxTextBytes } = localIndexLimits;
  if (!Array.isArray(pages) || pages.length > maxPages) throw new Error(`Documents may contain at most ${maxPages} pages.`);
  const chunks = [];
  let pagesWithText = 0;
  let characters = 0;
  let bytes = 0;
  for (const [position, page] of pages.entries()) {
    const text = redactSensitiveIdentifiers(page?.text).replace(/\s+/gu, " ").trim();
    if (!text) continue;
    pagesWithText += 1;
    characters += text.length;
    bytes += encoder.encode(text).byteLength;
    const number = Number.isInteger(page.page) && page.page > 0 ? page.page : position + 1;
    for (const piece of splitPage(text, maxChunkLength)) chunks.push({ page: number, text: piece });
  }
  if (!chunks.length) throw new Error("No readable text was found. Scanned PDFs and handwriting are not supported.");
  if (chunks.length > maxChunks || bytes > maxTextBytes) throw tooLarge(pages.length, characters);
  return { chunks, pageCount: pages.length, pagesWithText };
}
