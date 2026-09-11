# GlobeReady document RAG design

## Goal

Make GlobeReady's document explanation feature a real retrieval-augmented
generation system for an authenticated student's own uploaded documents.
The system must not use one student's content to answer another student's
question. It must return the passages used for an answer and retain the
existing information-only safety boundaries.

## Scope

The release adds document text extraction, chunking, embeddings, retrieval,
contextual Gemini responses, citations, Firebase-backed persistence, Docker
and CI coverage. It preserves the current React client, Firebase
Authentication, Firestore rules, file type checks, and 10 MB file limit.

The deployed free edition continues to support authentication, profiles,
tasks, deadlines, and saved resources. Real document uploads and live RAG
require a Firebase Storage bucket, which requires a Blaze billing account.
This document does not authorize linking a billing account or provisioning a
bucket.

## Data flow

1. The browser validates an authenticated PDF, PNG, or JPEG file and uploads
   it to `users/{uid}/documents/{documentId}/...` in Firebase Storage.
2. The client creates document metadata under `users/{uid}/documents` in
   Firestore.
3. The authenticated API verifies the Firebase ID token, checks that the
   document's Storage path begins with the caller's private prefix, downloads
   the file, and extracts text from PDFs. Image documents remain available in
   the vault but are not part of the RAG pipeline.
4. The API normalizes text and creates chunks of 900 characters with 150
   characters of overlap. It sends chunks to Gemini's embedding endpoint and
   stores chunk text, embedding, document ID, page number when available, and
   source filename in a private Firestore subcollection.
5. A question is embedded with the same model. The API reads chunks only below
   the caller's `users/{uid}` tree, ranks them with cosine similarity, and
   sends the top six passages to Gemini with an answer-only-from-context
   instruction.
6. The API returns the answer, confidence, disclaimer, and citations that
   identify the document and source excerpt. If retrieval or Gemini fails, it
   returns the existing trusted-resource fallback without inventing a document
   answer.

## Components

### `server/src/rag.js`

Pure helpers for text normalization, deterministic chunking, cosine
similarity, top-k ranking, and citation formatting. These helpers have unit
tests independent of Gemini and Firebase.

### `server/src/document-index.js`

Coordinates text extraction, bounded-concurrency embedding generation, and
Firestore chunk persistence. Re-indexing replaces the old chunks only after
all new embeddings succeed, so repeated analysis never duplicates retrieval
results or leaves a partial index.

### `server/src/gemini.js`

Connects Gemini embeddings and grounded generation to the document indexer and
document assistant. The prompt receives only retrieved chunks for the
authenticated user. When retrieval finds no relevant chunk, the server uses
trusted-resource guidance instead of claiming a document answer.

### API routes

`POST /api/documents/:id/index` indexes an owned document. `POST
/api/assistant` optionally accepts a document-scoped question and uses
retrieval before generation. The legacy analysis endpoint remains for backward
compatibility; the client uses the dedicated indexing endpoint.

### Client

The document view shows indexing state and citations. The assistant identifies
answers grounded in uploaded documents. When Storage is unavailable, the free
edition keeps upload controls disabled and says why.

## Security and failure behavior

- Firebase ID-token verification remains mandatory for non-demo requests.
- Firestore and Storage paths remain rooted at the authenticated UID.
- Raw document text and embeddings never go to the client as a shared index.
- The API enforces the existing file types and 10 MB upload limit.
- Prompts treat document text as untrusted material. The model must not follow
  instructions within a document.
- The API does not claim a document-based answer if no relevant chunk is
  retrieved.
- Failed extraction, embedding, or indexing produces an explicit failed status
  and preserves no partial chunk index.

## Deployment

The client remains on Firebase Hosting. The Express API deploys as a separate
Node.js 22 service with Firebase Admin and Gemini variables stored as host
secrets. The public Firebase Hosting domain becomes the allowed API origin,
and the client build receives that API endpoint.

The deployed RAG path cannot be switched on until the Firebase project is
linked to a billing account and its Storage bucket is provisioned. Gemini can
use a free-tier API key within provider limits, but production safety still
requires rate limiting and a private server-side key.

## Verification

- Unit tests cover chunk boundaries, overlap, ranking order, tie handling, and
  cosine math.
- Integration tests prove chunk queries are scoped to one UID and that an
  indexing failure leaves no partial chunks.
- Route tests cover an owned document, cross-user path rejection, and an
  assistant answer that contains citations from retrieved chunks.
- Client tests cover unavailable storage, indexing status, and citation
  rendering.
- CI runs server and client tests, lint, and production builds.
