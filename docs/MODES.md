# Modes: demo, local-user, and production

GlobeReady runs in one of three modes. The mode decides where data lives and who the signed-in student is. The
server and the client each check the mode, and both refuse the development modes in production.

## Summary

| | Demo | Local-user | Production |
| --- | --- | --- | --- |
| Start with | `npm run demo` (server and client) | `npm run local-user` (from `client/`) | `node src/index.js` in the image, with production variables |
| Identity | `x-demo-user` header (no real account) | Real emulator accounts with real ID tokens | Real Firebase accounts |
| Data | In-memory sample data, lost on restart | Persistent emulator data in `.local/emulator-data` | Firestore, Storage, and Auth in your Firebase project |
| Documents | No uploads | Real Storage uploads; real PDF and OCR reading | Real Storage uploads; real PDF and OCR reading |
| Answers | Canned development guidance, labelled demo | Retrieved passages with a notice that generation is off | Retrieved passages, or generated answers when a key is configured |
| Updates | Four labelled sample items | Four labelled sample items (`GlobeReady local sample data`) | Verified official sources only, once synchronization is enabled and approved |
| Allowed in production | No (refused) | No (refused) | Yes |

## Demo mode

- Server: `DEMO_MODE=true`. Refused when `NODE_ENV=production`.
- Client: `client/.env.demo` sets `VITE_DEMO_MODE=true` and `VITE_API_URL`. It contains no credentials.
- The API trusts the `x-demo-user` header only in this mode. The client sends it only in this mode.
- Demo mode is for showing the interface without any account. Nothing it does is stored.

## Local-user mode

Local-user mode is the closest thing to production that runs on one computer. It uses the real application code
paths: real ID tokens, real Firestore and Storage rules, real uploads, real PDF and OCR reading, and real citations.
Only the Firebase services are emulated.

### What is real locally

- Accounts are created and signed in through the Auth emulator, and every API call presents a real ID token that the Admin SDK verifies.
- Firestore security rules and Storage rules are enforced by the emulators.
- Uploads go to the Storage emulator. The server re-checks each stored file's type and size before reading it.
- PDF text extraction and PNG/JPEG OCR run on this computer, on the same code as production.
- Retrieval, citations, insufficient-evidence states, and high-risk referrals run exactly as in production.
- Account export and deletion run the same code, including recent-sign-in checks, Storage cleanup, Firestore purge, and Auth deletion.
- Data persists across restarts (see `docs/OPERATIONS.md`).

### What is emulated

| Service | Emulated by | Port |
| --- | --- | --- |
| Firebase Authentication | Auth emulator | 9099 |
| Firestore | Firestore emulator | 8089 |
| Cloud Storage | Storage emulator | 9199 |
| Emulator console | Emulator UI | 4000 |

The emulators store data in `.local/emulator-data`, which is ignored by git. Their ID tokens are unsigned. The
emulator-configured Admin SDK accepts them, and production Admin SDK configuration cannot be made to accept them,
because production refuses emulator variables.

### Google sign-in is a mock locally

The "Continue with Google (local mock)" button opens a mock Google identity that the Auth emulator provides. It is
**not your Google account**, and nothing about it is sent to Google. Real Google sign-in and its consent screen can
only be verified in a deployed environment (see `docs/RELEASE_READINESS.md`, "Live verification required").

### Answers without Gemini

With no `GEMINI_API_KEY`, the Assistant does not write an answer. It shows the closest real passages from the
selected documents with their page references, and states that "AI answer generation is not configured in local
mode." If no passage matches, it says the answer was not found in the student's documents. Referrals for legal,
tax, health, and status questions are deterministic and appear in every mode.

### Documents and OCR limits

- Text-based PDFs are read with their page numbers. Up to 100 pages and 10 MB.
- PNG and JPEG photos of **printed** text are read locally. Handwriting, low-resolution, skewed, and very large images
  may fail. A failure keeps the upload and offers a retry.
- Scanned or image-only PDFs are not read. They are reported as having no readable text and the upload is kept.
- A file whose bytes do not match its declared type is refused as a type mismatch.

### Updates locally

Local Updates are four synthetic items. Each is labelled as sample data, and its link goes to `example.com`. They
exist to exercise the interface. No official source is contacted, and no real government or university information
is shown.

### Local accounts

`npm run local-user` seeds two synthetic accounts: `student@local.example` (a student) and `admin@local.example` (an
administrator). Their passwords are generated on first start and written to `.local/credentials.json` with owner-only
permissions. That file is ignored by git. Do not copy the passwords into documents or tickets.

## Production mode

Production is the only mode that may serve real students. It requires real Firebase, a verified Firebase Admin
configuration, https origins, a document bucket, and the single-instance declaration. See `docs/CONFIGURATION.md` for
every rule, and `DEPLOYMENT.md` for the order of work.

Production has no fallback: a missing or malformed setting stops the process, and no mode switches itself at runtime.
