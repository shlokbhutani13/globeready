# Architecture

GlobeReady is a responsive React client backed by an Express API and Firebase. The launch scope is verified updates, a personal plan with reminders, grounded document questions, and account controls.

## Client

- React 18 with React Router and Vite 8.
- Firebase Authentication provides the session. Google sign-in is used for re-authentication before account deletion.
- Firestore listeners keep the profile, tasks, documents, saved items, preferences, and notifications current for the signed-in student.
- Updates use the API feed (`GET /api/news`), refreshed periodically. The feed shows a delayed-check banner when a verified source has failed.
- Pages receive data and callbacks as props from `App.jsx`, which keeps them testable.
- Shared components: `NewsCard`, `SourceStatus`, `MetricCard`, `Disclaimer`.

## API

- Express 5 app factory (`server/src/app.js`) with injectable store, authentication, assistant, and account dependencies.
- Every protected route receives a student identity from a verified Firebase ID token (`auth.js`). Demo mode uses an explicit demo header only when Firebase Admin is not configured.
- Authorization is derived from the verified UID. Request bodies cannot name another student.
- Admin routes require an administrator claim or an `ADMIN_UIDS` entry.
- The internal sync route requires a bearer secret and is refused for live fetches unless enabled.

## Data

- Firestore stores every student record under `users/{uid}`. The demo store implements the same interface in memory for tests and demo mode.
- Public update records (`newsItems`) are written through an explicit allowlist (`publicNewsDocument`) and are readable without private review data.
- Private review state (`newsItemState`), reviews, audits, sources, and runs are server-only.
- Documents live in Cloud Storage under `users/{uid}/documents/`.

## Updates pipeline

1. A scheduler calls `POST /api/internal/news/sync` for enabled, verified sources.
2. Adapters (Federal Register, feed, index page, university sitemap) fetch and normalize candidates through a pinned, host-restricted fetcher.
3. Source snapshots are committed privately. Items are published as source-only cards.
4. Generated explanations stay private until an administrator approves them against the current revision and committed snapshot.
5. The feed ranks items for each student without hiding any. Source health and coverage are reported in the response.

## Document pipeline

1. The student uploads a PDF, PNG, or JPEG to their Storage folder. Storage rules enforce type and size.
2. The API re-checks the stored object (type, size, private path) before reading it.
3. PDFs are parsed locally, with page references. Images are read by local OCR. Both go through one extraction function (`document-extraction.js`) that enforces size, page, and pixel limits.
4. Text is split into bounded chunks with page references and stored under the owner's `ragChunks`. A failure keeps the upload and records a safe, retryable reason.
5. A question is scored by deterministic term matching against the student's chunks for the selected document. The top chunks become citations; no chunk means "insufficient evidence".
6. Retrieved text is fenced as untrusted data in the Gemini prompt. Generated answers keep only the expected fields, and definitive legal or status conclusions are replaced by a referral to a DSO or professional.

## Conversations

Each assistant exchange is stored under `users/{uid}/conversations/{id}/messages` with its citations, evidence state, and any referral. Conversation IDs are validated and checked against the caller's own conversations.

## Deletion

`DELETE /api/account` deletes Storage objects, the Firestore tree, the student's UID on their review submissions, and the Auth identity, in that order. See `docs/PRIVACY.md`.

## Components intentionally kept but inert

- `ragChunks.embedding` vector indexes in `firestore.indexes.json`, the optional embedding hook in the indexer, and `GEMINI_EMBEDDINGS_ENABLED`. Nothing writes or queries embeddings by default.
- `pushEnabled` in the news preferences route. It is accepted and stored, but nothing reads it and the interface does not offer it.

These are kept because existing tests assert them. Remove them together with those tests in a follow-up.

## Deployment

The client and API deploy separately. `firebase.json` configures rules, indexes, Storage, and Hosting; `client/vercel.json` provides SPA routing for Vercel; the root `Dockerfile` packages the API on Node 22.
