// Deterministic passage retrieval for the browser-only beta. It never generates text: it ranks stored passages by how
// much of the question they contain and returns them verbatim.

const stopWords = new Set([
  "a", "about", "after", "all", "also", "am", "an", "and", "any", "are", "as", "at", "be", "been", "before", "being", "by",
  "can", "could", "did", "do", "does", "doing", "during", "each", "for", "from", "get", "got", "had", "has", "have", "how",
  "i", "if", "im", "in", "into", "is", "it", "its", "just", "know", "may", "me", "might", "my", "of", "on", "or", "our",
  "please", "should", "so", "tell", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "to", "us", "want", "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you",
  "your",
]);

const suffixes = ["ations", "ation", "ments", "ment", "ings", "ing", "ies", "ied", "es", "ed", "s"];

// A light suffix stemmer so "expires", "expire", and "expiration" meet. It is applied identically to questions and
// passages, so its stems never need to be real words.
export function stem(term) {
  if (/^\p{N}+$/u.test(term)) return term;
  let value = term;
  for (const suffix of suffixes) {
    if (value.length - suffix.length >= 3 && value.endsWith(suffix)) {
      value = suffix === "ies" || suffix === "ied" ? `${value.slice(0, -3)}y` : value.slice(0, -suffix.length);
      break;
    }
  }
  if (value.length > 4 && value.endsWith("e")) value = value.slice(0, -1);
  return value;
}

function words(value) {
  return (String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

export function questionStems(question) {
  return [...new Set(words(question).filter((term) => term.length > 1 && !stopWords.has(term)).map(stem))];
}

// Short questions must match every meaningful word; longer ones must match at least half (and never fewer than two),
// so a passage sharing one incidental word is not shown.
export function minimumMatches(termCount) {
  return termCount <= 2 ? termCount : Math.max(2, Math.ceil(termCount * 0.5));
}

export function rankLocalChunks(question, chunks, { documentId = "", limit = 3 } = {}) {
  const terms = questionStems(question);
  if (terms.length === 0) return [];
  const required = minimumMatches(terms.length);
  const candidates = (Array.isArray(chunks) ? chunks : [])
    .filter((chunk) => !documentId || chunk?.documentId === documentId)
    .map((chunk, index) => {
      const stems = new Set(words(chunk?.text).map(stem));
      const matched = terms.filter((term) => stems.has(term));
      return { chunk, index, matched, matches: matched.length, coverage: matched.length / terms.length };
    })
    .filter((candidate) => candidate.matches >= required)
    .sort((left, right) => right.coverage - left.coverage || right.matches - left.matches || left.index - right.index);

  // Fairness across documents: the best passage from each document comes before a second passage from any document.
  const firstPerDocument = [];
  const rest = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = candidate.chunk?.documentId || "";
    if (seen.has(key)) rest.push(candidate);
    else { seen.add(key); firstPerDocument.push(candidate); }
  }
  return [...firstPerDocument, ...rest].slice(0, Math.max(1, Math.min(limit, 3)));
}

// A readable verbatim window around the first matched word. The excerpt is always an exact substring of the passage.
export function excerptFor(text, matched, maxLength = 700) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  const wanted = new Set(matched);
  const pattern = /[\p{L}\p{N}]+/gu;
  let first = 0;
  for (let found = pattern.exec(value); found; found = pattern.exec(value)) {
    if (wanted.has(stem(found[0].toLocaleLowerCase()))) { first = found.index; break; }
  }
  let start = Math.max(0, first - 200);
  if (start > 0) {
    const space = value.indexOf(" ", start);
    start = space >= 0 && space < first ? space + 1 : start;
  }
  let end = Math.min(value.length, start + maxLength);
  if (end < value.length) {
    const space = value.lastIndexOf(" ", end);
    end = space > first ? space : end;
  }
  return value.slice(start, end).trim();
}
