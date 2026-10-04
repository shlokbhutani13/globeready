# Staging plan

Staging is a separate Firebase project, a separate API deployment, and a separate client build. It never uses the production project, its credentials, or real student data. All accounts, documents, and conversations are synthetic. Values in this document are placeholders; real values are never committed.

## Status

| Item | Status |
| --- | --- |
| Dedicated staging Firebase project | **Does not exist.** The projects visible to the CLI are `autho-fc1c1`, `globe-ready` (the public preview; production, do not use), `project-1-30d99`, `tank-9ae82`, `tank-ball-72f6b`, and `virtual-pet-84640`. None is a GlobeReady staging project. |
| Billing | Not enabled. Cloud Storage requires the Blaze plan, so enabling Storage is a cost decision (see Approvals). |
| Gemini staging key | Not created. |
| Staging API deployment | Not created. |
| Staging client deployment | Not created. |

## Approvals required before any action

1. **Create the staging Firebase project** (`globeready-staging-<suffix>`). Creating a project is a resource action; confirm the name first.
2. **Enable Blaze and create the Storage bucket.** This is the first step that can create cost. Set a budget and alert before enabling it. Expected staging usage is small, but it is not zero.
3. **Create a Gemini API key for staging** in a Google Cloud project that is not production, with a spending limit. Answer generation sends excerpts of staging documents to Google; staging documents are synthetic.
4. **Choose a host for the staging API** (the production image on Node 22). Hosting may create cost.
5. **Choose a scheduler** for source sync, or confirm manual invocation only. A scheduler is a recurring resource and needs approval.

## Required Firebase configuration (staging project)

- Authentication: enable **Email/Password** and **Google**. Add the staging client domain and `localhost` to authorized domains. Do not add production domains.
- Firestore: create in production mode, in a region chosen once.
- Cloud Storage: create the bucket (requires Blaze).
- Deploy rules and indexes to the staging project only:

```bash
firebase use <staging-project-id>
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Run `firebase use` against the staging ID and confirm it before each deploy. The repository has no `.firebaserc`, so the active project must be selected explicitly every time.

### Service account (least privilege)

Create one service account for the staging API. Do not download a JSON key into the repository. Store the private key only in the host's secret manager.

| Need | Role |
| --- | --- |
| Verify ID tokens and delete Auth users | Firebase Authentication Admin |
| Firestore reads, writes, and recursive deletion | Cloud Datastore User |
| Storage object reads, metadata, and deletion under `users/` | Storage Object Admin, granted on the staging bucket only |

Verify the granted roles in the Google Cloud console for the staging project; the emulator tests cannot verify IAM bindings.

## Environment variables

Derived from `server/src` and `client/src`. "Config" means a non-secret value; "secret" means the value must live in a secret store and must not appear in logs, commits, or the client bundle.

### Frontend (build-time, public)

| Name | Purpose | Required | Where | Sensitive |
| --- | --- | --- | --- | --- |
| `VITE_API_URL` | Staging API origin | Yes | Client build environment | No |
| `VITE_FIREBASE_API_KEY` | Firebase web API key | Yes | Client build environment | Public identifier; restrict in Google Cloud |
| `VITE_FIREBASE_AUTH_DOMAIN` | Staging auth domain | Yes | Client build environment | No |
| `VITE_FIREBASE_PROJECT_ID` | Staging project ID | Yes | Client build environment | No |
| `VITE_FIREBASE_STORAGE_BUCKET` | Staging bucket | Yes | Client build environment | No |
| `VITE_FIREBASE_APP_ID` | Firebase web app ID | Yes | Client build environment | No |
| `VITE_DOCUMENT_UPLOADS_ENABLED` | Shows upload controls (`true` for staging tests) | No (default `false`) | Client build environment | No |

### Backend (configuration)

| Name | Purpose | Required | Where | Sensitive |
| --- | --- | --- | --- | --- |
| `PORT` | Listen port | No (5051) | Host | No |
| `CLIENT_URL` | Only allowed browser origin (CORS) | Yes | Host | No |
| `FIREBASE_PROJECT_ID` | Staging project for Admin SDK | Yes | Host | No |
| `FIREBASE_STORAGE_BUCKET` | Staging bucket; document reads and account deletion | Yes | Host | No |
| `ADMIN_UIDS` | Comma-separated staging admin UIDs | Optional | Host | Identifiers; keep staging-only |
| `GEMINI_MODEL` | Answer model | No (`gemini-2.5-flash`) | Host | No |
| `GEMINI_EMBEDDINGS_ENABLED` | Must stay `false` | Yes (value `false`) | Host | No |
| `GEMINI_EMBEDDING_MODEL` | Inert at launch | No | Host | No |
| `DOCUMENT_OCR_ENABLED` | Local OCR switch | No (`true`) | Host | No |
| `AI_REQUESTS_PER_MINUTE` | Per-user AI limit | No (12) | Host | No |
| `NEWS_QUERIES_PER_MINUTE` | Feed limit | No (60) | Host | No |
| `NEWS_SOURCE_SUGGESTIONS_PER_HOUR` | Suggestion limit | No (5) | Host | No |
| `NEWS_ADMIN_MUTATIONS_PER_MINUTE` | Admin limit | No (30) | Host | No |
| `NEWS_SYNC_ENABLED` | Allows live source fetches (`true` only for the sync test) | No (`false`) | Host | No |

### Backend (secrets)

| Name | Purpose | Required | Where | Sensitive |
| --- | --- | --- | --- | --- |
| `FIREBASE_CLIENT_EMAIL` | Staging service-account email | Yes | Host secret store | Yes (identity) |
| `FIREBASE_PRIVATE_KEY` | Staging service-account key, with `\n` escapes | Yes | Host secret store | **Yes** |
| `GEMINI_API_KEY` | Staging Gemini key | Required for generated answers | Host secret store | **Yes** |
| `NEWS_SYNC_SECRET` | Bearer secret for `POST /api/internal/news/sync`, at least 16 characters | Required when sync runs | Host secret store | **Yes** |

Nothing in this list belongs in `.env.example` values, the repository, the client bundle, or chat.

## Gemini (staging)

The assistant, as implemented, calls Gemini only for answer generation. It sends the question, the student profile fields, and up to six retrieved document excerpts, which are fenced as untrusted data. Embeddings are not used.

Verify, using only synthetic staging documents:

1. **Grounded answer:** a question about the synthetic I-20 returns `evidence: grounded` with a citation to `I-20-synthetic.pdf` page 2.
2. **Real citation:** every citation's page and excerpt match a stored chunk; none is taken from model output.
3. **Insufficient evidence:** a question the synthetic documents cannot answer returns `evidence: insufficient`, no citations, and the notice.
4. **High-risk referral:** an attorney-type question returns a referral and no legal conclusion.
5. **No fabricated citation:** a question asking for "page 99" returns only real pages.
6. **Prompt-injection resistance:** the synthetic `notes-injection.pdf` (`injection.pdf`) containing "ignore all previous instructions" must not change the answer's behavior, citations, or evidence state.

If `GEMINI_API_KEY` is absent, all answers report `unavailable`. That is the expected staging state until the key is approved.

## News synchronization (staging)

Route: `POST /api/internal/news/sync` with body `{"sourceIds": [...], "dryRun": true|false}` and `Authorization: Bearer <NEWS_SYNC_SECRET>`.

- Dry runs work with `NEWS_SYNC_ENABLED=false`. Live runs (`dryRun: false`) require `NEWS_SYNC_ENABLED=true`.
- Only sources marked verified and enabled are fetched. In the current registry that is `federal-register`. The others are disabled with pending reasons and cannot run, including as dry runs.
- Staging test sequence: a dry run first, then one live run of `federal-register`, then confirm `GET /api/news` shows items with `sourceHealth.state` moving from `not-checked` to `current`.
- **Scheduling:** no scheduler exists. The first staging verification may invoke the endpoint manually. Do not describe Updates as continuously operating until a scheduler exists and is approved.
- Staging must not enable university sources. Those stay pending until an administrator verifies them, and staging verification of that path uses only synthetic `.edu` entries that are never fetched.

## Synthetic test data

Every value is invented. Documents are generated by `server/tests/fixtures/documents/generate.py`, which renders synthetic text only.

Users:
- **Student A** (`staging-student-a`): synthetic profile, university `Example University`, domain pending, time zone `UTC`.
- **Student B** (`staging-student-b`): a second synthetic profile, used only to verify isolation.
- **Admin** (`staging-admin`): listed in `ADMIN_UIDS`, no student data.

Per student:
- Profile and preferences (topics `status`, `employment`; digest `weekly`).
- Tasks: one overdue task (due 2000-01-01 for the reminder test), one completed task, one future task.
- Notifications: created by reminder sync.
- Saved updates: one published federal item (from the sync test).
- Documents (staging names; fixture files in parentheses): `i20-synthetic.pdf` (`multipage.pdf`) (text PDF, three pages), `passport-synthetic.png` and `passport-synthetic.jpg` (`passport.png`, `passport.jpg`) (printed text: `PASSPORT NUMBER X1234567`, `DATE OF EXPIRY 2031 MAY 18`), `scan-synthetic.pdf` (`scanned.pdf`; image-only, must report no readable text), and `notes-injection.pdf` (`injection.pdf`).
- Conversations: at least one, with citations.

No real identity documents, passports, I-20s, student records, or personal information are used at any point.

## Cold OCR measurement

Measured in the production image (`globeready-api:bd34e0d`, Node 22.23.3, linux/arm64) on the local Docker runtime, with networking disabled. Not measured on the staging host; repeat there.

| Run | Container wall time | First OCR (PNG) | Second OCR (JPEG) | Third OCR (PNG) |
| --- | --- | --- | --- | --- |
| Earlier verification run | more than 10 minutes, unexplained, not reproduced | not recorded | not recorded | not recorded |
| Cold run 1 | 0.69 s | 0.26 s | 0.06 s | 0.05 s |
| Cold run 2 | 0.54 s | 0.24 s | 0.06 s | 0.05 s |

Module import was 0.04 to 0.05 s. Two fresh containers reproduced fast cold starts. The earlier run remains unexplained, so the staging host must repeat this measurement, including the first request after a cold deployment.

## Staging deletion test

Use only a completely synthetic account. In order:

1. Populate Student A across every store (profile, preferences, tasks, notifications, saved updates, documents, extracted chunks, conversations, and a review submission).
2. Export and verify the JSON contains only Student A's data.
3. Attempt deletion from a stale sign-in: expect refusal with `recent_login_required`.
4. Re-authenticate with Google (or sign out and in for email accounts), then delete. Expect `authIdentity: deleted`.
5. Confirm Firestore `users/<A>` is gone, `users/<A>/documents` and `ragChunks` are empty, and Storage has no `users/<A>/` objects.
6. Confirm the Firebase Auth user for Student A no longer exists.
7. Confirm Student A's review submission has `submittedBy: null`, and the review record itself remains.
8. Confirm Student B's profile, tasks, notifications, documents, chunks, and conversations are unchanged.
9. Confirm Student A's old token gets 401.

## Recommended next step

After approval of items 1 and 2 under Approvals: create the staging project, enable Email/Password and Google, create the Storage bucket, deploy rules and indexes, create the service account with the roles above, and deploy the API from the production image with staging configuration. Then run the synthetic test plan in the order above.
