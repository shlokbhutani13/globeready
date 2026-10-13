# News and Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a visual, source-transparent news reader with complete archive search, detailed cited explanations, deterministic local stories, and simple first-use navigation guidance.

**Architecture:** Extend the existing published-news contract and store query without replacing the current trust pipeline. Compose the client from focused reader, toolbar, archive, detail, explanation, and orientation components; keep AI optional and grounded in published evidence. Enable additional live sources only after their adapter contracts pass existing fail-closed verification.

**Tech Stack:** React 19, React Router, Vite, Express, Firebase/Firestore, Vitest, Testing Library, existing Gemini/local retrieval providers.

**Spec:** `docs/superpowers/specs/2026-10-13-news-and-orientation-design.md`

## Global Constraints

- Official-source-first; every published story must retain an approved publisher and official URL.
- AI explains stored published evidence and must not invent news or individualized legal conclusions.
- Images must come from allowlisted official metadata or bundled neutral fallbacks.
- Existing news items remain backward-compatible.
- Manual story navigation is the default; autoplay is optional and reduced-motion-safe.
- Empty and delayed coverage states must remain truthful.
- Do not deploy, enable billing, buy a domain, or create production/cloud resources.
- Preserve the white/slate professional responsive interface and 44-pixel touch targets.

## Review Focus

- A malformed image URL, redirect, private host, oversized response, or unsupported MIME type must be rejected and replaced with category artwork; covered by Task 2 image-policy tests.
- A search phrase combined with date, classification, source, pagination, and saved state must produce deterministic non-duplicated results; covered by Task 3 route/store tests.
- Existing published stories missing all new optional fields must still render and open safely; covered by Tasks 1, 4, and 5 compatibility tests.
- Autoplay must pause for reduced motion, hidden tabs, focus/hover, and manual interaction without trapping keyboard focus; covered by Task 4 component tests.
- AI outage, missing citations, or insufficient evidence must leave the verified article usable and show an explicit safe state; covered by Task 6 route/component tests.

---

### Task 1: Extend the published news contract

**Files:**
- Modify: `server/src/news/schema.js`
- Modify: `server/src/store.js`
- Modify: `server/src/firestore-store.js`
- Test: `server/tests/news-schema.test.js`
- Test: `server/tests/news-store.test.js`
- Test: `server/tests/firestore-news-store.test.js`

**Interfaces:**
- Consumes: existing news ingestion objects and `publicNewsItem(item)`.
- Produces: backward-compatible public fields `shortSummary`, `whyItMatters`, `detailSections`, `image`, `publishedAt`, `verifiedAt`, and normalized `searchText`.

- [ ] **Step 1: Write failing schema tests** for bounded text lengths, canonical timestamps, sanitized detail sections, safe optional image metadata, and legacy items without new fields.
- [ ] **Step 2: Run `cd server && npm test -- --run tests/news-schema.test.js`** and confirm the new assertions fail.
- [ ] **Step 3: Extend schema validation and `publicNewsItem(item)`** with the exact optional fields above; reject unknown nested image/detail keys and preserve legacy inputs.
- [ ] **Step 4: Write failing memory and Firestore store tests** asserting new fields survive create, update, revision, list, and public projection paths.
- [ ] **Step 5: Update both stores** so normalization, persistence, and revisions preserve the new contract without changing publication gates.
- [ ] **Step 6: Run the three targeted test files** and confirm they pass.
- [ ] **Step 7: Commit** with `feat(news): extend published story contract`.

### Task 2: Validate and represent official story images

**Files:**
- Create: `server/src/news/image-policy.js`
- Modify: `server/src/news/adapters/federal-register.js`
- Modify: `server/src/news/sync-news.js`
- Create: `server/tests/news-image-policy.test.js`
- Modify: `server/tests/federal-register-adapter.test.js`
- Create: `client/src/assets/news/general.svg`
- Create: `client/src/assets/news/employment.svg`
- Create: `client/src/assets/news/travel-entry.svg`
- Create: `client/src/assets/news/forms-fees.svg`

**Interfaces:**
- Consumes: candidate `{ url, alt, sourceUrl, attribution }`, registered source allowlists, and adapter output.
- Produces: `validateNewsImage(candidate, source): NewsImage | null` and client-side topic fallbacks.

- [ ] **Step 1: Write failing image-policy tests** for HTTPS, credentials, fragments, private IPs, unapproved hosts/redirect targets, excessive field lengths, invalid MIME intent, and valid allowlisted metadata.
- [ ] **Step 2: Run `cd server && npm test -- --run tests/news-image-policy.test.js`** and confirm failure.
- [ ] **Step 3: Implement `validateNewsImage(candidate, source)`** using existing canonical URL/host policy helpers and a fail-closed `null` result.
- [ ] **Step 4: Extend the Federal Register fixture/adapter test** to preserve a valid official image when supplied and omit invalid metadata.
- [ ] **Step 5: Apply validation in sync before storage** and add deterministic bundled SVG category artwork for items without approved images.
- [ ] **Step 6: Run image, adapter, fetch, and sync tests** and confirm they pass.
- [ ] **Step 7: Commit** with `feat(news): add safe story imagery`.

### Task 3: Add complete archive search and filters

**Files:**
- Modify: `server/src/routes/news.js`
- Modify: `server/src/store.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/tests/news-routes.test.js`
- Modify: `server/tests/news-store.test.js`
- Modify: `server/tests/firestore-news-store.test.js`
- Modify: `client/src/lib/news-data.js`
- Modify: `client/src/App.jsx`

**Interfaces:**
- Consumes: query parameters `q`, `sourceId`, `from`, `to`, `topic`, `visaType`, `universityId`, `legalState`, `saved`, `limit`, and `cursor`.
- Produces: deterministic `{ items, nextCursor, sourceHealth }`; `subscribeNews(filters, onData, onError)` serializes every supported filter.

- [ ] **Step 1: Write failing route tests** for combined filters, ISO date validation, bounded 120-character search, saved-only authentication, unknown parameters, and stable cursor pagination.
- [ ] **Step 2: Write failing memory/Firestore store tests** for normalized token matching, inclusive date ranges, combined source/classification filters, ordering, and no duplicates across pages.
- [ ] **Step 3: Run targeted route/store tests** and verify the new cases fail.
- [ ] **Step 4: Extend `parseFilters` and store query contracts** with the exact inputs above; use normalized published content and deterministic published-time/id ordering.
- [ ] **Step 5: Extend `subscribeNews` and App query state** so URL-backed filters survive reload and retry.
- [ ] **Step 6: Run route, store, Firestore index coverage, and client API-contract tests** and confirm they pass.
- [ ] **Step 7: Commit** with `feat(news): add archive search and date filters`.

### Task 4: Build the visual Top Stories reader and archive toolbar

**Files:**
- Create: `client/src/components/TopStoriesReader.jsx`
- Create: `client/src/components/NewsToolbar.jsx`
- Create: `client/src/components/NewsArchive.jsx`
- Create: `client/src/lib/news-images.js`
- Modify: `client/src/components/NewsCard.jsx`
- Modify: `client/src/pages/NewsPage.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/top-stories-reader.test.jsx`
- Modify: `client/src/__tests__/workspace-news.test.jsx`

**Interfaces:**
- Consumes: ranked public news items, filter state, saved IDs, and callbacks for save, detail, explanation, retry, and pagination.
- Produces: accessible `TopStoriesReader`, `NewsToolbar`, and `NewsArchive` components; `newsImageFor(item)` returns approved image or bundled fallback with alt text.

- [ ] **Step 1: Write failing reader tests** for previous/next, position, keyboard arrows, swipe threshold, optional Play/Pause, hover/focus/manual pause, hidden document, reduced motion, broken-image fallback, and legacy item rendering.
- [ ] **Step 2: Write failing NewsPage tests** for search plus week/month/year/all/custom/source/topic/legal-state controls, reset, empty reasons, source visibility, and Load more.
- [ ] **Step 3: Run the two client test files** and confirm failure.
- [ ] **Step 4: Implement `newsImageFor`, `TopStoriesReader`, `NewsToolbar`, and `NewsArchive`** with manual-first navigation and URL-backed controls.
- [ ] **Step 5: Refactor `NewsPage` and `NewsCard`** to compose those components while retaining coverage, preferences, digests, saving, and disclaimers.
- [ ] **Step 6: Add responsive white/slate styling** with stable image aspect ratios, visible focus, 44-pixel controls, single-card mobile layout, and no layout shift.
- [ ] **Step 7: Run client tests and production build** and confirm both pass.
- [ ] **Step 8: Commit** with `feat(client): add visual news reader and archive`.

### Task 5: Add detailed story routes

**Files:**
- Create: `client/src/pages/NewsDetailPage.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/lib/news-data.js`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/news-detail.test.jsx`
- Modify: `server/tests/news-routes.test.js`

**Interfaces:**
- Consumes: `GET /api/news/:id`, existing save endpoints, and public detail fields from Task 1.
- Produces: route `/news/:id`, `fetchNewsItem(id)`, full verified detail, related-story links, official source actions, and legacy fallbacks.

- [ ] **Step 1: Write failing client tests** for all detail sections, dates, affected groups, revision/verification metadata, source links, image fallback, saving, legacy stories, loading, 404, and retry.
- [ ] **Step 2: Add route tests** ensuring only published public fields are returned and invalid/unpublished IDs remain 404.
- [ ] **Step 3: Run targeted tests** and confirm the new client behavior fails.
- [ ] **Step 4: Implement `fetchNewsItem(id)` and `NewsDetailPage`** and register `/news/:id` without breaking `/news`.
- [ ] **Step 5: Link reader/archive cards to detail** and style a readable responsive article layout.
- [ ] **Step 6: Run client and news route suites** and confirm they pass.
- [ ] **Step 7: Commit** with `feat(news): add verified story details`.

### Task 6: Add grounded AI story explanations

**Files:**
- Create: `server/src/news/explain-news.js`
- Modify: `server/src/routes/news.js`
- Modify: `server/src/app.js`
- Create: `server/tests/news-explanation.test.js`
- Create: `client/src/components/NewsExplanation.jsx`
- Modify: `client/src/pages/NewsDetailPage.jsx`
- Modify: `client/src/lib/news-data.js`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/news-explanation.test.jsx`

**Interfaces:**
- Consumes: `explainPublishedNews({ item, profile, question, provider })` with bounded safe profile fields and already-published evidence.
- Produces: `POST /api/news/:id/explain` returning `{ facts, relevance, questions, uncertainty, sources, disclaimer }` and a cited client panel.

- [ ] **Step 1: Write failing server tests** for published-only access, bounded question/profile context, citation enforcement, insufficient evidence, provider outage, invented URL rejection, and rate limiting.
- [ ] **Step 2: Run the server test** and verify failure.
- [ ] **Step 3: Implement `explainPublishedNews` and the route** by reusing the grounded provider boundary; fail safely when citations do not match stored official evidence.
- [ ] **Step 4: Write failing client tests** for open/close, optional question, cited sections, loading, outage, insufficient evidence, and persistent access to the underlying article.
- [ ] **Step 5: Implement `NewsExplanation` and client request helper** with no automatic AI call on page load.
- [ ] **Step 6: Run explanation, AI guardrail, assistant, and client tests** and confirm they pass.
- [ ] **Step 7: Commit** with `feat(news): add grounded story explanations`.

### Task 7: Add the simple Getting Started board

**Files:**
- Create: `client/src/components/GettingStartedBoard.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/getting-started.test.jsx`
- Modify: `client/src/lib/student-data.js`
- Modify: `server/src/routes/users.js`
- Test: `server/tests/routes.test.js`

**Interfaces:**
- Consumes: per-user `gettingStartedDismissedAt`, navigation callback, and authenticated user state.
- Produces: non-modal five-destination board, `dismissGettingStarted()`, and reopen entry in Help/Settings.

- [ ] **Step 1: Write failing client tests** for first display, five concise destinations, direct navigation, dismissal, persistence, non-blocking behavior, and reopening.
- [ ] **Step 2: Write failing route test** for a bounded authenticated preference update that cannot mutate unrelated user fields.
- [ ] **Step 3: Run targeted tests** and confirm failure.
- [ ] **Step 4: Implement preference persistence and client helper** following existing per-user storage patterns.
- [ ] **Step 5: Implement `GettingStartedBoard`** on the authenticated home surface and add a permanent Help/Settings reopen action.
- [ ] **Step 6: Add restrained responsive styling** without overlays, coach marks, or forced sequencing.
- [ ] **Step 7: Run client, server route, authorization, and rules tests** and confirm they pass.
- [ ] **Step 8: Commit** with `feat(client): add simple product orientation`.

### Task 8: Seed local stories, verify coverage, and finish the phase

**Files:**
- Create: `scripts/local-user/fixtures/news.json`
- Modify: `scripts/local-user/seed.mjs`
- Modify: `server/tests/local-user-mode.test.js`
- Modify: `client/src/__tests__/runtime-mode.test.jsx`
- Modify: `README.md`
- Modify: `docs/PRODUCTION_READINESS.md`

**Interfaces:**
- Consumes: the final public news contract and local-user seeding lifecycle.
- Produces: deterministic local top stories covering images/fallbacks, detail, legal states, dates, source transparency, and AI safe-state behavior.

- [ ] **Step 1: Write failing local-user tests** asserting seeded published stories appear through `/api/news`, can be filtered/searched, open in detail, and never claim live synchronization.
- [ ] **Step 2: Run the targeted local-user tests** and confirm failure.
- [ ] **Step 3: Add deterministic official-looking sample fixtures clearly labeled local sample data** and seed them idempotently.
- [ ] **Step 4: Update operational documentation** with current enabled/pending sources, sync requirements, image policy, explanation boundary, and honest production prerequisites.
- [ ] **Step 5: Run client tests/build, full server suite, emulator/rules suite, dependency audits, and `git diff --check`**; require all checks to pass.
- [ ] **Step 6: Run responsive browser verification** for login, home orientation, top stories, archive filtering, detail, explanation failure/success fixtures, keyboard focus, mobile layout, and broken images.
- [ ] **Step 7: Confirm local-user services remain running and no cloud/deployment resources were created.**
- [ ] **Step 8: Commit** with `test: verify news and orientation experience`.

