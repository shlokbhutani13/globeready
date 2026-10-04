# Architecture

GlobeReady is a responsive React client, an Express API, and Firebase. The launch scope is verified official updates,
a personal plan with reminders, grounded document questions, and account controls. The modes and their differences are
in `docs/MODES.md`; the configuration contract is in `docs/CONFIGURATION.md`.

## Client

- React 18, React Router, and Vite. Firebase Authentication provides the session. Google sign-in is also used to
  re-authenticate before account deletion.
- Firestore listeners keep the profile, tasks, documents, saved items, preferences, and notifications current for the
  signed-in student. Those reads and writes are governed by the rules.
- Updates come from the API feed (`GET /api/news`). The feed shows a delayed-check banner when a verified source has
  failed or stopped checking.
- Pages receive data and callbacks as props from `App.jsx`, which keeps them testable.
- The API origin comes from `VITE_API_URL`. Production builds have no fallback and require https. The emulator wiring is
  a build-time constant, absent from every non-local build.

## API

- An Express 5 app factory (`server/src/app.js`) with injectable stores, authentication, assistant, limiters, and
  account dependencies. `server/src/index.js` composes the production instance.
- HTTP boundary (`server/src/http.js`): request IDs, a structured access log per request, security headers,
  `Cache-Control: no-store`, a CORS allowlist of exact origins, a JSON-only body policy with a 100 KB limit, and
  normalized error responses that never include internal messages or stacks.
- Authentication (`server/src/auth.js`): every protected route verifies the Firebase ID token with revocation checks,
  so disabled and revoked accounts are refused. Demo identity is accepted only in demo mode.
- Authorization is derived from the verified UID. Request bodies cannot name another student. Every store method takes
  the UID and returns only that student's records.
- Admin routes require the `admin` claim or an `ADMIN_UIDS` entry. Successful admin changes are audited.
- The scheduler route requires a bearer secret compared in constant time.
- Process lifecycle (`server/src/lifecycle.js`): bounded graceful shutdown on `SIGTERM` and `SIGINT`, and a single
  policy for unhandled rejections and uncaught exceptions.

## Data

- Firestore stores each student's records under `users/{uid}`. The demo store implements the same interface in
  memory for tests and demo mode.
- Students write Firestore directly in only four ways, and the rules check each shape: create a task, mark a task
  complete or open and delete it, create a saved resource, create a document record for an upload, and set a
  notification's read flag. Every other record is written by the API. The owner can read everything of their own.
- Public update records (`newsItems`) are written through an explicit allowlist and are readable without private review
  data.
- Private review state (`newsItemState`), reviews, audits, sources, runs, leases, and source snapshots
  (`newsSourceSnapshots`) are server-only.
- Documents live in Cloud Storage under `users/{uid}/documents/{documentId}/{fileName}`. The path is validated by
  `server/src/storage-paths.js`, which mirrors `storage.rules`.

## Updates pipeline

1. A scheduler you approve calls `POST /api/internal/news/sync` for enabled, verified sources. The endpoint is
   disabled by default.
2. Adapters (Federal Register, feed, index page, university sitemap) fetch and normalize candidates through a pinned,
   host-restricted fetcher. It resolves DNS once, refuses private and loopback addresses, follows only same-origin
   redirects, caps response size and time, and accepts only declared content types.
3. The sync engine takes a lease per source. Each candidate's normalized text is committed in one Firestore transaction
   that checks the lease, so a lost lease cannot publish. Items are published as source-only cards.
4. Generated explanations stay private until an administrator approves them. Approval checks the current revision and
   content hash, re-reads the committed snapshot, and validates the draft. A stale approval is refused with a conflict.
5. Each run records its outcome. A source whose run fails, or whose last check is older than twice its cadence, is
   reported as **delayed**. Failure is never shown as "no update".

Not yet operational: any scheduled run. No scheduler is provisioned, so synchronization is invoked manually until one is approved.

## Document pipeline

1. The student uploads a PDF, PNG, or JPEG to their Storage folder. Storage rules enforce type and size.
2. The API re-checks the stored object before reading it: the declared type, the metadata size and the actual byte
   length, the owned path (exactly `users/{uid}/documents/{id}/{file}`), and the file's signature bytes.
3. PDFs are parsed locally with page numbers. Images are read by local OCR. Both pass through one extraction function
   that enforces size, page, pixel, and timeout limits. OCR runs one image at a time, with a 45-second limit.
4. Text is split into bounded chunks with page numbers and stored under the owner's `ragChunks`. A failure removes any
   partial chunks, keeps the upload, and records a safe, retryable reason. Deleting a document deletes its stored file
   first, and removes its record only after that succeeds.
5. A question is scored by deterministic term matching against the student's chunks for the selected document. The top
   chunks become citations. No chunk means "insufficient evidence".
6. With Gemini configured, retrieved text is fenced as untrusted data, the call has a timeout, and the answer is
   validated. Definitive legal or status conclusions are replaced by a referral. Citations always come from retrieved
   chunks, never from model output.

## Conversations

Each assistant exchange is stored under `users/{uid}/conversations/{id}/messages` with its citations, evidence state, and
any referral. Conversation IDs are validated and checked against the caller's own conversations.

## Deletion

`DELETE /api/account` removes Storage objects, the Firestore tree, the student's UID on their own review submissions, and
the Auth identity, in that order. Each step can be repeated. See `docs/PRIVACY.md`.

## Components kept but inert

- `ragChunks.embedding` vector indexes in `firestore.indexes.json`, the optional embedding hook in the indexer, and
  `GEMINI_EMBEDDINGS_ENABLED`. Nothing writes or queries embeddings by default, and enabling them is refused.
- `pushEnabled` in the news preferences route. It is accepted and stored, but nothing reads it and the interface does not
  offer it.
- The summarizer module (`server/src/news/summarizer.js`) is not wired into production.

These are kept because existing tests assert them. Remove them together with those tests in a follow-up.

## Deployment

The client and API deploy separately. `firebase.json` configures rules, indexes, Storage, and Hosting;
`client/vercel.json` provides SPA routing for Vercel; the root `Dockerfile` packages the API on a pinned Node 22 image.
Nothing deploys automatically. See `DEPLOYMENT.md`.
