# GlobeReady Zero-Cost Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the production-relevant update, coverage, digest, university onboarding, and operations capabilities that can be built and verified locally without creating or paying for external infrastructure.

**Architecture:** Extend the existing source registry, stores, synchronization service, authenticated APIs, and React Updates workspace. New operational services are provider-neutral and disabled by default; live source access, outbound email, scheduling, deployment, billing, and domains remain external provisioning work.

**Tech Stack:** Node.js 22, Express 5, React 18, Vite, Firebase Admin/Web SDKs, Firestore/Auth/Storage emulators, Vitest, Testing Library, Docker.

**Spec:** `docs/superpowers/specs/2026-10-13-globeready-zero-cost-completion-design.md`

## Global Constraints

- Total infrastructure cost remains $0 during this plan.
- Do not deploy, create cloud resources, attach billing, purchase a domain, create provider credentials, or send email.
- Work only on `codex/globeready-platform`; do not modify or merge `main` and do not push without explicit approval.
- Keep `.claude/`, `.local/`, credentials, emulator exports, and runtime data untracked.
- Fail closed for unverified sources, malformed provider configuration, stale approvals, and unsupported lifecycle transitions.
- Local-user mode shows synthetic updates and performs no automatic live-source or email activity.
- Personalization may order and select digest entries but must never hide the complete federal feed.
- Student-facing coverage claims must be exact, source-backed, and freshness-aware.

## Review Focus

- A source that has never succeeded, has stale success, or recently failed must not be described as actively monitored.
- Public coverage responses must not leak snapshots, selectors, secrets, reviewer identity, private notes, or internal hashes.
- Replayed scheduler invocations must not duplicate update mutations, digest records, or delivery attempts.
- A correction, withdrawal, or supersession may be proposed automatically but cannot alter a published item without an audited administrator decision.
- Disabled email delivery must still create usable in-app digest records and must never report an email as sent.

---

### Task 1: Safe coverage ledger

**Files:**
- Create: `server/src/news/coverage-ledger.js`
- Create: `server/tests/news-coverage-ledger.test.js`
- Modify: `server/src/routes/news.js`
- Modify: `server/src/routes/admin-news.js`
- Modify: `server/tests/news-coverage-routes.test.js`
- Modify: `server/tests/admin-news-routes.test.js`

**Interfaces:**
- Consumes: `mergedSources(registeredSources, storedSources)` and source/run records already exposed by the stores.
- Produces: `buildCoverageLedger({ sources, runs, now }) -> { summary, entries }`.
- Produces: `publicCoverageLedger(ledger)` and `adminCoverageLedger(ledger)` projections.
- Produces: authenticated `GET /api/news/coverage` and admin `GET /api/admin/news/coverage`.

- [ ] **Step 1: Write failing ledger tests**

Test literal outcomes for active, pending, disabled, delayed, failing, and never-successful sources. Assert the public projection contains publisher, authority, jurisdiction, topics, university ID, status, cadence, last success, and safe reason, while excluding internal configuration and review fields.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd server && npx vitest run tests/news-coverage-ledger.test.js tests/news-coverage-routes.test.js tests/admin-news-routes.test.js`

Expected: FAIL because the ledger module and routes do not exist.

- [ ] **Step 3: Implement deterministic ledger construction and projections**

Use explicit allowlists for public and administrator fields. Derive status from verified/enabled state, latest run, last success, cadence, and pending reason. Never spread stored source objects into a response.

- [ ] **Step 4: Add and verify authenticated routes**

The student route returns the public ledger. The administrator route returns the expanded operational projection behind existing admin authentication.

- [ ] **Step 5: Run focused and complete server tests**

Run: `cd server && npx vitest run tests/news-coverage-ledger.test.js tests/news-coverage-routes.test.js tests/admin-news-routes.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/news/coverage-ledger.js server/src/routes/news.js server/src/routes/admin-news.js server/tests/news-coverage-ledger.test.js server/tests/news-coverage-routes.test.js server/tests/admin-news-routes.test.js
git commit -m "feat: expose honest update coverage ledger"
```

### Task 2: University source onboarding lifecycle

**Files:**
- Create: `server/src/news/source-onboarding.js`
- Create: `server/tests/news-source-onboarding.test.js`
- Modify: `server/src/routes/admin-news.js`
- Modify: `server/tests/admin-news-routes.test.js`
- Modify: `server/src/routes/news.js`
- Modify: `server/tests/news-coverage-routes.test.js`

**Interfaces:**
- Produces: `onboardingStates` closed set.
- Produces: `validateOnboardingTransition(current, next) -> normalized record`.
- Produces: admin `PATCH /api/admin/news/sources/:id/onboarding`.
- Consumes: existing `newsSources` store and source-suggestion review flow.

- [ ] **Step 1: Write failing transition and authorization tests**

Cover proposed → verifying → verified-disabled → enabled, rejection, delayed operational state, illegal skips, missing official domain, missing robots decision, missing fixture contract, and non-admin refusal.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd server && npx vitest run tests/news-source-onboarding.test.js tests/admin-news-routes.test.js`

Expected: FAIL because the onboarding module and route are missing.

- [ ] **Step 3: Implement the closed transition validator**

Require official domain, source URL, adapter type, robots result, parser-contract version, cadence, topics, and decision metadata before `verified-disabled`; require existing verification before `enabled`.

- [ ] **Step 4: Implement the audited administrator mutation**

Persist normalized onboarding data in the existing source record. Emit the existing structured admin audit event without recording fixtures, notes, or secrets.

- [ ] **Step 5: Surface onboarding state through safe coverage projections**

Student responses expose only the coverage state and safe reason. Administrator responses expose checklist completion and operational state.

- [ ] **Step 6: Run focused and complete server tests**

Run: `cd server && npx vitest run tests/news-source-onboarding.test.js tests/admin-news-routes.test.js tests/news-coverage-routes.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/news/source-onboarding.js server/src/routes/admin-news.js server/src/routes/news.js server/tests/news-source-onboarding.test.js server/tests/admin-news-routes.test.js server/tests/news-coverage-routes.test.js
git commit -m "feat: add verified university source onboarding"
```

### Task 3: Corrections, withdrawals, and supersession

**Files:**
- Modify: `server/src/news/schema.js`
- Create: `server/src/news/lifecycle.js`
- Create: `server/tests/news-lifecycle.test.js`
- Modify: `server/src/news/sync-news.js`
- Modify: `server/tests/news-sync.test.js`
- Modify: `server/src/routes/admin-news.js`
- Modify: `server/tests/admin-news-routes.test.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/src/store.js`

**Interfaces:**
- Produces: `updateLifecycleStates` closed set: `current`, `corrected`, `superseded`, `withdrawn`.
- Produces: `proposeLifecycleRelation(candidate, existingItems) -> review candidate | null`.
- Produces: atomic administrator lifecycle decision through the existing review route.

- [ ] **Step 1: Write failing lifecycle and public-projection tests**

Assert invalid/self/circular references fail, source mismatches fail, automatic synchronization only creates a review candidate, and public items expose only approved lifecycle state and official replacement identifiers.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd server && npx vitest run tests/news-lifecycle.test.js tests/news-sync.test.js tests/admin-news-routes.test.js`

Expected: FAIL because lifecycle validation and review decisions are missing.

- [ ] **Step 3: Implement lifecycle validation and proposals**

Use stable item IDs, same-source or explicitly related official references, acyclic links, and administrator-controlled publication state.

- [ ] **Step 4: Make the decision atomic and audited in both stores**

Update the affected public item(s), resolve the review, and append the audit in one transaction for Firestore and one indivisible operation for the demo store.

- [ ] **Step 5: Run focused, store, and full server suites**

Run: `cd server && npx vitest run tests/news-lifecycle.test.js tests/news-sync.test.js tests/admin-news-routes.test.js tests/firestore-news-store.test.js tests/news-store.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/news/schema.js server/src/news/lifecycle.js server/src/news/sync-news.js server/src/routes/admin-news.js server/src/firestore-store.js server/src/store.js server/tests/news-lifecycle.test.js server/tests/news-sync.test.js server/tests/admin-news-routes.test.js server/tests/firestore-news-store.test.js server/tests/news-store.test.js
git commit -m "feat: review update corrections and supersession"
```

### Task 4: Idempotent local operations runner and cleanup

**Files:**
- Create: `server/src/jobs/news-operations.js`
- Create: `server/scripts/news-operations.mjs`
- Create: `server/tests/news-operations.test.js`
- Create: `server/tests/news-operations-cli.test.js`
- Modify: `server/src/news/snapshots.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/src/store.js`
- Modify: `server/package.json`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `createNewsOperations({ sync, store, clock })` with `run({ operationId, dryRun, sourceIds, limit, cleanup })`.
- Produces: `npm run news:operations -- --dry-run --source=<id> --limit=<1..20>`.
- Produces: snapshot-store `listExpired(before, limit)` and `deleteExpired(path)` operations.

- [ ] **Step 1: Write failing idempotency, bounds, cleanup, and no-network tests**

Cover replayed operation IDs, default dry run, write refusal without explicit enablement, source and limit validation, expired snapshot deletion, bounded batches, and structured summaries that exclude private content.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd server && npx vitest run tests/news-operations.test.js tests/news-operations-cli.test.js`

Expected: FAIL because the operations service and CLI are missing.

- [ ] **Step 3: Implement the service and store cleanup interfaces**

Record operation IDs in the store before mutation, return the prior summary on replay, and cap every source and cleanup batch. Keep dry run side-effect free.

- [ ] **Step 4: Implement the CLI**

`--help` and dry-run fixture mode must work without credentials or network. A live source run requires explicit configuration and must fail closed otherwise.

- [ ] **Step 5: Run focused and full server suites**

Run: `cd server && npx vitest run tests/news-operations.test.js tests/news-operations-cli.test.js && npm run news:operations -- --help && npm test`

Expected: tests pass and help exits zero without contacting a source.

- [ ] **Step 6: Commit**

```bash
git add server/src/jobs/news-operations.js server/scripts/news-operations.mjs server/src/news/snapshots.js server/src/firestore-store.js server/src/store.js server/tests/news-operations.test.js server/tests/news-operations-cli.test.js server/package.json server/.env.example
git commit -m "feat: add bounded update operations runner"
```

### Task 5: Digests and disabled-by-default email outbox

**Files:**
- Modify: `server/src/news/digest.js`
- Create: `server/src/news/digest-service.js`
- Create: `server/src/email/delivery.js`
- Create: `server/src/email/render-digest.js`
- Create: `server/tests/news-digest-service.test.js`
- Create: `server/tests/email-delivery.test.js`
- Create: `server/tests/email-render-digest.test.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/src/store.js`
- Modify: `server/src/routes/news.js`
- Modify: `server/tests/news-routes.test.js`

**Interfaces:**
- Produces: `createDigestService({ store, delivery, clock })` with `generateForUser(uid, { periodStart, periodEnd })`.
- Produces: `createDisabledEmailDelivery()` and provider-neutral `deliver(message)` contract.
- Produces: `renderDigestEmail(digest) -> { subject, text, html }` with allowlisted HTTPS links.
- Produces: authenticated digest history and preference endpoints under `/api/news/digests`.

- [ ] **Step 1: Write failing digest behavior tests**

Cover daily/weekly/off, urgent/upcoming/university/saved/coverage-warning groups, full-feed availability, stable idempotency key, and no duplicate digest records.

- [ ] **Step 2: Write failing delivery and rendering tests**

Cover disabled provider state, no outgoing call, retryable/permanent result shapes, unsubscribe, safe official links, escaped source text, and no tracking pixels.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `cd server && npx vitest run tests/news-digest-service.test.js tests/email-delivery.test.js tests/email-render-digest.test.js tests/news-routes.test.js`

Expected: FAIL because the service, renderer, delivery interface, stores, and routes are missing.

- [ ] **Step 4: Implement digest records and the disabled delivery boundary**

Persist in-app digest records first. Delivery remains `disabled` unless a later provisioning phase injects a provider; it never claims `sent` without a successful provider result.

- [ ] **Step 5: Implement history and preference APIs**

Return only the caller's records. Honor `off` and explicit unsubscribe state.

- [ ] **Step 6: Run focused and complete server suites**

Run: `cd server && npx vitest run tests/news-digest.test.js tests/news-digest-service.test.js tests/email-delivery.test.js tests/email-render-digest.test.js tests/news-routes.test.js && npm test`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/news/digest.js server/src/news/digest-service.js server/src/email/delivery.js server/src/email/render-digest.js server/src/firestore-store.js server/src/store.js server/src/routes/news.js server/tests/news-digest-service.test.js server/tests/email-delivery.test.js server/tests/email-render-digest.test.js server/tests/news-routes.test.js
git commit -m "feat: prepare safe update digests and email outbox"
```

### Task 6: Student and administrator coverage experience

**Files:**
- Create: `client/src/components/CoverageLedger.jsx`
- Create: `client/src/components/UpdateLifecycle.jsx`
- Create: `client/src/components/DigestSettings.jsx`
- Create: `client/src/__tests__/coverage-ledger.test.jsx`
- Create: `client/src/__tests__/digest-settings.test.jsx`
- Modify: `client/src/lib/news-data.js`
- Modify: `client/src/pages/NewsPage.jsx`
- Modify: `client/src/pages/NewsAdminPage.jsx`
- Modify: `client/src/components/NewsCard.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`

**Interfaces:**
- Consumes: `/api/news/coverage`, `/api/admin/news/coverage`, lifecycle fields on public items, and digest preference/history APIs.
- Produces: accessible student coverage details, lifecycle badges, digest controls, and administrator operational status/checklist views.

- [ ] **Step 1: Write failing student UI tests**

Cover active/pending/delayed/not-covered copy, last-success display, no misleading “all updates” claim, correction/withdrawal/supersession rendering, digest frequency, email-disabled disclosure, and keyboard-accessible details.

- [ ] **Step 2: Write failing administrator UI tests**

Cover onboarding checklist, failure count, next check, contract version, last run outcome, and safe reasons without private fields.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `cd client && npx vitest run --environment=jsdom src/__tests__/coverage-ledger.test.jsx src/__tests__/digest-settings.test.jsx src/__tests__/workspace-admin.test.jsx src/__tests__/workspace-news.test.jsx`

Expected: FAIL because the new components and API calls are missing.

- [ ] **Step 4: Implement data calls and accessible components**

Follow existing card/status patterns. Keep the primary navigation unchanged and place detailed coverage within Updates and administration.

- [ ] **Step 5: Run focused and complete client verification**

Run: `cd client && npx vitest run --environment=jsdom src/__tests__/coverage-ledger.test.jsx src/__tests__/digest-settings.test.jsx src/__tests__/workspace-admin.test.jsx src/__tests__/workspace-news.test.jsx && npm test && npm run build`

Expected: all tests and production build pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/CoverageLedger.jsx client/src/components/UpdateLifecycle.jsx client/src/components/DigestSettings.jsx client/src/__tests__/coverage-ledger.test.jsx client/src/__tests__/digest-settings.test.jsx client/src/lib/news-data.js client/src/pages/NewsPage.jsx client/src/pages/NewsAdminPage.jsx client/src/components/NewsCard.jsx client/src/App.jsx client/src/index.css
git commit -m "feat(client): show coverage and digest truthfully"
```

### Task 7: Release documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/V1_SCOPE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/RELEASE_READINESS.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/DATA_POLICY.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `server/tests/launch-journeys.test.js`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: accurate operator documentation, CI gates, and final zero-cost completion evidence.

- [ ] **Step 1: Add failing end-to-end journey cases**

Cover coverage disclosures, a delayed source, a lifecycle correction, digest preferences/history, email-disabled truthfulness, and university verification status using local stores/emulators only.

- [ ] **Step 2: Run the journey tests and verify RED**

Run: `cd server && npx vitest run tests/launch-journeys.test.js`

Expected: at least one new journey fails until all composed interfaces are wired.

- [ ] **Step 3: Complete integration wiring and CI gates**

Add fixture-based operations and digest tests to CI. CI must not need secrets, network source access, paid services, or deployment credentials.

- [ ] **Step 4: Update documentation against actual behavior**

Record active source counts, disabled/pending sources, local synthetic behavior, digest/email state, deferred provisioning, start/stop commands, privacy implications, and remaining limitations. Do not claim live scheduling or comprehensive coverage.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
cd server
npm test
npm run lint
npm run test:rules
npm audit --omit=dev --audit-level=moderate
cd ../client
npm test
npm run build
npm audit --omit=dev --audit-level=moderate
cd ..
git diff --check
```

Then build the production image, run `scripts/release/container-extraction-check.mjs`, run `scripts/release/docker-fail-closed.sh`, scan for high/critical vulnerabilities, and inspect the image for `.local`, `.claude`, `.git`, credentials, emulator exports, and test artifacts.

Expected: every gate passes; no paid or external resource is contacted.

- [ ] **Step 6: Perform local browser verification**

Using the existing local-user environment, verify student and administrator coverage, synthetic update labels, lifecycle display, digest settings/history, existing profile/tasks/documents/assistant flows, sign-out, and persistence restart.

- [ ] **Step 7: Commit the completion checkpoint**

```bash
git add README.md docs .github/workflows/ci.yml server/tests/launch-journeys.test.js
git commit -m "docs: record zero-cost completion evidence"
```

- [ ] **Step 8: Independent whole-branch review**

Review the range from `cc12f97` through the completion HEAD against the spec, plan, security boundaries, and test evidence. Fix Critical or Important findings with a new failing test followed by the full affected suite. Record Minor findings as explicit follow-ups.

