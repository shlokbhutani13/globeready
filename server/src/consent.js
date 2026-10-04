// Consent for processing a student's documents, and for sending excerpts to the optional AI provider.
// Consent is recorded per student, against the wording version the student saw. A change to the wording
// requires a new version, so earlier consent does not cover it.
export const consentVersion = "2026-10-04";

export const consentText = Object.freeze({
  documents: "GlobeReady reads the documents you upload, extracts their text, and searches it to answer your questions. "
    + "Reading happens on GlobeReady's server, and the extracted text is kept until you delete the document or your account. "
    + "Upload only what you are allowed to share, and only what you need.",
  aiGeneration: "Optional. When GlobeReady's AI answer service is enabled, the question, up to six short passages from your "
    + "selected documents, and these profile fields (visa type, journey stage, degree level, program, university) are sent to "
    + "Google to write an answer. Without this choice, GlobeReady shows the matching passages without generated text.",
  withdraw: "You can change either choice at any time. Turning off document reading stops new reading. Your documents stay until you delete them.",
});

export function consentFrom(profile) {
  const recorded = profile?.consent;
  const current = recorded?.version === consentVersion;
  const documents = current && recorded.documents === true;
  return {
    version: consentVersion,
    current,
    documents,
    aiGeneration: documents && recorded.aiGeneration === true,
    acceptedAt: typeof recorded?.acceptedAt === "string" ? recorded.acceptedAt : null,
    text: consentText,
  };
}

// Returns the record to store, or null when the input is not a valid consent choice.
export function consentRecord(input, now) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  if (Object.keys(input).some((key) => !["documents", "aiGeneration", "version"].includes(key))) return null;
  if (input.version !== consentVersion) return null;
  if (typeof input.documents !== "boolean") return null;
  if (input.aiGeneration !== undefined && typeof input.aiGeneration !== "boolean") return null;
  const documents = input.documents;
  const aiGeneration = documents && input.aiGeneration === true;
  const stamp = now.toISOString();
  return { version: consentVersion, documents, aiGeneration, acceptedAt: stamp, updatedAt: stamp };
}

export const consentRequiredMessage = "Turn on document reading in Privacy settings before a document is read.";
