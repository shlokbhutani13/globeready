# Deployment

This guide describes the reduced launch architecture: one responsive React client, one Express API, Firebase Authentication, Firestore, and Cloud Storage. It does not deploy anything by itself. Every command below changes a real Firebase project or host, so run each step only after you approve that target.

## Runtime

| Component | Version | Source of truth |
| --- | --- | --- |
| Node.js | 22 LTS (`>=22.12.0`) | `.nvmrc`, `engines` in both packages, CI, `Dockerfile` (`node:22-alpine`) |
| npm | ships with Node 22 | `package-lock.json` in each package |
| Java | 21 (only for emulator tests) | CI `emulators` job |

Node 24 also satisfies the dependency engine ranges, but CI and the Docker image are pinned to 22. Use 22 for release builds.

## What launches

| Area | Launch state | Notes |
| --- | --- | --- |
| Sign in (email/password, Google) | Works | Firebase Authentication. Google re-authentication is used before account deletion. |
| Profile, university, time zone | Works | University domains are only ever registered as **pending** until an administrator verifies them. |
| Updates feed, save/unsave, freshness | Works with a limitation | Shows only verified, published items. **Needs scheduled source sync** (section 5) or the feed stays empty. |
| Tasks, deadlines, calendar | Works | Calendar is a month view with day filtering. |
| Reminders and notification inbox | Works | In-app only. No browser push, no service worker. |
| Text-based PDF upload and extraction | Works | Real text extraction with page references. |
| Scanned or image-only PDFs | **Not supported** | Shown as "no readable text" with the upload kept. Do not advertise scanned-PDF reading. |
| Malformed, password-protected, or blank PDFs | Explicit failure state | Shown as "could not be read" or "no readable text"; the upload is kept and can be deleted. |
| PNG/JPEG printed-text OCR | Works with limitations | Local OCR of printed text. Handwriting is **not supported**; low-resolution, skewed, or very large photos may fail. Failures keep the upload and offer retry. |
| Document-grounded answers | Works when Gemini is configured | Without `GEMINI_API_KEY`, answers show an explicit "unavailable" notice. Answers never fall back to invented guidance. |
| Conversation history | Works | Per student. |
| Data export | Works | JSON download of the signed-in student's data. |
| Account deletion | Works with a verified path in emulators; live Firebase run still required | Requires a recent Google sign-in or a fresh sign-in (5 minutes). |
| Admin news review | Works for listed administrators | Approve/reject is bound to the committed source snapshot. |
| Email reminders and digests | **Not available** | Preferences are saved; no email is sent. Do not advertise email. |

## Intentionally not part of launch

- Browser push notifications, service workers, and push subscriptions (a legacy `pushSubscriptions` subcollection is deleted with accounts).
- Vector embeddings and vector search. Retrieval is deterministic term matching over the student's own chunks.
- A separate scheduled-functions package. Source sync runs from the API when a scheduler calls it.
- Email delivery provider integration.
- Scanned-PDF OCR, handwriting recognition, layout analysis, and multi-language OCR.
- Large university catalogues. Universities enter through verified `.edu` sources reviewed by an administrator.

## 1. Firebase project

1. Create or select a Firebase project. Record the project ID.
2. Authentication: enable **Email/Password** and **Google**. Under Settings > Authorized domains, add the client's final domain.
3. Firestore: create the database in production mode.
4. Storage: create a bucket. Cloud Storage requires the Blaze plan, so set a budget alert first.
5. Deploy the checked-in rules and indexes to the chosen project only:

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage
```

`firestore.indexes.json` declares vector indexes on `ragChunks.embedding`. Nothing writes embeddings at launch (see section 6), so these indexes are inert, but Firestore will still create them on deploy. Remove them from `firestore.indexes.json` in a follow-up that also updates the tests that assert their presence.

Rules to verify after deploy:
- `firestore.rules` denies all client access to `newsItemState`, `reviewQueue`, `newsReviewAudits`, `newsSources`, `newsRuns`, `newsLeases`, and `ragChunks`.
- `storage.rules` allows reads and deletes only under `users/{uid}/documents/` for the owner, and creates only PDF, PNG, or JPEG files up to 10 MB.

## 2. Service account (API)

Create a dedicated service account for the API. Grant only what the code uses. These roles are the recommended minimum; confirm them in your project before release, because the emulator tests cannot prove IAM bindings:

| Need | Recommended role |
| --- | --- |
| Verify ID tokens; delete Auth users during account deletion | Firebase Authentication Admin |
| Read/write Firestore, including recursive account deletion | Cloud Datastore User (Firestore) |
| Read document bytes, read metadata, delete a user's objects | Storage Object Admin on the GlobeReady bucket only |

Store the private key in the host's encrypted secret settings. Do not commit it.

## 3. API configuration

Deploy the repository `Dockerfile`, or the `server/` package on a Node 22 host. The image starts `node src/index.js` on `PORT`.

Server variables (see `server/.env.example`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No (5051) | Listen port |
| `CLIENT_URL` | Yes in production | The only browser origin allowed by CORS |
| `FIREBASE_PROJECT_ID` | Yes for live mode | Admin SDK project |
| `FIREBASE_CLIENT_EMAIL` | Yes for live mode | Service account email |
| `FIREBASE_PRIVATE_KEY` | Yes for live mode | Service account key; keep `\n` escapes |
| `FIREBASE_STORAGE_BUCKET` | Yes for documents and deletion | Bucket name; account deletion removes `users/{uid}/` objects from it |
| `ADMIN_UIDS` | Optional | Comma-separated UIDs allowed to review news |
| `GEMINI_API_KEY` | Optional | Generated document answers. Without it, answers show "unavailable" |
| `GEMINI_MODEL` | No (`gemini-2.5-flash`) | Answer model |
| `DOCUMENT_OCR_ENABLED` | No (`true`) | Set `false` to disable local image OCR |
| `GEMINI_EMBEDDINGS_ENABLED` | Keep `false` | Inert at launch; not supported |
| `AI_REQUESTS_PER_MINUTE` | No (12) | Per-user, per-instance limit on AI routes |
| `NEWS_QUERIES_PER_MINUTE`, `NEWS_SOURCE_SUGGESTIONS_PER_HOUR`, `NEWS_ADMIN_MUTATIONS_PER_MINUTE` | No | Route limits |
| `NEWS_SYNC_ENABLED` | Keep `false` until section 5 | Enables live source fetches |
| `NEWS_SYNC_SECRET` | Required with sync | Bearer secret for the internal sync endpoint, at least 16 characters |

Notes:
- Local OCR runs inside the API process and needs memory. Measure peak memory with a real photo before choosing an instance size. Concurrent OCR is serialized, with a 45-second limit per image.
- The API keeps per-user rate limits in process memory. Run one instance, or move the limiter to a shared store before scaling out.
- `GEMINI_API_KEY` sends retrieved document excerpts to Google for answer generation. That is an external processing step; see `docs/PRIVACY.md`.

Check the API:

```bash
curl https://your-api.example/api/health
```

The response reports `services.auth: true` when Firebase Admin is configured, and `services.ai: true` only when Gemini is configured.

## 4. Client configuration

Deploy `client/` as a static Vite build. `client/vercel.json` and `firebase.json` both rewrite unknown paths to `index.html`.

Build variables (see `client/.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Public API origin, for example `https://your-api.example` |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID` | Firebase web-app configuration. These identify the project; rules enforce access. |
| `VITE_DOCUMENT_UPLOADS_ENABLED` | `true` only after Storage rules are deployed and the API is configured |

For the second release, after the storage billing gate and synthetic-document checks pass, the upload build uses:

```text
VITE_DOCUMENT_UPLOADS_ENABLED=true
```

Build and deploy only after reviewing the target:

```bash
cd client
npm ci
npm run build
```

Firebase Hosting (optional): from the repository root, `firebase use YOUR_PROJECT_ID && firebase deploy --only hosting`. The hosting config serves `client/dist`.

## 5. Source synchronization (required for the Updates promise)

The feed shows only items that were published from a verified source. With `NEWS_SYNC_ENABLED=false`, no source is fetched and the feed stays empty. To launch Updates:

1. Set `NEWS_SYNC_ENABLED=true` and `NEWS_SYNC_SECRET` in the API environment.
2. Run a dry run first from a scheduler or a trusted shell:

```bash
curl -X POST https://your-api.example/api/internal/news/sync \
  -H "Authorization: Bearer $NEWS_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{"sourceIds":["federal-register"],"dryRun":true}'
```

3. Schedule the same call with `dryRun:false` at the cadence in the source registry (`server/src/news/default-sources.js`). Use an external scheduler; GlobeReady does not ship a scheduled-functions package.
4. Confirm with `GET /api/news` that `sourceHealth.state` moves from `not-checked` to `current`.

Only sources marked `verified` and `enabled` are fetched. University sources stay pending until an administrator verifies them through the admin screen.

## 6. Gemini configuration

- Answers: set `GEMINI_API_KEY` and optionally `GEMINI_MODEL`. Retrieved excerpts are sent to Google for each answer. Excerpts are fenced as untrusted data, and generated text is screened for definitive legal or status conclusions.
- Embeddings: not used at launch. `GEMINI_EMBEDDINGS_ENABLED` must remain `false`.

## 7. Emulator and CI checks

Run locally before any deployment (requires Java 21 for the emulators):

```bash
cd server && npm ci && npm test && npm run lint && npm run test:rules
cd ../client && npm ci && npm test && npm run build
```

`npm run test:rules` starts the Firestore, Auth, and Storage emulators. It verifies the rules, recursive Firestore account deletion, and the full account deletion path with real Auth tokens and Storage objects, including the recent-sign-in refusal and partial-failure retry.

CI (`.github/workflows/ci.yml`) runs the server suite, lint, syntax, and production audit; the emulator suite; and the client suite, build, and production audit. CI uses no production secrets.

## 8. Deployment sequence

1. Confirm the CI run for the exact commit is green.
2. Create the Firebase services (section 1) and deploy rules and indexes to the target project.
3. Create the service account and grant the roles in section 2.
4. Deploy the API with the variables in section 3. Keep `NEWS_SYNC_ENABLED=false` and `VITE_DOCUMENT_UPLOADS_ENABLED=false` for the first deployment.
5. Run the smoke checklist below against the API.
6. Deploy the client with `VITE_DOCUMENT_UPLOADS_ENABLED=false`. Complete the smoke checklist on the client.
7. Enable uploads and the Gemini key in a second release after the synthetic-document checks pass.
8. Enable source synchronization (section 5) after the dry runs show expected results.

## 9. Smoke-test checklist

Use a synthetic test account and synthetic documents only. Record the result of each step.

- [ ] `GET /api/health` reports auth enabled.
- [ ] A new account signs up, completes the profile, and the page refresh keeps it.
- [ ] Entering a `.edu` domain shows the school as "verification pending", never "covered".
- [ ] Tasks: create with a due date, edit, complete, and see the calendar day.
- [ ] Notifications: an overdue task produces one reminder; a second check produces none.
- [ ] With uploads enabled: a text-based PDF indexes; a printed-text PNG or JPEG indexes or shows a retry state; a scanned PDF shows "no readable text" and keeps the upload; a text file is refused.
- [ ] A document question returns a citation with the page; an unrelated question says the evidence was not found.
- [ ] A second test account cannot read the first account's documents, conversations, or export.
- [ ] Export downloads JSON containing only the signed-in account's data.
- [ ] Deletion from a fresh sign-in removes the account; the old token gets 401 afterwards. A stale sign-in is refused with a re-sign-in message.
- [ ] A non-administrator receives 403 from `/api/admin/news/review`.
- [ ] Updates show "source check delayed" when a verified source fails, and nothing claims completeness.

## 10. Rollback

- Client: redeploy the previous build artifact. Client changes hold no server state.
- API: redeploy the previous image. Data written by the newer version (profile fields, `analysisError`, conversation messages) is read tolerantly by the older version.
- Rules and indexes: roll back by redeploying the previous `firestore.rules` and `storage.rules` files. Do not delete indexes while queries depend on them.
- Accounts: deletion is not reversible. Keep a documented retention and backup policy before enabling deletion for real users.
- Source sync: set `NEWS_SYNC_ENABLED=false` to stop fetches immediately; the last published items remain visible with their freshness state.

## 11. Manual work that cannot be automated here

- Create the Firebase project, billing, and budget alert.
- Configure Authentication providers and authorized domains.
- Grant the service-account roles in section 2 and verify them against a live project.
- Run the deletion path once against a live project with a synthetic account.
- Publish a privacy notice that covers Gemini answer processing and the local OCR processing (see `docs/PRIVACY.md`).
- Choose a backup-retention policy for Firestore and Storage.
