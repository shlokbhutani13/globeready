# GlobeReady Reduced Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a nationwide US web application where real international students can follow verified updates, manage deadlines, ask grounded questions about documents, and control their data.

**Architecture:** Keep the existing Express, Firestore, Firebase Auth, React, secure-fetch, and news-sync foundation. Complete its security boundary, then build one shared student workspace, one bounded document/assistant pipeline, and one release-verification package. Use Firestore queries, in-app notifications, and email-ready digest records instead of browser push, vector search, and a separate functions package.

**Tech Stack:** Node.js, Express 5, Firestore/Firebase Auth, React, Vite, Vitest, Testing Library, Firebase Emulator, existing PDF extraction and Gemini adapters.

**Spec:** `docs/superpowers/specs/2026-10-03-globeready-reduced-launch-design.md`

## Global Constraints

- GlobeReady provides general information, not legal advice.
- Immigration and status updates show the official source and freshness.
- Generated explanations and actions stay private until a current-revision, snapshot-bound administrative approval succeeds.
- Disabled, unverified, and verification-pending sources cannot run, including dry runs.
- Public data uses explicit allowlists; user data stays UID-scoped.
- No browser push, service worker, vector migration, separate scheduled-functions package, native app, or automatic legal conclusions.
- Do not deploy, push, contact people, enable live source synchronization, or incur paid usage without explicit approval.

## Review Focus

- Obfuscated links and unsupported relative-time claims in review drafts must fail before publication; Task 1 tests named and numeric entities, whitespace/control folding, and unsupported time phrases.
- A source snapshot from another source or content hash must never approve an item; Task 1 tests exact expected path, hash, commit marker, and revision.
- Source and extraction failures must preserve the last usable student state and disclose uncertainty; Tasks 2 and 3 test delayed-source and retry states.
- Cross-user reads, exports, deletes, notifications, tasks, and documents must fail; Tasks 2 through 4 include two-user tests and emulator coverage.
- A 375-pixel viewport and keyboard-only navigation must retain every primary flow; Task 4 verifies mobile overflow, focus order, labels, and route smoke tests.

---

### Task 1: Complete the secure API boundary

**Files:**
- Create: `server/src/news/official-url.js`
- Create: `server/src/news/approval-policy.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/src/store.js`
- Modify: `server/src/news/schema.js`
- Modify: `server/src/news/sync-news.js`
- Modify: `server/src/routes/news.js`
- Modify: `server/src/routes/admin-news.js`
- Modify: `server/src/routes/profile.js`
- Modify: `firestore.rules`
- Test: `server/tests/news-routes.test.js`
- Test: `server/tests/admin-news-routes.test.js`
- Test: `server/tests/news-sync.test.js`
- Test: `server/tests/news-store.test.js`
- Test: `server/tests/firestore-news-store.test.js`
- Test: `server/tests/firestore-rules-emulator.test.js`

**Interfaces:**
- Consumes: Task 7 API commit `25a766d`, `validateSummaryDraft`, committed snapshot readers, `store.news`, and `store.reviewQueue`.
- Produces: `parseOfficialUrl(value, { allowedSuffixes, maxLength })`, `validateApprovalDraft({ item, review, snapshot })`, `store.news.decideReview(...)`, and an explicit `publicNewsItem(item)` allowlist projection.

- [ ] **Step 1: Preserve the captured RED cases**

Keep tests asserting rejection of entity-obfuscated schemes, unsupported relative time, mismatched snapshot source/hash, split approval/audit writes, private-field detail leakage, disabled stored connectors, invalid DNS labels/oversized URLs, and unresolvable source suggestions.

- [ ] **Step 2: Run the focused tests and verify the captured failures**

Run: `cd server && npm test -- tests/admin-news-routes.test.js tests/news-routes.test.js tests/news-sync.test.js tests/news-store.test.js tests/firestore-news-store.test.js tests/rules.test.js`

Expected before the fix: the 12 recorded security tests fail. If the shared worktree already contains the fix, verify the report retains exact RED evidence and continue from GREEN.

- [ ] **Step 3: Finish the policy and transactional implementation**

Implement strict canonical official URLs; approval-specific source-bound text/action validation; exact snapshot source/hash/path binding; one atomic Firestore/demo decision-plus-audit transaction; explicit public projection; disabled-source rejection; and suggestion-specific resolution that cannot enter news approval.

- [ ] **Step 4: Run focused, full, emulator, and static verification**

Run:

```bash
cd server
npm test -- tests/admin-news-routes.test.js tests/news-routes.test.js tests/news-sync.test.js tests/news-store.test.js tests/firestore-news-store.test.js tests/rules.test.js
npm test
npm run test:rules
npm run lint
find src tests -name '*.js' -print0 | xargs -0 -n1 node --check
npm audit --omit=dev --audit-level=moderate
git -C .. diff --check
```

Expected: all commands pass and the production audit reports zero vulnerabilities.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules server/src server/tests
git commit -m "fix: close news API publication boundaries"
```

### Task 2: Build the unified student workspace

**Files:**
- Create: `client/src/lib/news-data.js`
- Create: `client/src/components/NewsCard.jsx`
- Create: `client/src/components/SourceStatus.jsx`
- Create: `client/src/pages/NewsPage.jsx`
- Create: `client/src/pages/NotificationsPage.jsx`
- Create: `client/src/pages/NewsAdminPage.jsx`
- Modify: `client/src/pages/TasksPage.jsx`
- Modify: `client/src/pages/DashboardPage.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/workspace-news.test.jsx`
- Create: `client/src/__tests__/workspace-plan.test.jsx`
- Create: `client/src/__tests__/workspace-admin.test.jsx`
- Create: `server/src/reminders.js`
- Create: `server/src/news/digest.js`
- Create: `server/tests/reminders.test.js`
- Create: `server/tests/news-digest.test.js`
- Modify: `server/src/app.js`

**Interfaces:**
- Consumes: `GET /api/news`, news detail/save/preferences/suggestion routes, admin review/source routes, existing task routes, profile data, and UID-scoped notification stores.
- Produces: `subscribeNews(filters, handler)`, `saveNews(itemId)`, `updateNewsPreferences(input)`, `createReminderService({ store, clock })`, `buildDigest(items, now, context)`, and responsive `/news`, `/notifications`, `/tasks`, and `/admin/news` routes.

- [ ] **Step 1: Write failing student workspace tests**

Assert official links, legal/effective/freshness labels, source-delayed state, complete-feed preservation with personalized ordering, save behavior, unread notification state, task creation from a suggestion only after confirmation, due-once reminders, and no reminders for completed tasks.

- [ ] **Step 2: Run the focused tests and verify missing modules/components**

Run:

```bash
cd client && npm test -- src/__tests__/workspace-news.test.jsx src/__tests__/workspace-plan.test.jsx src/__tests__/workspace-admin.test.jsx
cd ../server && npm test -- tests/reminders.test.js tests/news-digest.test.js
```

Expected: FAIL because the new workspace modules do not exist.

- [ ] **Step 3: Implement shared news, plan, notification, and admin components**

Use one `NewsCard` and one `SourceStatus` across feed, dashboard, saved items, notifications, and admin previews. Keep generated text inert. Rank university `+8`, visa `+6`, nationality `+5`, topic `+4`, urgent `+3`, and effective within 30 days `+2`, while preserving every eligible item.

- [ ] **Step 4: Implement reminder and digest records without browser push**

`createReminderService` creates one UID-scoped in-app notification per due task using the stored time zone. `buildDigest` produces email-ready sections and metadata but does not contact an email provider.

- [ ] **Step 5: Verify the workspace**

Run the focused tests, full client tests, `npm run build`, full server tests, and server lint. Expected: all pass with no horizontal overflow in the tested 375-pixel layout.

- [ ] **Step 6: Commit**

```bash
git add client/src server/src/reminders.js server/src/news/digest.js server/tests
git commit -m "feat: add the GlobeReady student workspace"
```

### Task 3: Unify documents, assistant, and account controls

**Files:**
- Create: `server/src/document-extraction.js`
- Modify: `server/src/routes/documents.js`
- Modify: `server/src/routes/assistant.js`
- Modify: `server/src/document-assistant.js`
- Modify: `server/src/store.js`
- Modify: `server/src/firestore-store.js`
- Create: `server/src/routes/account.js`
- Create: `server/tests/document-extraction.test.js`
- Create: `server/tests/account-routes.test.js`
- Modify: `server/tests/document-assistant.test.js`
- Modify: `client/src/pages/DocumentsPage.jsx`
- Modify: `client/src/pages/AssistantPage.jsx`
- Modify: `client/src/pages/ProfilePage.jsx`
- Create: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/App.jsx`
- Create: `client/src/__tests__/documents-assistant-account.test.jsx`

**Interfaces:**
- Consumes: existing bounded uploads, PDF extraction, assistant routes, conversation stores, Firebase UID, and profile stores.
- Produces: `extractDocument({ bytes, mimeType, name }) -> { pages, text, warnings }`, bounded Firestore document retrieval, cited assistant answers, `GET /api/account/export`, and confirmed `DELETE /api/account`.

- [ ] **Step 1: Write failing extraction, grounding, export, and deletion tests**

Test PDF page references, supported image extraction through an injected adapter, size/type rejection, preserved retry state, answer citations, refusal of unsupported conclusions, two-user isolation, complete export shape, deletion confirmation, and deletion of every UID-scoped collection.

- [ ] **Step 2: Run focused tests and verify the new interfaces are missing**

Run: `cd server && npm test -- tests/document-extraction.test.js tests/document-assistant.test.js tests/account-routes.test.js && cd ../client && npm test -- src/__tests__/documents-assistant-account.test.jsx`

Expected: FAIL on missing extraction/account modules and UI route.

- [ ] **Step 3: Implement one bounded extraction and retrieval pipeline**

Keep PDF extraction local. Treat image OCR as an injected adapter that fails closed when unconfigured. Store page text under the user's document, retrieve bounded matching pages with deterministic token overlap, and require page/source citations in assistant responses.

- [ ] **Step 4: Implement settings, export, and confirmed deletion**

Export only authenticated-user records in a versioned JSON envelope. Require an exact confirmation phrase and recent authentication marker for deletion. Delete user-owned documents, chunks, conversations/messages, tasks, saves, notifications, preferences, push remnants, and the profile.

- [ ] **Step 5: Verify documents, account safety, and client build**

Run focused and full server/client tests, emulator rules, builds, lint, syntax, and the production dependency audit. Expected: all pass; unconfigured image extraction shows a retryable unavailable state.

- [ ] **Step 6: Commit**

```bash
git add server/src server/tests client/src
git commit -m "feat: complete documents assistant and account controls"
```

### Task 4: Release hardening and end-to-end verification

**Files:**
- Create: `server/tests/student-journey.test.js`
- Create: `client/src/__tests__/accessibility-smoke.test.jsx`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `server/.env.example`
- Modify: `client/.env.example`
- Modify: `firestore.rules`
- Modify: `storage.rules`

**Interfaces:**
- Consumes: the complete Tasks 1–3 API and UI surface.
- Produces: a repeatable CI/release gate and documented disabled-by-default deployment configuration.

- [ ] **Step 1: Write end-to-end student journey and accessibility smoke tests**

Cover registration/profile, personalized and complete news, delayed-source disclosure, save/task/reminder flow, document upload and cited question, export, deletion, admin approval, keyboard navigation, accessible labels, focus order, and 375-pixel overflow.

- [ ] **Step 2: Run the smoke tests and record any failures**

Run: `cd server && npm test -- tests/student-journey.test.js && cd ../client && npm test -- src/__tests__/accessibility-smoke.test.jsx`

Expected: failures identify integration gaps, not missing optional browser-push or vector features.

- [ ] **Step 3: Close integration and rules gaps**

Make only changes required by the journeys. Keep sync, summaries, OCR adapters, and outbound email disabled unless their explicit environment flags and credentials are present.

- [ ] **Step 4: Update CI and deployment documentation**

CI runs server/client tests, Firestore emulator tests, builds, syntax checks, production audits, `git diff --check`, and the journey smoke suite. Documentation lists required secrets, feature flags, data retention, source-health behavior, backup/rollback, and manual approval gates.

- [ ] **Step 5: Run the complete release matrix**

```bash
cd server
npm test
npm run test:rules
npm run lint
find src tests -name '*.js' -print0 | xargs -0 -n1 node --check
npm audit --omit=dev --audit-level=moderate
cd ../client
npm test
npm run build
npm audit --omit=dev --audit-level=moderate
cd ..
git diff --check
```

Expected: every command passes. Do not deploy.

- [ ] **Step 6: Commit**

```bash
git add .github README.md docs server client firestore.rules storage.rules
git commit -m "chore: prepare GlobeReady for release verification"
```
