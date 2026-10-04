# Deployment

This guide is the procedure for a future production deployment of the launch architecture: one React client (static
build), one Express API (container image), Firebase Authentication, Firestore, and Cloud Storage. **Nothing in this
repository deploys anything.** Each step below changes a real project, host, or bill. Run a step only after the target
and its cost have been approved in writing.

The required settings are in `docs/CONFIGURATION.md`. The modes are explained in `docs/MODES.md`. Operations, rollback,
and smoke tests are in `docs/OPERATIONS.md`, `docs/ROLLBACK.md`, and `docs/SMOKE_TESTS.md`. The readiness position is
recorded in `docs/RELEASE_READINESS.md`.

## Runtime

| Component | Version | Source of truth |
| --- | --- | --- |
| Node.js | 22 LTS (`>=22.12.0`) | `.nvmrc`, `engines` in both packages |
| Container base | `node:22.23.3-alpine`, pinned by digest | `Dockerfile` |
| npm | Ships with Node 22 | `package-lock.json` in each package |
| Java 21 | Emulator tests only | CI `emulators` job |

Use Node 22 for release builds. CI and the image are pinned to it.

## What launches, and what does not

| Area | Launch state | Notes |
| --- | --- | --- |
| Email/password and Google sign-in | Works once configured | Google sign-in is verified only in a live project (see "Live verification"). |
| Profile, university, time zone | Works | A `.edu` domain is stored as **pending** until an administrator verifies it. |
| Tasks, calendar, reminders, inbox | Works | In-app only. No email, no browser push. |
| Text PDFs (page-referenced) | Works | Up to 10 MB and 100 pages. |
| PNG/JPEG printed-text OCR | Works with limits | Handwriting, low-resolution, and very large photos may fail; the upload is kept with a retry. |
| Scanned or image-only PDFs | Not supported | Reported as "no readable text"; the upload is kept. |
| Document answers | Retrieved passages without Gemini; generated answers with a key | Answers never fall back to invented guidance. |
| Updates from verified sources | **Waiting on a scheduler** | Live publication needs an approved scheduler (section 5). Each university source also needs an administrator to verify it. Until then the feed shows what has been reviewed, with an honest freshness state. |
| Data export and account deletion | Works | Deletion needs a recent sign-in (5 minutes). |
| Admin news review | Works for listed administrators | Approval is bound to the committed source snapshot and its revision. |

## 1. Firebase project (provisioning required)

1. Create or select a Firebase project. Record its ID. Do not reuse a project that holds anything else.
2. Authentication: enable **Email/Password** and **Google**. Under Authorized domains, add the client's final domain only.
3. Firestore: create the database in production mode, in a region chosen once.
4. Cloud Storage: create the bucket. A new default bucket requires the Blaze plan (Firebase's Storage plan FAQ).
   Set a budget and alert before enabling billing.
5. Deploy the checked-in rules and indexes to that project only:

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes,storage
```

Confirm `firebase use` before each deploy. The repository has no `.firebaserc`, so the target must be selected every time.

After deploy, confirm with a synthetic account:

- `firestore.rules` denies all client access to `newsItemState`, `reviewQueue`, `newsReviewAudits`, `newsSources`,
  `newsRuns`, `newsLeases`, `newsSourceSnapshots`, and `ragChunks`.
- `storage.rules` allows reads and deletes only for the owner of `users/{uid}/documents/{docId}/{fileName}`, and creates
  or updates only for PDF, PNG, or JPEG up to 10 MB.

`firestore.indexes.json` declares only the news indexes. No vector index is declared, because nothing queries embeddings.

## 2. Service account (provisioning required)

Create one service account for the API. Grant only what the code uses. Confirm these roles in the live project, since
the emulator tests cannot prove IAM bindings:

| Need | Recommended role |
| --- | --- |
| Verify ID tokens (with revocation checks); delete Auth users in account deletion | Firebase Authentication Admin |
| Read and write Firestore, including recursive account deletion | Cloud Datastore User |
| Read document bytes and metadata; delete a student's objects | Storage Object Admin, on the GlobeReady bucket only |

Use Application Default Credentials on the platform (an attached service account). If a key file is unavoidable, store
it only in the platform's secret manager, and never in the repository or the image.

## 3. API (provisioning required)

Build and publish the image from the repository root:

```bash
docker build -t YOUR_REGISTRY/globeready-api:COMMIT_SHA .
```

The image is built in two stages. Production dependencies are installed in a build stage from the lockfile. The
runtime stage contains only the pinned Node binary, those production modules, and `server/src`. The package managers
bundled in the base image (npm, npx, corepack, yarn) are removed, because the process only runs `node`. The image runs
as the unprivileged `node` user, listens on `HOST=0.0.0.0` and `PORT` (default 5051), sets `NODE_ENV=production`, and
checks liveness with `/api/health/live`. Record the image digest of each release. CI scans the image with a pinned
Trivy release and fails on any HIGH or CRITICAL finding.

Set the production variables from `docs/CONFIGURATION.md`. The minimum is:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | The project from section 1 |
| `FIREBASE_STORAGE_BUCKET` | The bucket from section 1 |
| `CLIENT_URL` | The https origin of the client, for example `https://app.YOUR-DOMAIN` |
| `RATE_LIMIT_SCOPE` | `single-instance` (run exactly one instance; see below) |
| `TRUST_PROXY` | `1` behind one managed proxy, otherwise `false` |
| `BUILD_ID` | The commit SHA or release tag |

Run exactly one instance, or deploy a shared rate-limit store first. The limiter counts per process, so two instances
would double each student's budget. Set the platform's maximum instance count to `1`.

The API refuses to start, and says why, if any requirement is missing, malformed, or still a placeholder. A server that
starts is reporting ready only after Firebase Auth has answered. Check:

```bash
curl https://api.YOUR-DOMAIN/api/health        # mode production, services.auth true
curl https://api.YOUR-DOMAIN/api/health/ready  # ready
```

Keep these off in the first deployment: `NEWS_SYNC_ENABLED` (section 5), `GEMINI_API_KEY` (section 6), and the document
upload switch in the client (section 4).

Local OCR runs inside the API process. Measure its memory and first-request latency on the real host before choosing
the instance size (`docs/STAGING.md` has the measurement procedure and the earlier unexplained slow run).

## 4. Client (provisioning required)

Build the static client. Production builds require an https `VITE_API_URL` and have no localhost fallback:

```bash
cd client
npm ci
VITE_API_URL=https://api.YOUR-DOMAIN \
VITE_FIREBASE_API_KEY=... VITE_FIREBASE_AUTH_DOMAIN=... VITE_FIREBASE_PROJECT_ID=... \
VITE_FIREBASE_STORAGE_BUCKET=... VITE_FIREBASE_APP_ID=... \
VITE_DOCUMENT_UPLOADS_ENABLED=false \
npm run build
```

The build refuses `VITE_DEMO_MODE` and `VITE_LOCAL_USER_MODE`, and it removes the emulator wiring from the bundle. Host
`client/dist` with `firebase.json` hosting (`firebase deploy --only hosting`) or any static host that rewrites unknown
paths to `index.html`. `client/vercel.json` provides that rewrite for Vercel.

Browser uploads go straight to the bucket, so the bucket must allow the client's origin. Generate the policy from the
final client origin and apply it to the document bucket. The script prints the policy and the command; it changes
nothing:

```bash
node scripts/release/storage-cors.mjs --origin https://app.YOUR-DOMAIN > storage-cors.json
gcloud storage buckets update gs://YOUR_DOCUMENT_BUCKET --cors-file=storage-cors.json
```

Students must give consent before uploading (see `docs/PRIVACY.md`). Set `VITE_DOCUMENT_UPLOADS_ENABLED=true` only in a later release, after section 1's rules are deployed and the
synthetic-document checks pass.

## 5. Source synchronization (not yet operational)

Live publication is fail-closed. It does not run until all of the following are done:

1. **Snapshot commits**: implemented. Source text is committed in Firestore under the same lease that fences the
   update, in one transaction (`newsSourceSnapshots`, server-only).
2. **Robots policy**: implemented. University sources read `robots.txt` through the same SSRF-safe fetcher. A source
   whose robots file is missing is allowed; one that cannot be read, or that disallows the path, is refused.
3. **Administrator verification**: each source must be verified and enabled through the admin screen. University
   sources start as `verification-pending`.
4. **A scheduler**: none is provided. Invoke the sync endpoint from a scheduler you approve, at the cadence in
   `server/src/news/default-sources.js`. Do not use a scheduled function without approval.

When those are approved, the sequence is:

```bash
# Set NEWS_SYNC_ENABLED=true and NEWS_SYNC_SECRET (16+ characters) in the host's secret store.
curl -X POST https://api.YOUR-DOMAIN/api/internal/news/sync \
  -H "Authorization: Bearer $NEWS_SYNC_SECRET" -H "Content-Type: application/json" \
  -d '{"sourceIds":["federal-register"],"dryRun":true}'
```

Run a dry run first, then one live run, then confirm with `GET /api/news` that `sourceHealth.state` moves from
`not-checked` to `current`. A source whose checks stop is reported as **delayed** once it is older than twice its
cadence. It is never shown as "no update".

Only sources that are `verified` and `enabled` are fetched.

## 6. Gemini (optional, provisioning and approval required)

Set `GEMINI_API_KEY` in the host's secret store. Each answer then sends the question, minimal profile fields
(visa type, journey stage, degree level, program, university), and up to six retrieved excerpts to Google. Read
`docs/PRIVACY.md` first. Keep `GEMINI_EMBEDDINGS_ENABLED=false`; it is refused otherwise. Use a key with a spending
limit, restricted to the Generative Language API, from a project that holds nothing else.

## 7. Verification before any deployment

Run these from a clean checkout of the commit to be released:

```bash
cd server && npm ci && npm test && npm run lint && npm run test:rules && npm audit --omit=dev --audit-level=moderate
cd ../client && npm ci && npm test && npm run build && npm audit --omit=dev --audit-level=moderate
cd .. && docker build -t globeready-api:ci . && scripts/release/docker-fail-closed.sh globeready-api:ci
```

CI runs the same gates on every push: server, emulators, client, and the Docker image with its fail-closed matrix. CI
uses no production secret, and no workflow deploys. Deployment stays manual.

## 8. Deployment sequence

Derived from the architecture. Do not reorder without a reason.

1. CI is green for the exact commit. Record the commit and the image digest.
2. Provision the Firebase project, Auth providers, Firestore, and Storage (section 1). Deploy rules and indexes.
3. Create the service account and grant the roles (section 2).
4. Deploy the API image with production variables and one instance (section 3). Confirm `/api/health/ready`.
5. Run the read-only smoke checks against the API (`docs/SMOKE_TESTS.md`).
6. Deploy the client with uploads disabled (section 4). Run the browser checks in `docs/SMOKE_TESTS.md`.
7. In a second release, enable uploads, then the Gemini key, each after its checks pass.
8. Enable source synchronization only after section 5's three conditions are met and the dry run is reviewed.

## 9. Live verification (cannot be completed without a live project)

Each of these needs the real services and a synthetic account. Record each result with its date.

- Google sign-in through the real provider, including the consent screen and the authorized domain.
- Storage upload, extraction, indexing, deletion, and the owner-only rules, against the real bucket.
- Account deletion from a fresh sign-in, with the Auth, Firestore, and Storage results confirmed.
- Revoked and disabled account behaviour (a disabled account's token must return 401).
- Logs reach the chosen collector; `audit.*` events are visible.
- Backup restore for Firestore and Storage, if the retention policy requires it.

## 10. Rollback

See `docs/ROLLBACK.md`. In short: redeploy the previous client build or image digest, keep the configuration values
that were valid, and disable a feature with its switch before editing code.

## 11. Work that needs a person or an approval

- Creating the Firebase project and enabling billing, with a budget alert.
- Configuring Authentication providers and authorized domains.
- Granting and verifying the service-account roles against the live project.
- The live verification in section 9.
- Publishing a privacy notice that covers Gemini and OCR processing (`docs/PRIVACY.md`).
- Choosing the backup-retention and deletion policy.
