# GlobeReady Zero-Cost Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete GlobeReady's $0 official-update operations, reviewed publishing, university coverage, product polish, and preview-readiness work without creating external resources.

**Architecture:** Extend the current news collectors and deterministic static-artifact generator with a versioned candidate ledger and review decisions. Keep university coverage in a validated static registry, reuse the current design system for UI corrections, and finish with repository-only release gates and documentation.

**Tech Stack:** Node.js 22, React 18, Vite 8, Vitest 4, Express 5, Firebase emulator tooling, GitHub Actions YAML, JSON static artifacts.

**Spec:** `docs/superpowers/specs/2026-10-14-zero-cost-completion-design.md`

## Global Constraints

- Spend $0 during implementation.
- Do not push, merge, deploy, provision Firebase or Google Cloud resources, create domains, enable billing, or call paid AI services.
- Do not auto-publish legal or status guidance.
- Use official primary sources for update candidates.
- Keep student data outside monitoring and publishing code.
- Do not commit `.claude/`, `.local/`, handoff files, bundles, mboxes, environment files, credentials, or generated secrets.
- Write and observe a failing test before every production behavior change.
- Preserve real Google login, deployed-host checks, and destructive account deletion as deferred live checks.
- Use `NODE_OPTIONS=--no-experimental-webstorage` for client tests on the current local Node runtime.
- Add no runtime dependency; use the current React, Vite, Vitest, Express, and Node standard-library stack.

## Review Focus

- A source succeeds but returns no former item: require repeated successful absence before proposing removal; test in Task 2.
- An official URL redirects off its allowed host: record collection failure and never create a candidate; test in Task 1.
- A reviewer approves a candidate with a missing legal-state or date confirmation: refuse publication; test in Task 3.
- A university link uses HTTPS but leaves the reviewed university's domain: reject it unless it carries the explicit allowed-external reason; test in Task 5.
- A 390 px page contains a maximum-length title and error controls: keep it readable, reachable, and free of horizontal overflow; test in Task 6.

---

### Task 1: Versioned official-source candidate schema

**Files:**
- Create: `server/src/news/review-candidates.js`
- Create: `server/tests/news-review-candidates.test.js`
- Modify: `server/src/news/default-sources.js`
- Modify: `server/tests/news-default-sources.test.js`

**Interfaces:**
- Consumes: existing normalized candidates, source records, `canonicalSourceHostname`, and URL policies.
- Produces: `candidateSchemaVersion`, `candidateFingerprint(item)`, `buildReviewCandidate({ source, current, previous, collectedAt, changeType })`, `validateReviewCandidate(value)`, and source registry fields `status`, `topics`, `visaTypes`, `cadenceHours`, `lastReviewedAt`.

- [ ] **Step 1: Write failing schema and registry tests**

Add tests named:

- `builds a bounded versioned candidate with stable meaningful fingerprint`
- `rejects unknown fields invalid states and oversized evidence`
- `does not change fingerprints for whitespace or tracking parameters`
- `rejects an off-host final URL even when the initial URL is official`
- `declares lifecycle cadence and audience metadata for every monitored source`

Assert schema version `1`, publication state `unreviewed`, deterministic fingerprints, bounded old/new evidence, official HTTPS URLs, exact source status values `active|paused|retired`, and allowed audience tags.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd server && npm test -- tests/news-review-candidates.test.js tests/news-default-sources.test.js`

Expected: FAIL because `review-candidates.js` and the registry metadata do not exist.

- [ ] **Step 3: Implement the schema and source metadata**

Normalize text whitespace and remove only known tracking query parameters before hashing. Validate exact fields, arrays, enums, lengths, ISO timestamps, source IDs, and HTTPS URLs against the source's allowed hosts. Keep full page bodies out of candidates.

- [ ] **Step 4: Run focused tests**

Run: `cd server && npm test -- tests/news-review-candidates.test.js tests/news-default-sources.test.js`

Expected: both files PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/news/review-candidates.js server/src/news/default-sources.js server/tests/news-review-candidates.test.js server/tests/news-default-sources.test.js
git commit -m "feat(news): define official review candidates"
```

### Task 2: Deterministic change ledger and fixture-driven collection

**Files:**
- Create: `server/src/news/change-ledger.js`
- Create: `server/tests/news-change-ledger.test.js`
- Create: `server/tests/fixtures/news-change-ledger/previous.json`
- Create: `server/tests/fixtures/news-change-ledger/current.json`
- Modify: `server/scripts/build-public-news-artifact.mjs`
- Modify: `server/tests/public-news-artifact.test.js`
- Modify: `.github/workflows/propose-news-update.yml`

**Interfaces:**
- Consumes: Task 1 `candidateFingerprint`, `buildReviewCandidate`, `validateReviewCandidate`.
- Produces: `compareSourceSnapshots({ source, previous, current, collectedAt, absenceConfirmations })` returning `{ candidates, nextSnapshot, sourceHealth }`; CLI flags `--snapshot-input`, `--fixture-input`, `--snapshot-output`; deterministic `news-proposals.json` schema version `1`.

- [ ] **Step 1: Write failing change-ledger tests**

Add tests named:

- `classifies new changed redirected and unchanged entries deterministically`
- `requires two successful absences before proposing removal`
- `does not advance removal confirmation on a failed collection`
- `omits previously resolved candidate fingerprints`
- `generates the same proposal artifact from fixture input twice`

Assert stable ordering by source ID then candidate ID, exact field diffs, failure health without removal, and no wall-clock timestamps unless supplied by the caller.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd server && npm test -- tests/news-change-ledger.test.js tests/public-news-artifact.test.js`

Expected: FAIL because the ledger and fixture CLI flags do not exist.

- [ ] **Step 3: Implement change comparison and CLI integration**

Keep the existing Federal Register live discovery path. Route its normalized results and fixture inputs through `compareSourceSnapshots`. Write candidate and snapshot outputs only after validating the complete result. Update the workflow to preserve the candidate artifact and describe additions, edits, redirects, removals, and failures as review-only evidence.

- [ ] **Step 4: Run focused tests and parse workflow YAML**

Run: `cd server && npm test -- tests/news-change-ledger.test.js tests/public-news-artifact.test.js && cd .. && ruby -e 'require "yaml"; YAML.load_file(".github/workflows/propose-news-update.yml", aliases: true)'`

Expected: tests PASS and YAML parser exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/src/news/change-ledger.js server/tests/news-change-ledger.test.js server/tests/fixtures/news-change-ledger server/scripts/build-public-news-artifact.mjs server/tests/public-news-artifact.test.js .github/workflows/propose-news-update.yml
git commit -m "feat(news): detect official source changes"
```

### Task 3: Review decisions and publication boundary

**Files:**
- Create: `server/src/news/review-decisions.js`
- Create: `server/tests/news-review-decisions.test.js`
- Modify: `server/scripts/news-operations.mjs`
- Modify: `server/tests/news-operations-cli.test.js`
- Modify: `server/scripts/build-public-news-artifact.mjs`
- Modify: `server/tests/public-news-artifact.test.js`
- Modify: `server/data/reviewed-public-news.json` only if schema migration adds empty review-history fields to current records.

**Interfaces:**
- Consumes: Task 1 candidate schema and existing news schema, lifecycle, approval, image, and static artifact policies.
- Produces: `reviewDecisionTypes`, `validateReviewDecision(value)`, `applyReviewDecision({ candidate, decision, reviewedItems, clock })`; CLI modes `review`, `reject`, `defer`, `archive`; append-only `reviewHistory` and public `correctionNote` fields.

- [ ] **Step 1: Write failing decision tests**

Add tests named:

- `requires confirmation of source title dates legal state tags and image policy`
- `refuses approval when a required confirmation is absent`
- `keeps rejected and deferred candidates out of public artifacts`
- `preserves item id and appends history for corrections`
- `keeps an archived item discoverable with a public correction note`
- `never copies private reviewer notes into public artifacts`

- [ ] **Step 2: Run tests and verify RED**

Run: `cd server && npm test -- tests/news-review-decisions.test.js tests/news-operations-cli.test.js tests/public-news-artifact.test.js`

Expected: FAIL because review decisions and history do not exist.

- [ ] **Step 3: Implement review decisions and artifact filtering**

Use exact decision schemas with bounded reason codes and notes. Require an explicit boolean confirmation for each reviewed field. Preserve stable public IDs for corrections. Export public correction notes and lifecycle state, but strip candidate evidence, reviewer identity, and private notes.

- [ ] **Step 4: Run focused tests**

Run: `cd server && npm test -- tests/news-review-decisions.test.js tests/news-operations-cli.test.js tests/public-news-artifact.test.js`

Expected: all files PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/news/review-decisions.js server/tests/news-review-decisions.test.js server/scripts/news-operations.mjs server/tests/news-operations-cli.test.js server/scripts/build-public-news-artifact.mjs server/tests/public-news-artifact.test.js server/data/reviewed-public-news.json
git commit -m "feat(news): add human review decisions"
```

### Task 4: Complete news review interface and student correction states

**Files:**
- Create: `client/src/components/NewsReviewQueue.jsx`
- Create: `client/src/components/NewsReviewDetail.jsx`
- Create: `client/src/__tests__/news-review-workspace.test.jsx`
- Modify: `client/src/pages/NewsAdminPage.jsx`
- Modify: `client/src/components/NewsCard.jsx`
- Modify: `client/src/pages/NewsDetailPage.jsx`
- Modify: `client/src/__tests__/workspace-admin.test.jsx`
- Modify: `client/src/__tests__/news-detail.test.jsx`
- Modify: `client/src/lib/news-data.js`

**Interfaces:**
- Consumes: Task 2 candidate artifact and Task 3 decision schema; existing admin authorization and API request helper.
- Produces: filterable `NewsReviewQueue`, evidence-first `NewsReviewDetail`, decision payloads matching Task 3, and student-visible correction/archive labels.

- [ ] **Step 1: Write failing interface tests**

Add tests named:

- `filters candidates by source change type topic visa date and state`
- `shows old and new evidence source health and image provenance`
- `requires every approval confirmation before enabling approve`
- `submits bounded reject defer correction and archive decisions`
- `labels corrected and archived updates without hiding their history`
- `announces loading failure success and validation errors accessibly`

- [ ] **Step 2: Run tests and verify RED**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/news-review-workspace.test.jsx src/__tests__/workspace-admin.test.jsx src/__tests__/news-detail.test.jsx`

Expected: FAIL because the queue, detail view, and decision controls do not exist.

- [ ] **Step 3: Implement the review workspace**

Split list and detail responsibilities into the two new components. Do not infer approval from viewing a candidate. Keep the existing admin guard. Student views show only public reviewed metadata and local topic fallback images when no reviewed image exists.

- [ ] **Step 4: Run focused tests**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/news-review-workspace.test.jsx src/__tests__/workspace-admin.test.jsx src/__tests__/news-detail.test.jsx`

Expected: all files PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/NewsReviewQueue.jsx client/src/components/NewsReviewDetail.jsx client/src/__tests__/news-review-workspace.test.jsx client/src/pages/NewsAdminPage.jsx client/src/components/NewsCard.jsx client/src/pages/NewsDetailPage.jsx client/src/__tests__/workspace-admin.test.jsx client/src/__tests__/news-detail.test.jsx client/src/lib/news-data.js
git commit -m "feat(news): complete the review workspace"
```

### Task 5: Validated university coverage registry

**Files:**
- Create: `client/src/lib/university-registry.js`
- Create: `client/src/__tests__/university-registry.test.js`
- Create: `server/scripts/validate-university-coverage.mjs`
- Create: `server/tests/university-coverage-artifact.test.js`
- Modify: `client/src/data/university-coverage.js`
- Modify: `client/src/lib/university.js`
- Modify: `client/src/pages/UniversityPage.jsx`
- Modify: `client/src/__tests__/applies-university.test.js`
- Modify: `client/src/__tests__/workspace-news.test.jsx`
- Modify: `server/package.json`

**Interfaces:**
- Consumes: reviewed university JSON-compatible entries and the student's profile university/domain.
- Produces: `validateUniversityRegistry(entries, now)`, `coverageForUniversity(profile, registry)`, CLI `npm run university:validate`, and exact coverage states `reviewed|general-only|none`.

- [ ] **Step 1: Write failing registry and UI tests**

Add tests named:

- `accepts exact reviewed university fields and office types`
- `rejects duplicate ids invalid domains dates and oversized values`
- `rejects off-domain links without an allowed external reason`
- `labels reviewed generated and student-entered links separately`
- `uses general resources when no official domain exists`
- `does not treat federal relevance as university review`

- [ ] **Step 2: Run tests and verify RED**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/university-registry.test.js src/__tests__/applies-university.test.js src/__tests__/workspace-news.test.jsx`

Expected: FAIL because registry validation and exact provenance behavior do not exist.

- [ ] **Step 3: Implement registry validation and coverage behavior**

Keep the production registry empty unless the repository already contains independently verified official links. Use fixture entries in tests. Require HTTPS, normalized domains, real calendar dates, known office types, bounded strings, and an explicit `allowedExternalReason` for approved off-domain official systems.

- [ ] **Step 4: Run client and server registry tests**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/university-registry.test.js src/__tests__/applies-university.test.js src/__tests__/workspace-news.test.jsx && cd ../server && npm test -- tests/university-coverage-artifact.test.js && npm run university:validate`

Expected: all tests PASS and validation exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/university-registry.js client/src/__tests__/university-registry.test.js server/scripts/validate-university-coverage.mjs server/tests/university-coverage-artifact.test.js client/src/data/university-coverage.js client/src/lib/university.js client/src/pages/UniversityPage.jsx client/src/__tests__/applies-university.test.js client/src/__tests__/workspace-news.test.jsx server/package.json
git commit -m "feat(university): validate reviewed coverage"
```

### Task 6: Product-wide navigation, state, and accessibility polish

**Files:**
- Create: `client/src/__tests__/product-polish.test.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/components/PageHelp.jsx`
- Modify: `client/src/components/ui/Notice.jsx` if status semantics require it.
- Modify: `client/src/design-system.css`
- Modify: `client/src/index.css`
- Modify: affected files under `client/src/pages/` only when a failing audit assertion identifies a missing state, dead control, inconsistent label, or layout defect.
- Modify: `client/src/__tests__/a11y-structure.test.jsx`
- Modify: `client/src/__tests__/app-shell.test.jsx`
- Record: browser verification results in `docs/RELEASE_READINESS.md`; the earlier Batch 4 and Batch 5 responsive harness was not committed.

**Interfaces:**
- Consumes: existing routes, page help data, design tokens, test fixtures, and all student-facing pages.
- Produces: consistent desktop/mobile navigation labels, one-h1 page contract, standard loading/empty/error/offline states, and responsive check coverage for every route.

- [ ] **Step 1: Write failing product-contract tests**

Add assertions for:

- identical desktop and mobile group labels;
- one `h1` and a visible purpose/help affordance per primary page;
- retry actions for failed remote content;
- no enabled control without an observable action;
- provenance terms `Reviewed by GlobeReady`, `Entered by you`, and `Not reviewed`;
- maximum-length news title and error controls at the 390 px fixture;
- visible focus, status roles, and reduced-motion CSS.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/product-polish.test.jsx src/__tests__/a11y-structure.test.jsx src/__tests__/app-shell.test.jsx`

Expected: FAIL with the specific missing states or inconsistent labels found by the audit.

- [ ] **Step 3: Apply only test-supported UI corrections**

Keep the existing white, neutral, blue, and sage tokens. Consolidate repeated state markup into existing UI primitives when possible. Avoid route restructuring, decorative redesign, new dashboards, or unrelated copy changes.

- [ ] **Step 4: Run focused and responsive checks**

Run: `cd client && NODE_OPTIONS=--no-experimental-webstorage npm test -- --run src/__tests__/product-polish.test.jsx src/__tests__/a11y-structure.test.jsx src/__tests__/app-shell.test.jsx`

Then use the available browser automation against the running local-user app at 390 px and 1280 px. Visit every route in the accessibility structure matrix and evaluate `document.documentElement.scrollWidth <= window.innerWidth`, exactly one `h1`, and every visible interactive element's bounding box being at least 44 px in both dimensions unless it is an inline text link.

Expected: focused tests PASS; every route has no overflow, one `h1`, and no target smaller than 44 px.

- [ ] **Step 5: Commit**

```bash
git add client/src client/package.json
git commit -m "fix(ui): finish zero-cost product polish"
```

Before committing, inspect `git diff --cached --name-only` and unstage any generated build output or unrelated file.

### Task 7: Release gates, operations documentation, and full verification

**Files:**
- Create: `docs/NEWS_REVIEW_OPERATIONS.md`
- Create: `docs/UNIVERSITY_COVERAGE.md`
- Modify: `docs/ZERO_COST_PUBLIC.md`
- Modify: `docs/PRIVACY.md`
- Modify: `docs/RELEASE_READINESS.md`
- Modify: `docs/V1_SCOPE.md`
- Modify: `.github/workflows/ci.yml`
- Modify: relevant artifact/workflow tests under `server/tests/`.

**Interfaces:**
- Consumes: Tasks 1-6 commands and artifacts.
- Produces: one reproducible local release checklist, CI checks for deterministic candidates and university registry validity, and an explicit deferred-live checklist.

- [ ] **Step 1: Write failing release-contract tests**

Add tests that assert CI runs fixture-based candidate generation and `university:validate`, public artifacts exclude unreviewed/private fields, workflow permissions stay minimal, and documentation names every deferred live check from the spec.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd server && npm test -- tests/public-news-artifact.test.js tests/news-operations-cli.test.js tests/university-coverage-artifact.test.js`

Expected: FAIL because CI commands and completion documentation are absent.

- [ ] **Step 3: Add gates and documentation**

Document the candidate-to-publication path, university review procedure, rollback, free Firebase provisioning boundary, and deferred paid/live checks. CI must use fixtures and must not contact official sites.

- [ ] **Step 4: Run the complete repository verification matrix**

Run in order:

```bash
cd client && NODE_OPTIONS=--no-experimental-webstorage npm test
cd client && npm run build
cd client && npm run build -- --mode zero-cost-public
cd client && npm audit --omit=dev --audit-level=moderate
cd server && npm run lint
find server/src server/scripts \( -name '*.js' -o -name '*.mjs' \) -print0 | xargs -0 -n1 node --check
find scripts -name '*.sh' -print0 | xargs -0 -n1 bash -n
cd server && npm test
cd server && npm run university:validate
cd server && npm audit --omit=dev --audit-level=moderate
git diff --check
```

Run `npm run test:rules` only if the implementation changed Firebase rules, account behavior, or the zero-cost store contract.

Expected: every command exits 0. Record exact test counts and any skipped tests. Confirm the local-user app still returns HTTP 200 without restarting it.

- [ ] **Step 5: Verify repository boundaries**

Run:

```bash
git status --short
git diff --name-only origin/main...HEAD
git rev-parse origin/main
git log --oneline --decorate -15
```

Expected: no forbidden file is tracked; `origin/main` remains `2e405fafb117abd772ec91c407c0003488f8f811`; no merge commit, deployment file with credentials, or generated secret exists.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml docs server/tests
git commit -m "docs: complete zero-cost release readiness"
```

Before committing, inspect the staged list and exclude unrelated or deferred artifacts.

### Task 8: Whole-branch review and one fix pass

**Files:**
- Modify: only files required for Critical or Important findings, each with a new regression test.
- Record: the execution ledger created by `superpowers:executing-plans` or `superpowers:subagent-driven-development`.

**Interfaces:**
- Consumes: the complete branch, this plan, its spec, and all ledger rulings.
- Produces: a review package, severity-graded findings, one test-first fix pass, and a final local checkpoint.

- [ ] **Step 1: Generate the whole-branch review package**

Use the execution skill's `review-package` command with the plan, `origin/main` merge base, and final `HEAD`.

Expected: package includes the spec, plan, diff, test evidence, Review Focus, and rulings.

- [ ] **Step 2: Run one fresh whole-branch review**

Use the most capable available reviewer as required by the selected execution method. Re-grade findings by user impact. Record all declined-to-judge items as rulings.

Expected: findings sorted into Critical, Important, Minor, and rulings.

- [ ] **Step 3: Fix Critical and Important findings with RED to GREEN tests**

For each accepted finding, add the smallest reproducing test, observe failure, implement the fix, and run the affected suite. Perform one combined fix pass; do not re-review.

- [ ] **Step 4: Re-run the complete Task 7 verification matrix**

Expected: every command exits 0 with recorded counts.

- [ ] **Step 5: Commit review fixes if any**

```bash
git add <only reviewed fixes and their tests>
git commit -m "fix: address zero-cost completion review"
```

If no fix is required, create no empty commit.

- [ ] **Step 6: Stop at the local checkpoint**

Report completed features, commits, verification evidence, rulings, deferred minors, and all paid/live deferrals. Do not push, merge, deploy, or begin provisioning.
