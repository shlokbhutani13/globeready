# Release readiness: production hardening pass

**Verified starting checkpoint:** `5f669abb0b629378d71f6e36cced072b1e4369d7` (local and remote feature branch).
`origin/main` was not changed and nothing was merged. Nothing in this pass was pushed, deployed, or provisioned.

**Scope of this pass:** repository and code work that can be done at $0 with local tools: configuration, HTTP and
process hardening, authorization and input tests, document and AI boundaries, source ingestion, privacy, container and
CI gates, and documentation. Live infrastructure is classified below and was not touched.

## Classification

Every remaining issue belongs to exactly one class. This table reflects the completion pass that followed the first
hardening pass; the lists below supersede the earlier ones.

| Class | Count | Meaning |
| --- | --- | --- |
| BLOCKER | **0** | A repository or code problem that must be fixed before provisioning. |
| PROVISIONING REQUIRED | 17 | Needs real cloud resources, accounts, or money. |
| LIVE VERIFICATION REQUIRED | 15 | Implemented, but only a deployed environment can prove it. |
| INTENTIONAL V1 LIMITATION | 12 | Known and accepted for the first release. See `docs/V1_SCOPE.md`. |
| FUTURE SCALE WORK | 9 | Not needed for the first deployment. |

### Completion pass changes

- **Storage CORS.** `scripts/release/storage-cors.mjs` builds the bucket policy from explicit https origins. It prints
  the policy and the apply command, and changes nothing. Tested.
- **Vector indexes removed** from `firestore.indexes.json`. The tests and docs that asserted them were updated.
- **PDF and OCR inside the container.** `scripts/release/container-extraction-check.mjs` runs with the network disabled,
  against the real extraction code and local OCR. All 7 checks pass: text PDF (3 pages), malformed, blank, and
  scanned PDFs refused with the right outcome, PNG and JPEG printed text read, and a PNG declared as a PDF refused.
- **SDK usage checked against installed types, no live calls.** `@google/genai` takes `httpOptions.timeout` in
  milliseconds on its constructor, and `embedContent` accepts `taskType` and `outputDimensionality`. The Admin SDK's
  `verifyIdToken(token, checkRevoked)` and `deleteUser(uid)` match the calls in the code. No change was needed.
- **Reminders.** Dedupe is by task and due date, so a rescheduled task gets a new reminder. The client checks at
  sign-in, every 15 minutes, on window focus, and when the task list changes. In-app only; no background, email, or push.
- **Consent.** Document reading and AI-written answers each need a recorded choice at the current wording version. The
  server refuses indexing and document-scoped answers without document reading, and never sends passages to the model
  without the AI choice. Firestore rules refuse document records without document reading consent. Consent is in the export
  and audited without content.
- **Copy.** The inbox no longer says "You're caught up" next to listed reminders. A closed Google re-authentication
  pop-up now gets a plain instruction rather than the provider's error code.
- **Policy documents.** `docs/DATA_POLICY.md` (retention, deletion, backup, restore) and `docs/V1_SCOPE.md`.

### Defects found by this pass and fixed

- The consent effect was placed after two early returns in `App`, which crashed the app on sign-in and sign-out ("Rendered
  more hooks than during the previous render"). The client unit tests did not catch it, and the browser pass did. Fixed
  by moving the effect above the returns. Unit tests do not render `App`, so this class of error relies on the browser pass.
- Reminder dedupe by task alone would have hidden every rescheduled task's new reminder. Fixed.

### Open risks

- **Intermittent `ECONNRESET`** in the launch-journeys reminder test, seen once in the full suite and not reproduced in
  9 later runs or 8 isolated runs. The cause is not identified. CI will show whether it recurs.
- **Restore can resurrect deleted accounts** unless reconciled from the `audit.account_deleted` log lines. There is no
  deletion ledger. Procedure in `docs/DATA_POLICY.md`.
- **Storage uploads are not checked against consent** by the Storage rules. The server never reads such a file without
  consent, and account deletion removes it.

### Blockers (superseded by the completion pass above)

None open. Three items found in this pass were blockers and are fixed and tested (see "Fixes"): the unbounded
production assistant fallback, the local API listening on all network interfaces with unsigned tokens, and live Updates
publication that could not run in production. One intermittent test failure was also investigated and fixed.

### Provisioning required

1. Firebase project creation and its selection (`firebase use`) for each environment.
2. Billing (Blaze), with a budget and alert, before creating the Storage bucket.
3. Cloud Storage bucket creation and its region.
4. Firebase Authentication providers (Email/Password, Google) and authorized domains.
5. Firestore database creation (production mode, region chosen once).
6. Service account creation and the roles in `DEPLOYMENT.md` section 2.
7. Deployment of the checked-in Firestore rules, indexes, and Storage rules to that project.
8. Secret store for `FIREBASE_PRIVATE_KEY` (if not using Application Default Credentials), `NEWS_SYNC_SECRET`, and `GEMINI_API_KEY`.
9. API host: a container platform running exactly one instance, with the health probes in `docs/OPERATIONS.md`.
10. Static hosting for the client build, and the rewrite rule to `index.html`.
11. Domain, DNS records, and TLS certificates for the API and the client.
12. A log collector and alerts for `severity` errors and `audit.*` events.
13. A scheduler for source synchronization. It needs approval; no scheduler is provided.
14. Gemini API key with a spending limit (optional, needs approval). Also a published AI-processing notice.
15. Firebase App Check (optional but recommended): enforce it for Firestore, Storage, and the API so that only the
    released client can use the backend. It needs a registered web app and an attestation provider.
16. Applying the Storage CORS policy generated by `scripts/release/storage-cors.mjs` to the document bucket.
17. The backup decision: enabling Firestore point-in-time recovery and a Storage backup or versioning policy, with a
    budget. The repository does not enable either (`docs/DATA_POLICY.md`).

### Live verification required

1. Real Google sign-in: the consent screen, the authorized domain, and the Google-issued identity.
2. Revoked and disabled account behaviour (a disabled account's token must be refused).
3. Firestore and Storage rules against the live project (the emulator suite proves them only in the emulator).
4. The service account's effective roles (the emulator cannot prove IAM bindings).
5. Document upload, extraction, OCR, retrieval, and deletion against the live bucket with the synthetic fixtures.
6. OCR memory use and cold-start latency on the target host. The earlier measurement was on a local container and
   includes one unexplained run of more than ten minutes (`docs/STAGING.md`).
7. Account deletion from a fresh sign-in against a disposable account, with Auth, Firestore, and Storage each confirmed.
8. Account export against live data.
9. Source synchronization: a dry run, then a live run of one approved source, then the freshness state.
10. Health and readiness probes as the platform calls them, and the single-instance behaviour of the rate limiter.
11. The log collector receives the structured lines and the `audit.*` events.
12. A rollback drill: redeploy the previous image digest and client build, and confirm the smoke checks.
13. The consent flow on a live deployment, including the Storage upload that the CORS policy must allow.
14. A live Gemini call with the approved key and the model name, once a key exists. Nothing in the repository has called
    the live service; the SDK usage was checked against the installed types only.
15. Admin token verification and revocation against real Firebase tokens, not the emulator's.

### Intentional V1 limitations

1. Scanned or image-only PDFs are not read; handwriting is not supported.
2. OCR reads printed English text only, on the API host.
3. No email delivery and no browser push. Email preferences are stored only.
4. No vector embeddings. Retrieval is deterministic term matching over the student's own chunks.
5. Generated answers require a Gemini key. Without it, answers show retrieved passages and say so.
6. The rate limiter is per process. The deployment must run one instance (`RATE_LIMIT_SCOPE=single-instance`).
7. Student uploads and student Firestore writes go directly to Storage and Firestore under the rules. Their shapes are
   checked by the rules, but they are not rate limited by the API.
8. An upload interrupted before its metadata is written leaves an orphaned file. Account deletion removes it, and no
   scheduled sweep exists yet.
9. Updates require sign-in. University sources become visible only after an administrator verifies each one.
10. Demo mode uses canned development guidance, labelled as demo, and never runs in production.
11. Local Updates are four synthetic items. The Google button in local mode is a mock identity.
12. Reminders are in-app only, and appear while the app is open or on its next check. No background, email, or push reminders.

### Future scale work

1. A shared rate-limit store, required before more than one API instance.
2. A scheduled sweep of expired source snapshots (they carry an expiry field; nothing deletes them yet).
3. A scheduled sweep of orphaned Storage objects (see limitation 8).
4. Pagination or hard limits on the full task and document lists (today each list is returned whole).
5. Per-student quotas for direct Firestore writes, and a limit on university connector creation from profile updates.
6. A separate OCR worker or queue, and concurrency control beyond one-at-a-time recognition.
7. Metrics and tracing beyond structured logs.
8. Removal of inert code: the summarizer module, the legacy `/analyze` route, and the embedding hook.
9. Upgrade of the emulator tooling (see "Dependency and supply chain").

## Audit findings and fixes

Priorities: **P0** blocks production; **P1** should be fixed before production; **P2** is an accepted, documented limitation.

### P0 (found and fixed)

| # | Finding | Fix | Verified by |
| --- | --- | --- | --- |
| P0-1 | The API listened on every interface in local-user mode, where emulator ID tokens are unsigned. Anyone on the network could act as any student. Confirmed with `lsof`: `*:5051`. | `HOST` is configured. Local-user refuses any non-loopback address. Production defaults to all interfaces only inside the container. | `runtime-config-contract.test.js`; `lsof` after restart shows `127.0.0.1:5051` |
| P0-2 | Production silently fell back to canned assistant guidance when document storage was missing, presented as an answer. | Production uses an explicit unavailable assistant. Canned guidance exists only in demo mode. | `gemini-provider.test.js` (unavailable state, no answer text) |
| P0-3 | Account deletion skipped Storage cleanup silently when no bucket was configured, then deleted the identity, leaving personal files behind. | Production requires the bucket. Deletion refuses with a retryable 503 and changes nothing if storage is unavailable. | `account-hardening.test.js`; `runtime-config-contract.test.js` |
| P0-4 | ID tokens were verified without a revocation check, so a disabled or revoked account kept access until its token expired. | Verification uses the revocation check, which also refuses disabled accounts. | `account-hardening.test.js`; live revocation pending (LIVE-2) |
| P0-5 | Live Updates could not publish in production. The snapshot store required a cross-service promotion adapter that did not exist, so every live sync failed closed and approval was impossible. | The snapshot commit protocol is implemented on Firestore inside the lease's own transaction. No cross-service step is needed. | `firestore-snapshots-emulator.test.js` (9 tests, including a snapshot and its news item committed under one lease) |
| P0-6 | Document paths were checked by prefix only. Traversal or extra segments could address other paths. | An exact owned-path check, mirrored from the Storage rules. The stored bytes are also checked against the declared size. | `storage-paths` cases in `document-hardening.test.js` |
| P0-7 | Malformed numeric limits (for example `AI_REQUESTS_PER_MINUTE=abc`) became `NaN`, which silently disabled the limiter. | Strict integer parsing. Malformed values refuse startup. | `runtime-config-contract.test.js` |
| P0-8 | A stored document could be deleted from the API without its file, leaving the file orphaned. | The API deletes the stored file first and removes the record only after that succeeds. | `document-hardening.test.js` (storage failure keeps the record) |
| P0-9 | The Firestore rules let a student write any content into their own task, document, and resource records, bypassing API validation. | Each client-writable collection has a shape rule: allowed keys, types, lengths, `https` links, the owned storage path with a matching ID, allowed content types, and the 10 MB limit. Server-written records are read-only to the owner. | `firestore-rules-emulator.test.js` (50 rules tests, including refused shapes) |
| P0-10 | The production container ran as root, carried the Node base image's package managers, and had no health check. | Multi-stage build; runtime user `node`; only the Node binary, production modules, and `server/src`; health check on liveness. Trivy finds nothing at any severity. | `docker` CI job; Trivy result in this document |

### P1 (found and fixed)

| # | Finding | Fix |
| --- | --- | --- |
| P1-1 | Local-user `/api/health` reported `mode: "live"`. | Reports `local-user`; modes are `production`, `demo`, `local-user`, `unconfigured`. |
| P1-2 | Login copy was production-oriented ("Live authentication"), including in local development. | Local copy says the environment is local, the services are emulated, and the Google identity is a mock. The production divider now reads "Google or email sign-in"; its Google button label is unchanged. |
| P1-3 | The Storage path contract was duplicated in three places. | Kept deliberately: `storage.rules`, the server check, and the rules test each keep an independent copy so that drift is visible. The client builder is tested against the same pattern. Documented. |
| P1-4 | `CLIENT_URL` defaulted to localhost in production. | Required in production; https-only except for loopback in development. |
| P1-5 | No graceful shutdown; no policy for process-level failures. | Bounded shutdown on `SIGTERM` and `SIGINT`; readiness drops first; unhandled rejections and uncaught exceptions exit non-zero after cleanup. |
| P1-6 | Health reported one thing for every question. | Separate liveness, readiness, mode, and version endpoints. |
| P1-7 | Request bodies: malformed JSON, non-JSON content, oversized bodies, and missing bodies produced 500s or inconsistent errors. | Normalized 400, 415, 413, and empty-object handling; 100 KB limit. |
| P1-8 | Error responses could carry internal messages. | Only deliberately safe messages reach clients; everything else is generic. |
| P1-9 | Logs were unstructured, and request paths could carry IDs. | One JSON object per line, with route templates, request IDs, and redaction by field name. |
| P1-10 | Admin changes left no record. | Successful admin changes are audited as `audit.admin_news_mutation`, without payloads. |
| P1-11 | Export and deletion had no limits. | Per-student limits on both, with separate audit events for export and deletion. |
| P1-12 | Deletion could not be retried after an Auth identity was already removed. | An already-removed identity counts as success. Other Auth failures are surfaced. |
| P1-13 | A date field accepted arrays and impossible dates (`2026-02-31`) through coercion. | Strict date validation. |
| P1-14 | A task title could be blanked by a non-text value. | Non-text and blank titles are refused. |
| P1-15 | A stale source showed as current when its checks stopped. | A source older than twice its cadence is delayed. |
| P1-16 | University sources could never sync, although the README promises them. | A robots.txt policy through the SSRF-safe fetcher. It fails closed on read errors and caches decisions. |
| P1-17 | Gemini calls had no timeout, and the full profile, including name, was sent to the model. | Timeout bounded by config. Only five profile fields are sent. Empty answers are treated as malformed. |
| P1-18 | A model reply could be shown as grounded with an empty answer. | Rejected as malformed; the state becomes unavailable. |
| P1-19 | Magic bytes were not checked; a file could claim one type and contain another. | Signature check for PDF, PNG, and JPEG before any parsing. |
| P1-20 | A stored object larger than its metadata claimed was only checked by metadata. | The downloaded byte length is checked too. |
| P1-21 | Long original file names produced uploads that the Storage rules refused. | Base name capped at 120 characters. |
| P1-22 | An API response that was not JSON crashed the client caller. | Typed error. |
| P1-23 | A production client build without `VITE_API_URL` called `localhost`. | No fallback in production; the origin must be https. |
| P1-24 | Emulator wiring was in the production bundle, guarded only at runtime. | A build-time switch removes it from every non-local build. Verified: zero emulator addresses in the bundle. |
| P1-25 | An intermittent test failure, observed once in a full run. | Reproduced under three-way concurrency: subprocess tests hit vitest's 5-second cap. Fixed with an explicit budget; 878 passed three times under concurrency. |
| P1-26 | A stale root `.env.example` carried obsolete variables. | Removed. Server and client templates rewritten to the contract. |
| P1-27 | Dependencies: the server's full audit lists advisories. | Production audits: zero. The advisories are in the emulator CLI, which is not in the image. Documented, not forced. |

### P2 (accepted and documented)

- Emulator-CLI advisories (see "Dependency and supply chain").
- Third-party test directories inside packages in the image (about 5 MB across 62 entries; no code path reaches them). Pruning them is a possible later change, not a release item.
- The legacy `/analyze` route and the inert summarizer, both kept because tests assert them.
- A stray empty `@vitest` and `@pnpm` directory in the image (created by npm; empty).
- Notifications copy: a page with unread items may state "You're caught up" in one line. Pre-existing; not changed.

## Required configuration decisions

- **Single instance.** The rate limiter counts per process. Production refuses to start without `RATE_LIMIT_SCOPE=single-instance`.
- **Robots.** A missing `robots.txt` (404 or 410) allows the source. Any other read error refuses it.
- **Snapshots.** Source text is stored in Firestore under the lease, server-only, capped at 900 KB per snapshot.
- **Gemini.** Off without a key. When on, the fields in `docs/PRIVACY.md` are sent. Embeddings are refused.

## Verification record

Commands were run on the final tree, from this checkout, with the local emulators stopped for the rules run and then
restarted.

| Gate | Result |
| --- | --- |
| Server suite (`npx vitest run`) | **878 passed, 36 skipped** (63 files). Baseline was 726 passed, 27 skipped (47 files). The 36 skipped are emulator-gated tests, which run in the rules suite. Three concurrent runs also passed 878 each. |
| Emulator and rules suite (`npm run test:rules`) | **50 passed** (6 files). Baseline was 34 (5 files). |
| Client suite (`npm test`, jsdom) | **80 passed** (13 files). Baseline was 71 (12 files). |
| Production client build | Pass. Zero emulator addresses in the bundle. |
| Server lint and syntax | Pass (`node --check` on every source and test file). |
| Shell and smoke-tool syntax | Pass. Smoke-tool refusal tests pass (12). |
| `git diff --check` | Clean, including untracked files. |
| Production audit, server (`--omit=dev`, moderate) | **0 vulnerabilities.** |
| Production audit, client (`--omit=dev`, moderate) | **0 vulnerabilities.** |
| Full server audit (including dev tooling) | 12 advisories, all in `firebase-tools` and its transitive packages (emulator CLI). Not in the production image. |
| Docker image build (multi-stage) | Pass. 134 MB. |
| Trivy image scan (pinned `aquasec/trivy@sha256:6967db…`) | **No findings at any severity**, unfixed included. Before the multi-stage change, Trivy reported ten fixable HIGH findings (with `--ignore-unfixed`), all in the base image's bundled npm tooling. Those packages are removed from the runtime image. |
| Container checks | Non-root (`node`); `NODE_ENV=production`; `HOST=0.0.0.0`; no development or secret paths; health reaches `healthy`; SIGTERM exits 0. |
| Production fail-closed matrix (`scripts/release/docker-fail-closed.sh`) | **8 of 8 pass**, each refusing for its specific reason, with no network. |
| Demo-mode regression | Pass: boot, health, ready, demo identity accepted, anonymous refused, SIGTERM exits 0. |
| Local-user regression, API | Pass: forged header refused; cross-user documents, conversations, tasks, index, and delete all refused; export excludes other students; admin reachable only to the admin; revoked token refused after deletion; deletion with data leaves no Firestore residue. |
| Local-user regression, browser | Pass: login and logout; profile saved and persisted across reload; task create, complete, and delete; Updates filters, save and unsave; a malformed PDF shows "Index failed" with a safe reason and keeps the upload; an injected instruction in a PDF is shown only as quoted document text on its real page; a printed-text photo is read by OCR and cited; the attorney referral appears; conversation history survives reload. |
| Local-user persistence | Pass: stopped with export, restarted with import. The profile change, all four documents, three conversations, and four tasks were present after restart. |
| Not exercised in the browser | The notification mark-read control (no unread items this session; covered by the rules tests); a scanned PDF (covered by the automated extraction tests); Google sign-in (mock only). |

## Dependency and supply chain

- **Server runtime dependencies:** all are imported by the code. None is unused.
- **Client runtime dependencies:** all are imported.
- **Lockfiles:** `npm ci` in every build and in CI. Nothing installs without a lockfile.
- **Overrides:** `uuid`, `@fastify/busboy`, `@grpc/grpc-js`, and `brace-expansion` are pinned by the server's overrides.
- **Base image:** `node:22.23.3-alpine` pinned by digest, the same in both build stages.
- **GitHub Actions:** `actions/checkout@v7`, `actions/setup-node@v7`, and `actions/setup-java@v6`, on `ubuntu-24.04`. The Trivy image is pinned by digest.
- **Major upgrades:** none performed. The emulator CLI (`firebase-tools`) carries the dev advisories above; upgrading it is a planned change because it changes the emulator toolchain.

## Changed files

Server, client, rules, container, CI, scripts, tests, and documentation. The complete list is in the commit history on
`codex/globeready-platform`. Nothing under `.claude/`, `.local/`, or any `.env` file is tracked or committed.

## What must happen next

1. Independent review of this checkpoint (requested).
2. Provisioning and live verification as listed above, in the order in `DEPLOYMENT.md`.
3. Only then, a push and a deployment decision.
