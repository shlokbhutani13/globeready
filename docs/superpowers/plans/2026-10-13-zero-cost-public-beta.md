# Zero-Cost Public Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a safe static GlobeReady public beta using only no-cost Firebase and GitHub capabilities, with browser-local documents and reviewed static news.

**Architecture:** Add an explicit `zero-cost-public` Vite runtime that uses Firebase Auth and rules-protected Firestore directly but never calls the Express API or Cloud Storage. Browser workers extract documents locally; deterministic retrieval runs client-side; reviewed official news is emitted as a static artifact by existing server adapters and may be proposed through GitHub Actions.

**Tech Stack:** React 18, Vite 8, Firebase Web SDK 12, Firestore/Auth emulators, PDF.js, Tesseract.js worker, Node 22, Vitest, GitHub Actions, Firebase Hosting Spark.

**Spec:** `docs/superpowers/specs/2026-10-13-zero-cost-public-beta-design.md`

## Global Constraints

- Recurring infrastructure budget is exactly `$0`; any provider step requesting billing stops.
- Original student files never leave the browser in `zero-cost-public`.
- No private document content is sent to Gemini or another third-party AI service.
- Existing production, demo, and local-user behavior remains backward compatible.
- Static news is published only from reviewed, source-verified content; scheduled jobs never publish directly.
- UI copy must disclose best-effort source freshness, no original-file backup, and no SLA.

## Review Focus

- A renamed or malformed file must fail signature validation before parsing and write nothing (Task 3).
- Refreshing during local extraction must not create a document record without complete chunks (Task 3).
- Firestore quota/auth failures must not silently switch to demo data or claim a successful write (Task 2).
- A stale or tampered news artifact must be visibly delayed or rejected, never shown as current (Task 5).
- Partial account cleanup must preserve the identity and expose a retryable failure until Firestore cleanup completes (Task 7).

---

### Task 1: Explicit zero-cost runtime contract

**Files:**
- Create: `client/.env.zero-cost-public.example`
- Modify: `client/src/lib/runtime-mode.js`
- Modify: `client/src/lib/firebase.js`
- Modify: `client/src/lib/api.js`
- Modify: `client/vite.config.js`
- Test: `client/src/__tests__/runtime-mode.test.jsx`
- Test: `client/src/__tests__/api-client-and-storage-contract.test.js`

**Interfaces:**
- Produces: `runtimeMode === "zero-cost-public"`, `zeroCostPublicMode: boolean`, and a build-time refusal for API, Storage, or emulator configuration.
- Consumes: existing Firebase public web configuration and runtime-mode patterns.

- [ ] **Step 1: Write failing runtime tests** asserting zero-cost-public is selected only by `VITE_ZERO_COST_PUBLIC=true`, rejects API/Storage/emulator configuration, and never calls `apiRequest`.
- [ ] **Step 2: Run** `cd client && npm test -- --run src/__tests__/runtime-mode.test.jsx src/__tests__/api-client-and-storage-contract.test.js`; expect the new assertions to fail.
- [ ] **Step 3: Implement the runtime contract** in the listed files and add the documented environment template without secrets.
- [ ] **Step 4: Re-run the targeted tests and `npm run build -- --mode zero-cost-public`;** expect pass and no localhost/emulator/API origin in `dist`.
- [ ] **Step 5: Commit** with `feat(runtime): add zero-cost public mode`.

### Task 2: Direct rules-protected student data adapter

**Files:**
- Create: `client/src/lib/zero-cost-data.js`
- Modify: `client/src/lib/student-data.js`
- Modify: `client/src/lib/consent.js`
- Test: `client/src/__tests__/zero-cost-data.test.js`
- Test: `server/tests/firestore-rules-emulator.test.js`

**Interfaces:**
- Consumes: authenticated Firebase `uid`, existing profile/task/resource/consent shapes.
- Produces: `createZeroCostDataStore({ firestore, uid })` with subscriptions and bounded CRUD returning explicit success/failure results.

- [ ] **Step 1: Write failing client tests** for profile, task, saved resource, consent, and document-index operations; assert authentication/quota failures surface and no demo fallback occurs.
- [ ] **Step 2: Write failing emulator tests** proving cross-user access, unknown fields, oversized values, and incomplete document indexes are refused.
- [ ] **Step 3: Run the targeted client and rules tests;** expect contract failures.
- [ ] **Step 4: Implement the direct adapter and any minimal rule-shape changes** using atomic batches for multi-document operations.
- [ ] **Step 5: Re-run targeted tests;** expect pass.
- [ ] **Step 6: Commit** with `feat(data): add zero-cost student store`.

### Task 3: Browser-local document extraction

**Files:**
- Create: `client/src/lib/local-documents/file-policy.js`
- Create: `client/src/lib/local-documents/pdf-worker.js`
- Create: `client/src/lib/local-documents/image-worker.js`
- Create: `client/src/lib/local-documents/extract.js`
- Create: `client/src/lib/local-documents/chunks.js`
- Modify: `client/package.json`
- Modify: `client/package-lock.json`
- Modify: `client/src/pages/DocumentsPage.jsx`
- Test: `client/src/__tests__/local-document-policy.test.js`
- Test: `client/src/__tests__/local-document-extraction.test.js`
- Test fixtures: reuse `server/tests/fixtures/documents/`

**Interfaces:**
- Consumes: `File`, document-reading consent, and `createZeroCostDataStore().replaceDocumentIndex(...)`.
- Produces: `validateLocalFile(file)`, `extractLocalDocument(file, options)`, and bounded `{ metadata, chunks }`; original bytes are never returned to persistence code.

- [ ] **Step 1: Write failing tests** for magic bytes, 10 MB/100-page limits, malformed/encrypted/scanned PDFs, PNG/JPEG, chunk bounds, cancellation, and interrupted extraction writing nothing.
- [ ] **Step 2: Run targeted tests;** expect missing-module/interface failures.
- [ ] **Step 3: Add dependencies and implement extraction** using `pdfjs-dist` and lazy `tesseract.js`, explicit cancellation, and all-or-nothing Firestore indexing after extraction succeeds.
- [ ] **Step 4: Wire zero-cost Documents UI** to say originals stay on-device and are not backed up; preserve production upload behavior.
- [ ] **Step 5: Run targeted tests and build;** expect pass and worker chunks emitted separately.
- [ ] **Step 6: Commit** with `feat(documents): process zero-cost files in browser`.

### Task 4: Private deterministic local assistant

**Files:**
- Create: `client/src/lib/local-documents/retrieval.js`
- Create: `client/src/lib/local-assistant.js`
- Modify: `client/src/pages/AssistantPage.jsx`
- Test: `client/src/__tests__/local-assistant.test.js`
- Test: `client/src/__tests__/assistant-rag.test.jsx`

**Interfaces:**
- Consumes: student-owned chunks from Task 3 and a bounded question string.
- Produces: `answerFromLocalChunks({ question, chunks })` returning quoted passages, document/page citations, confidence, and an explicit no-match state; never generated prose.

- [ ] **Step 1: Write failing tests** for ranking, page citations, prompt-injection text treated as quoted evidence, no-match behavior, empty/oversized questions, and absence of all network calls.
- [ ] **Step 2: Run targeted tests;** expect the local interface to be missing.
- [ ] **Step 3: Implement normalized term retrieval and zero-cost Assistant UI** while preserving production assistant behavior.
- [ ] **Step 4: Re-run targeted tests;** expect pass.
- [ ] **Step 5: Commit** with `feat(assistant): add private browser retrieval`.

### Task 5: Reviewed static official-news artifacts

**Files:**
- Create: `server/scripts/build-public-news-artifact.mjs`
- Create: `client/public/data/news.json`
- Create: `client/public/data/coverage.json`
- Create: `client/src/lib/static-news.js`
- Create: `.github/workflows/propose-news-update.yml`
- Modify: `server/package.json`
- Modify: `client/src/lib/news-data.js`
- Test: `server/tests/public-news-artifact.test.js`
- Test: `client/src/__tests__/static-news.test.js`

**Interfaces:**
- Consumes: published source-verified news projections and registered coverage state.
- Produces: deterministic versioned artifacts with `generatedAt`, cadence, content hash, stories, and safe coverage; `subscribeStaticNews(filters, callbacks)` mirrors the existing client subscription shape.

- [ ] **Step 1: Write failing artifact tests** for deterministic ordering, public-field allowlist, canonical official URLs, no generated/unreviewed summaries, stable hash, and bounded size.
- [ ] **Step 2: Write failing client tests** for integrity version, tampering rejection, stale/delayed state, filtering, and no demo fallback.
- [ ] **Step 3: Run targeted tests;** expect missing interfaces.
- [ ] **Step 4: Implement the generator, seed a clearly timestamped reviewed artifact, and add the static client adapter.**
- [ ] **Step 5: Add a least-privilege scheduled workflow** that creates or updates a review PR and has no deployment, Firebase, or write-to-main permission.
- [ ] **Step 6: Run targeted tests and workflow syntax/security checks;** expect pass.
- [ ] **Step 7: Commit** with `feat(news): add reviewed static update feed`.

### Task 6: Zero-cost product wiring and truthful availability

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/pages/DashboardPage.jsx`
- Modify: `client/src/pages/NewsPage.jsx`
- Modify: `client/src/pages/NewsDetailPage.jsx`
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/index.css`
- Test: `client/src/__tests__/zero-cost-journeys.test.jsx`
- Test: `client/src/__tests__/workspace-news.test.jsx`

**Interfaces:**
- Consumes: zero-cost runtime, Task 2 store, Task 3 documents, Task 4 assistant, Task 5 static news.
- Produces: complete signed-in zero-cost user journeys with explicit feature availability and responsive navigation.

- [ ] **Step 1: Write failing journey tests** for orientation, profile/tasks, local documents, cited retrieval, static news, Settings disclosure, and unavailable cloud AI/email/push/file backup.
- [ ] **Step 2: Run targeted tests;** expect failure on missing zero-cost wiring.
- [ ] **Step 3: Wire the runtime through App and pages** without adding dead controls or changing production mode.
- [ ] **Step 4: Run client suite and production/zero-cost builds;** expect pass.
- [ ] **Step 5: Commit** with `feat(client): complete zero-cost public journeys`.

### Task 7: Browser export and safe account deletion

**Files:**
- Create: `client/src/lib/zero-cost-account.js`
- Modify: `client/src/lib/account-deletion.js`
- Modify: `client/src/pages/SettingsPage.jsx`
- Test: `client/src/__tests__/zero-cost-account.test.js`
- Test: `server/tests/firestore-rules-emulator.test.js`

**Interfaces:**
- Consumes: authenticated user, Task 2 data-store collection inventory, Firebase reauthentication/delete APIs.
- Produces: `exportZeroCostAccount()` and `deleteZeroCostAccount()`; cleanup completes before identity deletion and reports retryable partial failure.

- [ ] **Step 1: Write failing tests** for bounded export, content-type-safe download, deletion ordering, reauthentication, partial batch failure, retry, and identity preservation when cleanup fails.
- [ ] **Step 2: Run targeted tests;** expect missing interfaces.
- [ ] **Step 3: Implement export/deletion and Settings UI** without weakening production server deletion.
- [ ] **Step 4: Run targeted client and emulator tests;** expect pass.
- [ ] **Step 5: Commit** with `feat(account): add zero-cost export and deletion`.

### Task 8: Static-host security, deployment workflow, and full verification

**Files:**
- Modify: `firebase.json`
- Create: `.github/workflows/deploy-zero-cost.yml`
- Modify: `.github/workflows/ci.yml`
- Create: `docs/ZERO_COST_PUBLIC.md`
- Modify: `README.md`
- Modify: `docs/RELEASE_READINESS.md`
- Test: `server/tests/zero-cost-hosting.test.js`
- Test: `client/src/__tests__/zero-cost-build.test.js`

**Interfaces:**
- Consumes: completed zero-cost client and Firebase Hosting configuration.
- Produces: preview-first no-cost deployment workflow, hardened headers, exact setup/rollback instructions, and verification evidence.

- [ ] **Step 1: Write failing tests** for CSP, frame/referrer/MIME headers, SPA rewrite, zero-cost build secret scan, artifact budget, and workflow refusal without configured public Firebase identifiers.
- [ ] **Step 2: Run targeted tests;** expect missing configuration.
- [ ] **Step 3: Implement hosting headers, CI gates, preview-first deploy workflow, and operator documentation.** Deployment workflow must use GitHub environment approval for the live channel and must not create or upgrade projects.
- [ ] **Step 4: Run full server, rules, and client suites; both builds; audits; syntax checks; artifact scans; and `git diff --check`.**
- [ ] **Step 5: Run browser verification** at desktop and 390px for authentication, tasks, local document processing, cited retrieval, news, export, deletion confirmation, keyboard focus, and failure states.
- [ ] **Step 6: If existing no-cost Firebase credentials are configured, deploy a preview and verify it. If a console step or billing request appears, stop deployment and record the exact external action remaining.**
- [ ] **Step 7: Request whole-branch review, fix every Critical/Important finding test-first, and re-run all gates.**
- [ ] **Step 8: Commit** with `test: verify zero-cost public beta`.
