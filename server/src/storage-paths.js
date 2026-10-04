// The server's independent copy of the private document path contract. storage.rules enforces the same shape
// for clients; tests/storage-rules-emulator.test.js keeps its own literal copy so the two can drift only visibly.
const uidPattern = /^[A-Za-z0-9:_-]{1,128}$/u;
const documentIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/u;

export function privateDocumentPath(uid, documentId, fileName) {
  return `users/${uid}/documents/${documentId}/${fileName}`;
}

// True only for users/<uid>/documents/<documentId>/<fileName>, with the uid owned by the caller.
// Anything with extra segments, traversal, or unexpected characters is rejected.
export function isOwnedDocumentPath(uid, storagePath) {
  if (typeof uid !== "string" || !uidPattern.test(uid) || typeof storagePath !== "string") return false;
  const prefix = `users/${uid}/documents/`;
  if (!storagePath.startsWith(prefix)) return false;
  const segments = storagePath.slice(prefix.length).split("/");
  if (segments.length !== 2) return false;
  const [documentId, fileName] = segments;
  return documentIdPattern.test(documentId) && fileNamePattern.test(fileName);
}

export const maxStoredFileNameLength = 200;
