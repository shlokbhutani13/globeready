# GlobeReady Continuous Updates and Product Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verified, continuously refreshed U.S. international-student news system and complete GlobeReady's tasks, dashboard, guides, assistant history, OCR, notifications, and vector retrieval.

**Architecture:** A scheduler-neutral ingestion service polls verified official sources through isolated adapters, normalizes and versions notices, and publishes official source data under a review-aware state machine. Firebase stores global news and user-scoped preferences, notifications, conversations, tasks, documents, and vectors; the React client presents personalized news and completed productivity workflows while the Express API owns privileged ingestion, review, OCR, and retrieval operations.

**Tech Stack:** Node.js 22, Express 5, React 18, Vite 8, Firebase Authentication, Firestore, Storage, Firebase Cloud Messaging, Google Gen AI, Google Document AI, Vitest, Testing Library, Supertest, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-12-globeready-continuous-updates-and-product-design.md`

## Global Constraints

- Scope covers international students in the United States, with F, M, and J as primary visa categories.
- Global news writes require Firebase Admin; clients may read only `published-source-only` or `approved` items.
- High-impact generated summaries never publish without an approval audit record.
- Official source-only cards may publish immediately from verified domains.
- Source fetching uses HTTPS, verified domains, redirect validation, private-network blocking, a 10-second timeout, and a 5 MB limit.
- University excerpts are limited to 500 characters and private snapshots expire after 90 days.
- Browser push requires explicit consent and sends only approved urgent items.
- OCR remains disabled unless `DOCUMENT_OCR_ENABLED=true` and `DOCUMENT_AI_PROCESSOR_NAME` is configured.
- No deployment, billing activation, production migration, or real notification sending occurs without explicit user approval.
- Write every production behavior test-first and observe the expected failure before implementation.

---

## File map

### Server news subsystem

- `server/src/news/schema.js`: enums, validators, normalization, and public projections.
- `server/src/news/url-policy.js`: verified-domain URL and redirect safety.
- `server/src/news/fetch-source.js`: bounded conditional HTTP fetching.
- `server/src/news/adapters/federal-register.js`: Federal Register JSON adapter.
- `server/src/news/adapters/feed.js`: RSS and Atom adapter.
- `server/src/news/adapters/index-page.js`: official index-page adapter.
- `server/src/news/adapters/university-sitemap.js`: same-domain university discovery.
- `server/src/news/classifier.js`: deterministic relevance and high-impact classification plus optional Gemini drafts.
- `server/src/news/summarizer.js`: schema-constrained Gemini draft summaries with source-bound date and URL validation.
- `server/src/news/snapshots.js`: private normalized-source snapshots and 90-day retention cleanup.
- `server/src/news/sync-news.js`: leases, deduplication, revisions, publication policy, and run health.
- `server/src/news/digest.js`: personalized matching and digest creation.
- `server/src/news/push.js`: opt-in FCM delivery interface.
- `server/src/reminders.js`: due task and effective-date notification generation.
- `server/src/routes/news.js`: authenticated user news routes.
- `server/src/routes/admin-news.js`: source management and review routes.
- `server/src/routes/internal-news.js`: scheduler-authenticated synchronization.
- `server/src/jobs/sync-news.js`: command-line entry point.
- `server/src/news/default-sources.js`: initial verified federal source registry.

### Server product completion

- `server/src/task-model.js`: task validation and calendar serialization.
- `server/src/routes/conversations.js`: conversation and message persistence.
- `server/src/routes/account.js`: authenticated workspace export and deletion.
- `server/src/document-extractors.js`: embedded-text and Document AI OCR adapters.
- `server/src/firestore-vector-store.js`: Firestore nearest-neighbor retrieval.
- `server/src/migrations/migrate-rag-vectors.js`: dry-run-first embedding migration.

### Client

- `client/src/pages/NewsPage.jsx`: feed, filters, coverage, and detail panel.
- `client/src/pages/NewsAdminPage.jsx`: source health and review queue.
- `client/src/pages/NotificationsPage.jsx`: in-app inbox and push preferences.
- `client/src/pages/SettingsPage.jsx`: preferences, data export, and destructive account controls.
- `client/src/components/NewsCard.jsx`: legal and editorial status presentation.
- `client/src/components/TaskEditor.jsx`: complete task create/edit form.
- `client/src/lib/news-data.js`: Firestore/API subscriptions and preference mutations.
- `client/src/lib/readiness.js`: readiness score and recommendation selection.
- `client/src/lib/calendar.js`: `.ics` and Google Calendar links.
- `client/src/lib/conversations.js`: conversation API access.
- `client/public/firebase-messaging-sw.js`: FCM background handler.

### Configuration and documentation

- `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `firebase.json`: access control and indexes.
- `.github/workflows/ci.yml`: tests, audits, build, and Docker image verification.
- `.github/workflows/news-source-contract.yml`: scheduled fixture and source-contract verification.
- `functions/package.json`, `functions/index.js`: disabled-by-default Firebase scheduled invocation wrapper.
- `DEPLOYMENT.md`, `SECURITY.md`, `README.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`, `docs/ROADMAP.md`: operational contract.

---

### Task 1: News domain model and in-memory stores

**Files:**
- Create: `server/src/news/schema.js`
- Modify: `server/src/store.js`
- Test: `server/tests/news-schema.test.js`
- Test: `server/tests/news-store.test.js`

**Interfaces:**
- Produces: `normalizeNewsCandidate(candidate, source)`, `publicNewsItem(item)`, `isPublished(item)`, `createDemoStore().news`, `newsSources`, `newsRuns`, `reviewQueue`, `newsPreferences`, `savedNews`, `notifications`, `conversationMessages`.
- `news.upsert(sourceKey, input)` returns `{ item, created, changed }`.
- `news.listPublished(filters)` returns public-safe items sorted by urgency then publication date.

- [ ] **Step 1: Write failing schema tests**

```js
test("normalizes a verified official candidate", () => {
  const item = normalizeNewsCandidate({
    externalId: "2026-14439",
    canonicalUrl: "https://www.federalregister.gov/d/2026-14439",
    title: " Fixed admission periods ",
    publisher: "Department of Homeland Security",
    publishedAt: "2026-07-17",
    updatedAt: null,
    effectiveAt: "2026-09-15",
    sourceDocumentType: "Rule",
    docketNumber: "ICEB-2025-0001",
    regulationIdNumber: "1653-AA95",
    excerpt: "Official summary",
    normalizedText: "Official summary",
  }, { id: "federal-register", verified: true });

  expect(item).toMatchObject({
    sourceKey: "federal-register:2026-14439",
    title: "Fixed admission periods",
    documentType: "final-rule",
    legalState: "final",
    editorialState: "published-source-only",
  });
});

test("public projection removes normalized source text and hashes", () => {
  expect(publicNewsItem({ editorialState: "approved", normalizedText: "private", contentHash: "abc", title: "Visible" }))
    .toEqual(expect.objectContaining({ title: "Visible" }));
  expect(publicNewsItem({ editorialState: "approved", normalizedText: "private", contentHash: "abc" }))
    .not.toHaveProperty("normalizedText");
});
```

- [ ] **Step 2: Run schema tests and verify missing-module failure**

Run: `cd server && npm test -- tests/news-schema.test.js`

Expected: FAIL because `src/news/schema.js` does not exist.

- [ ] **Step 3: Implement the closed schema and public projection**

```js
export const documentTypes = new Set(["notice", "proposed-rule", "final-rule", "guidance", "policy-update", "form-change", "fee-change", "court-update", "emergency", "university-notice", "correction"]);
export const legalStates = new Set(["proposed", "final", "scheduled", "effective", "delayed", "enjoined", "superseded", "withdrawn", "expired", "informational"]);
export const editorialStates = new Set(["imported", "published-source-only", "review-required", "approved", "rejected", "archived"]);

export function isPublished(item) {
  return item?.editorialState === "published-source-only" || item?.editorialState === "approved";
}

export function publicNewsItem(item) {
  const { normalizedText, contentHash, classifierExplanation, ...safe } = item;
  return safe;
}
```

Complete `normalizeNewsCandidate` with trimmed fields, ISO-date validation, a 500-character excerpt, deterministic document-type mapping, and `sourceId:externalId` source keys.

- [ ] **Step 4: Write failing store tests**

```js
test("deduplicates unchanged news and versions changed news", async () => {
  const store = createDemoStore();
  const first = await store.news.upsert("agency:item-1", { title: "Rule", contentHash: "one", editorialState: "published-source-only" });
  const same = await store.news.upsert("agency:item-1", { title: "Rule", contentHash: "one", editorialState: "published-source-only" });
  const changed = await store.news.upsert("agency:item-1", { title: "Rule corrected", contentHash: "two", editorialState: "review-required" });

  expect(first.created).toBe(true);
  expect(same).toMatchObject({ created: false, changed: false });
  expect(changed).toMatchObject({ created: false, changed: true });
  expect(await store.news.revisions(first.item.id)).toHaveLength(1);
});
```

- [ ] **Step 5: Run store tests and verify the missing-store failure**

Run: `cd server && npm test -- tests/news-store.test.js`

Expected: FAIL because `store.news` is undefined.

- [ ] **Step 6: Add reusable global and user-scoped in-memory collections**

Implement `createGlobalCollection()` and extend `createDemoStore()` with the interfaces listed above. Store a revision before replacing changed news, preserve IDs across revisions, and keep every user-scoped collection isolated by UID.

- [ ] **Step 7: Run news model and existing store tests**

Run: `cd server && npm test -- tests/news-schema.test.js tests/news-store.test.js tests/store.test.js`

Expected: PASS.

- [ ] **Step 8: Commit the domain slice**

```bash
git add server/src/news/schema.js server/src/store.js server/tests/news-schema.test.js server/tests/news-store.test.js
git commit -m "feat: add verified news domain model"
```

### Task 2: Secure source fetching

**Files:**
- Create: `server/src/news/url-policy.js`
- Create: `server/src/news/fetch-source.js`
- Test: `server/tests/news-url-policy.test.js`
- Test: `server/tests/news-fetch.test.js`

**Interfaces:**
- Produces: `assertAllowedSourceUrl(value, source)`, `fetchSource(source, { fetchImpl, resolveHost })`.
- `fetchSource` returns `{ status, finalUrl, contentType, text, etag, lastModified, notModified }`.

- [ ] **Step 1: Write URL-policy tests for SSRF and redirects**

```js
test.each([
  "http://www.uscis.gov/newsroom/all-news",
  "https://127.0.0.1/admin",
  "https://169.254.169.254/latest/meta-data",
  "https://user:pass@www.uscis.gov/news",
])("rejects unsafe source URL %s", async (url) => {
  await expect(assertAllowedSourceUrl(url, { allowedHosts: ["www.uscis.gov"] })).rejects.toThrow();
});

test("accepts an exact verified host", async () => {
  await expect(assertAllowedSourceUrl("https://www.uscis.gov/newsroom/all-news", { allowedHosts: ["www.uscis.gov"] }))
    .resolves.toBeTruthy();
});
```

- [ ] **Step 2: Run the URL tests and verify failure**

Run: `cd server && npm test -- tests/news-url-policy.test.js`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement URL validation**

Use `node:dns/promises` lookup with `{ all: true }`. Reject non-HTTPS protocols, credentials, ports other than 443, hostnames outside `allowedHosts`, IPv4 private/link-local/loopback/reserved ranges, IPv6 loopback/link-local/unique-local ranges, and any redirect whose resolved URL fails the same checks.

- [ ] **Step 4: Write bounded-fetch tests**

```js
test("uses conditional headers and handles 304", async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
  const result = await fetchSource({
    url: "https://www.uscis.gov/newsroom/all-news",
    allowedHosts: ["www.uscis.gov"], etag: '"abc"', lastModified: "Mon, 01 Sep 2026 00:00:00 GMT",
  }, { fetchImpl, resolveHost: async () => [{ address: "23.1.1.1", family: 4 }] });
  expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({ "If-None-Match": '"abc"' });
  expect(result.notModified).toBe(true);
});

test("rejects responses above five megabytes", async () => {
  const headers = new Headers({ "content-type": "text/html", "content-length": String(5 * 1024 * 1024 + 1) });
  await expect(fetchSource({ url: "https://www.uscis.gov/news", allowedHosts: ["www.uscis.gov"] }, {
    fetchImpl: async () => new Response("x", { status: 200, headers }),
    resolveHost: async () => [{ address: "23.1.1.1", family: 4 }],
  })).rejects.toThrow(/large/i);
});
```

- [ ] **Step 5: Run fetch tests and verify failure**

Run: `cd server && npm test -- tests/news-fetch.test.js`

Expected: FAIL because `fetchSource` does not exist.

- [ ] **Step 6: Implement bounded conditional fetch**

Use `AbortSignal.timeout(10_000)`, `redirect: "manual"`, at most three validated redirects, accepted MIME types from the source record, a streaming byte counter capped at `5 * 1024 * 1024`, and the user agent `GlobeReadySourceMonitor/1.0 (+https://globe-ready.web.app/)`.

- [ ] **Step 7: Run source-security tests**

Run: `cd server && npm test -- tests/news-url-policy.test.js tests/news-fetch.test.js`

Expected: PASS.

- [ ] **Step 8: Commit secure fetching**

```bash
git add server/src/news/url-policy.js server/src/news/fetch-source.js server/tests/news-url-policy.test.js server/tests/news-fetch.test.js
git commit -m "feat: secure official source fetching"
```

### Task 3: Federal Register adapter

**Files:**
- Create: `server/src/news/adapters/federal-register.js`
- Create: `server/tests/fixtures/federal-register-results.json`
- Test: `server/tests/federal-register-adapter.test.js`

**Interfaces:**
- Produces: `createFederalRegisterAdapter({ fetchJson, now })` with `collect(source): Promise<SourceCandidate[]>`.
- Consumes: the `SourceCandidate` contract from Task 1.

- [ ] **Step 1: Add a minimal official-format fixture**

Store a two-result JSON fixture containing document `2026-14439` with `type: "Rule"`, `publication_date: "2026-07-17"`, `effective_on: "2026-09-15"`, DHS agency metadata, docket `ICEB-2025-0001`, RIN `1653-AA95`, abstract, HTML URL, and PDF URL; include a non-student EPA record to exercise later relevance filtering.

- [ ] **Step 2: Write the failing adapter test**

```js
test("maps Federal Register fields without inventing dates", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/federal-register-results.json", import.meta.url)));
  const adapter = createFederalRegisterAdapter({ fetchJson: async () => fixture, now: () => new Date("2026-09-12T00:00:00Z") });
  const [candidate] = await adapter.collect({ id: "federal-register", agencies: ["homeland-security-department"] });
  expect(candidate).toMatchObject({
    externalId: "2026-14439",
    publishedAt: "2026-07-17",
    effectiveAt: "2026-09-15",
    docketNumber: "ICEB-2025-0001",
    regulationIdNumber: "1653-AA95",
  });
});
```

- [ ] **Step 3: Run the adapter test and verify failure**

Run: `cd server && npm test -- tests/federal-register-adapter.test.js`

Expected: FAIL because the adapter is missing.

- [ ] **Step 4: Implement query construction and mapping**

Build requests against `https://www.federalregister.gov/api/v1/documents.json` with agency slugs, publication-date lower bound, `per_page=100`, and explicit fields. Follow `next_page_url` for at most five pages. Set missing dates to `null`; never derive `effectiveAt` from `publication_date`.

- [ ] **Step 5: Run the Federal Register test**

Run: `cd server && npm test -- tests/federal-register-adapter.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the adapter**

```bash
git add server/src/news/adapters/federal-register.js server/tests/fixtures/federal-register-results.json server/tests/federal-register-adapter.test.js
git commit -m "feat: ingest Federal Register notices"
```

### Task 4: Feed, index-page, and university adapters

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/src/news/adapters/feed.js`
- Create: `server/src/news/adapters/index-page.js`
- Create: `server/src/news/adapters/university-sitemap.js`
- Create: `server/tests/fixtures/agency-feed.xml`
- Create: `server/tests/fixtures/agency-index.html`
- Create: `server/tests/fixtures/university-sitemap.xml`
- Test: `server/tests/news-adapters.test.js`

**Interfaces:**
- Produces three adapters with `collect(source, fetched): Promise<SourceCandidate[]>`.
- University discovery returns candidates only from the configured registrable `.edu` domain and records discovered feed/index URLs separately from news candidates.

- [ ] **Step 1: Add parser dependencies**

Run: `cd server && npm install fast-xml-parser@^5.2.5 cheerio@^1.1.2`

Expected: `package.json` and lockfile contain exact compatible ranges and `npm audit` reports no vulnerabilities.

- [ ] **Step 2: Add RSS, Atom, HTML, and sitemap fixtures**

The feed fixture contains one USCIS-style alert with GUID, canonical URL, title, description, publication date, and updated date. The HTML fixture contains two dated links and unrelated navigation. The sitemap fixture contains international-office, registrar-calendar, athletics, and external URLs so the test can prove filtering.

- [ ] **Step 3: Write failing adapter tests**

```js
test("parses RSS and removes markup from excerpts", async () => {
  const candidates = await createFeedAdapter().collect(source, rssText);
  expect(candidates[0]).toMatchObject({ externalId: "alert-7", title: "F-1 filing update" });
  expect(candidates[0].excerpt).not.toMatch(/<p>/);
});

test("university discovery keeps relevant same-domain URLs", async () => {
  const result = await createUniversitySitemapAdapter().discover({ officialDomain: "example.edu" }, sitemapText);
  expect(result.urls).toEqual([
    "https://international.example.edu/news",
    "https://registrar.example.edu/academic-calendar",
  ]);
});
```

- [ ] **Step 4: Run adapter tests and verify failure**

Run: `cd server && npm test -- tests/news-adapters.test.js`

Expected: FAIL because the adapters are missing.

- [ ] **Step 5: Implement deterministic parsing**

Use `fast-xml-parser` for feeds and sitemaps and `cheerio` for index pages. Normalize whitespace, limit excerpts to 500 characters, use canonical or absolute URLs, reject unsupported dates as `null`, ignore navigation, and apply the approved university keyword list.

- [ ] **Step 6: Run adapter and audit checks**

Run: `cd server && npm test -- tests/news-adapters.test.js && npm audit`

Expected: PASS and zero vulnerabilities.

- [ ] **Step 7: Commit the adapters**

```bash
git add server/package.json server/package-lock.json server/src/news/adapters server/tests/fixtures server/tests/news-adapters.test.js
git commit -m "feat: add agency and university source adapters"
```

### Task 5: Classification, publication gates, and synchronization

**Files:**
- Create: `server/src/news/classifier.js`
- Create: `server/src/news/summarizer.js`
- Create: `server/src/news/snapshots.js`
- Create: `server/src/news/sync-news.js`
- Create: `server/src/news/default-sources.js`
- Test: `server/tests/news-classifier.test.js`
- Test: `server/tests/news-summarizer.test.js`
- Test: `server/tests/news-snapshots.test.js`
- Test: `server/tests/news-sync.test.js`

**Interfaces:**
- Produces: `classifyCandidate(candidate)`, `isHighImpact(classification)`, `createNewsSync({ store, adapters, fetchSource, classifier, clock })`.
- Produces: `createNewsSummarizer({ generate })` and `createSnapshotStore({ bucket, clock, retentionDays: 90 })`.
- `syncSource(sourceId, { dryRun })` returns `{ candidates, created, changed, unchanged, reviewRequired, errors, estimatedWrites }`.

- [ ] **Step 1: Write failing classification tests**

```js
test.each([
  ["F-1 grace period reduced to 30 days", "status", true],
  ["New Form I-765 edition and filing fee", "forms-fees", true],
  ["International office welcome picnic", "campus-life", false],
])("classifies %s", (title, topic, highImpact) => {
  expect(classifyCandidate({ title, excerpt: title })).toMatchObject({ topic, highImpact });
});

test("labels a final rule from source metadata", () => {
  expect(classifyCandidate({ sourceDocumentType: "Rule", title: "Fixed admission periods", effectiveAt: "2026-09-15" }))
    .toMatchObject({ documentType: "final-rule", legalState: "scheduled" });
});
```

- [ ] **Step 2: Run classifier tests and verify failure**

Run: `cd server && npm test -- tests/news-classifier.test.js`

Expected: FAIL because the classifier is missing.

- [ ] **Step 3: Implement deterministic classification**

Define closed keyword maps for visa types, topics, high-impact concepts, and legal-state phrases. Prefer source metadata over title text. Compare `effectiveAt` with the injected clock to choose `scheduled` or `effective`. Return `confidence`, `matchedTerms`, and `needsHumanReview`.

- [ ] **Step 4: Write failing synchronization tests**

Before the synchronization tests, write `news-summarizer.test.js` cases proving that generated URLs outside the verified registry, dates absent from source material, unknown enum values, and malformed JSON all return a review-only failure. Write `news-snapshots.test.js` cases proving snapshots use `news-source-snapshots/<sourceId>/<contentHash>.txt`, never become public, and cleanup deletes only objects older than 90 days that are not retained by a legal-state revision.

- [ ] **Step 5: Run summarizer and snapshot tests and verify failure**

Run: `cd server && npm test -- tests/news-summarizer.test.js tests/news-snapshots.test.js`

Expected: FAIL because the modules do not exist.

- [ ] **Step 6: Implement source-bound summaries and private snapshots**

Validate generated JSON against the closed schema without coercing unknown values. Extract every ISO date and URL from the summary and reject values absent from the candidate or verified-domain registry. Write normalized snapshots to the admin bucket with `Cache-Control: private, no-store` and retention metadata; expose cleanup through `snapshotStore.removeExpired({ retainHashes })`.

- [ ] **Step 7: Write failing synchronization tests**

```js
test("publishes verified high-impact source data and withholds generated summary", async () => {
  const result = await sync.syncSource("federal-register");
  const [item] = await store.news.listPublished({});
  expect(result.reviewRequired).toBe(1);
  expect(item).toMatchObject({ editorialState: "published-source-only", plainLanguageSummary: "" });
  expect(await store.reviewQueue.listGlobal()).toHaveLength(1);
});

test("dry run reports writes without changing the store", async () => {
  const result = await sync.syncSource("federal-register", { dryRun: true });
  expect(result.estimatedWrites).toBeGreaterThan(0);
  expect(await store.news.listPublished({})).toEqual([]);
});
```

- [ ] **Step 8: Run sync tests and verify failure**

Run: `cd server && npm test -- tests/news-sync.test.js`

Expected: FAIL because `createNewsSync` is missing.

- [ ] **Step 9: Implement idempotent source synchronization**

Acquire `news-source:<sourceId>` through `store.leases.acquire(key, owner, expiresAt)`. Fetch, adapt, normalize, classify, hash, store a private snapshot, upsert, create review records, and record run metrics. Preserve prior items on error. Release leases in `finally`. Use the default registry for Federal Register, USCIS, ICE/SEVP, Study in the States, State visa news and RSS, CBP, IRS, SSA, Labor, and White House sources.

- [ ] **Step 10: Run synchronization tests**

Run: `cd server && npm test -- tests/news-classifier.test.js tests/news-summarizer.test.js tests/news-snapshots.test.js tests/news-sync.test.js`

Expected: PASS.

- [ ] **Step 11: Commit synchronization**

```bash
git add server/src/news/classifier.js server/src/news/summarizer.js server/src/news/snapshots.js server/src/news/sync-news.js server/src/news/default-sources.js server/tests/news-classifier.test.js server/tests/news-summarizer.test.js server/tests/news-snapshots.test.js server/tests/news-sync.test.js
git commit -m "feat: synchronize verified student updates"
```

### Task 6: Firestore news persistence, rules, and indexes

**Files:**
- Modify: `server/src/firestore-store.js`
- Modify: `firestore.rules`
- Create: `firestore.indexes.json`
- Modify: `firebase.json`
- Test: `server/tests/firestore-news-store.test.js`
- Modify: `server/tests/rules.test.js`

**Interfaces:**
- Produces Firestore implementations matching every Task 1 store interface.
- Global reads accept `{ topic, visaType, universityId, legalState, limit, cursor }` and return a stable cursor.

- [ ] **Step 1: Write failing Firestore store tests with a fake Firestore adapter**

Test stable IDs, revision subcollections, merge-safe source health, user-scoped saved news, notification unread state, lease contention, and cursor ordering. Assert that news storage never writes `undefined` values.

- [ ] **Step 2: Run Firestore tests and verify failure**

Run: `cd server && npm test -- tests/firestore-news-store.test.js`

Expected: FAIL because `createFirestoreStore` lacks the global interfaces.

- [ ] **Step 3: Implement focused Firestore stores**

Extract `globalCollectionStore`, `newsItemStore`, `leaseStore`, and `userCollectionStore` inside `firestore-store.js`. Use transactions for leases and news upserts. Use batches for revision plus current-item writes. Convert Firestore timestamps to ISO strings at API boundaries.

- [ ] **Step 4: Write failing rule assertions**

```js
expect(rules).toMatch(/match \/newsItems\/\{newsItemId\}/);
expect(rules).toMatch(/published-source-only/);
expect(rules).toMatch(/approved/);
expect(rules).toMatch(/allow write: if false/);
expect(rules).toMatch(/match \/reviewQueue\/\{document=\*\*\}/);
```

- [ ] **Step 5: Run rule tests and verify failure**

Run: `cd server && npm test -- tests/rules.test.js`

Expected: FAIL until global news and privileged collection rules exist.

- [ ] **Step 6: Add global read and server-only write rules**

Allow public reads of `newsItems` only for published editorial states. Deny all client writes. Deny all client access to revisions, sources, runs, leases, and review queue. Add user-owned rules for preferences, saved news, notifications, conversations, messages, and push subscriptions.

- [ ] **Step 7: Add composite and vector index declarations**

Declare news indexes for `editorialState + publishedAt`, `editorialState + urgency + publishedAt`, `topics array-contains + publishedAt`, and `universityIds array-contains + publishedAt`. Add the RAG vector index for the embedding field and document pre-filter according to the current Firebase CLI schema.

- [ ] **Step 8: Run store and rule tests**

Run: `cd server && npm test -- tests/firestore-news-store.test.js tests/rules.test.js`

Expected: PASS.

- [ ] **Step 9: Commit persistence and rules**

```bash
git add server/src/firestore-store.js server/tests/firestore-news-store.test.js server/tests/rules.test.js firestore.rules firestore.indexes.json firebase.json
git commit -m "feat: persist public news with protected provenance"
```

### Task 7: User, admin, and scheduler APIs

**Files:**
- Create: `server/src/admin-auth.js`
- Create: `server/src/routes/news.js`
- Create: `server/src/routes/admin-news.js`
- Create: `server/src/routes/internal-news.js`
- Modify: `server/src/app.js`
- Modify: `server/src/index.js`
- Modify: `server/.env.example`
- Test: `server/tests/news-routes.test.js`
- Test: `server/tests/admin-news-routes.test.js`

**Interfaces:**
- Produces the API surface from the approved spec.
- `createAdminMiddleware({ adminUids })` accepts an `admin` token claim or configured UID.
- `createSchedulerMiddleware(secret)` uses timing-safe secret comparison.

- [ ] **Step 1: Write failing user-route tests**

```js
test("lists published news and saves an item per user", async () => {
  const item = (await store.news.upsert("source:1", publishedItem)).item;
  const list = await demo("get", "/api/news?topic=employment").expect(200);
  expect(list.body.data.items[0].id).toBe(item.id);
  await demo("post", `/api/news/${item.id}/save`).expect(201);
  expect(await store.savedNews.list("student-a")).toHaveLength(1);
});
```

- [ ] **Step 2: Run user-route tests and verify 404 failure**

Run: `cd server && npm test -- tests/news-routes.test.js`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement authenticated news routes**

Validate closed filter values, enforce a maximum page size of 50, return cursor metadata, save only existing published items, and restrict preferences to supported visa types, ISO country codes, university IDs, topics, digest frequencies, and push flags. Add `POST /api/news/source-suggestions`; accept one HTTPS `.gov` or `.edu` URL plus an optional university ID, rate-limit submissions, and create an untrusted review record without fetching it. When a profile saves a new `.edu` domain, create or reuse a `verification-pending` university connector record.

- [ ] **Step 4: Write failing admin and scheduler authorization tests**

```js
test("rejects a signed-in non-admin", async () => {
  await request(app).get("/api/admin/news/health").set("x-demo-user", "student-a").expect(403);
});

test("accepts the configured scheduler secret", async () => {
  await request(app).post("/api/internal/news/sync")
    .set("authorization", "Bearer sync-test-secret")
    .send({ sourceIds: ["federal-register"], dryRun: true })
    .expect(200);
});
```

- [ ] **Step 5: Run admin tests and verify failure**

Run: `cd server && npm test -- tests/admin-news-routes.test.js`

Expected: FAIL because admin and internal routes are missing.

- [ ] **Step 6: Implement administrative and internal routes**

Add source list/create/update/run, review list/approve/reject, and health endpoints. Approval copies the reviewed summary and tags into the news item, sets `editorialState: "approved"`, and appends an immutable audit record. Internal sync accepts at most 20 registered source IDs per request.

- [ ] **Step 7: Wire dependencies and environment variables**

Pass `newsSync` and stores through `createApp`. Add `ADMIN_UIDS`, `NEWS_SYNC_SECRET`, `NEWS_SYNC_ENABLED=false`, and `NEWS_SUMMARIES_ENABLED=false` to `server/.env.example`.

- [ ] **Step 8: Run route and regression tests**

Run: `cd server && npm test -- tests/news-routes.test.js tests/admin-news-routes.test.js tests/routes.test.js tests/auth.test.js`

Expected: PASS.

- [ ] **Step 9: Commit API routes**

```bash
git add server/src/admin-auth.js server/src/routes/news.js server/src/routes/admin-news.js server/src/routes/internal-news.js server/src/app.js server/src/index.js server/.env.example server/tests/news-routes.test.js server/tests/admin-news-routes.test.js
git commit -m "feat: expose news and review APIs"
```

### Task 8: Scheduler, digests, and push delivery

**Files:**
- Create: `server/src/jobs/sync-news.js`
- Create: `server/src/news/digest.js`
- Create: `server/src/news/push.js`
- Create: `server/src/reminders.js`
- Create: `server/tests/news-digest.test.js`
- Create: `server/tests/news-push.test.js`
- Create: `server/tests/reminders.test.js`
- Create: `functions/package.json`
- Create: `functions/package-lock.json`
- Create: `functions/index.js`
- Create: `functions/index.test.js`
- Create: `.github/workflows/news-source-contract.yml`
- Modify: `server/package.json`
- Modify: `server/.env.example`

**Interfaces:**
- Produces: `matchNewsToProfile(item, profile, preferences)`, `buildDigest(items, now)`, `createPushService({ messaging, store })`, CLI `npm run news:sync -- --dry-run`.
- Produces: `createReminderService({ store, push, clock })` and Firebase `scheduledNewsSync`/`scheduledReminderSweep` wrappers.
- Push service sends only `approved + urgent` matches with an existing opt-in subscription.

- [ ] **Step 1: Write failing matcher and digest tests**

```js
test("keeps the full feed but ranks matching visa and university first", () => {
  const ranked = buildDigest([general, f1Update, uncUpdate], new Date("2026-09-12"), {
    profile: { visaType: "F-1", universityId: "unc-chapel-hill" }, preferences: { topics: ["employment"] },
  });
  expect(ranked.items.map((item) => item.id)).toEqual([uncUpdate.id, f1Update.id, general.id]);
});
```

- [ ] **Step 2: Run digest tests and verify failure**

Run: `cd server && npm test -- tests/news-digest.test.js`

Expected: FAIL because digest functions are missing.

- [ ] **Step 3: Implement deterministic ranking and digest grouping**

Score university match `+8`, visa match `+6`, nationality match `+5`, subscribed topic `+4`, urgent `+3`, and effective within 30 days `+2`. Group results into urgent, upcoming-effective, university, and other sections while preserving all eligible items.

- [ ] **Step 4: Write failing push tests**

```js
test("does not send unapproved or unsubscribed notices", async () => {
  await service.deliver({ ...urgentItem, editorialState: "published-source-only" });
  expect(messaging.send).not.toHaveBeenCalled();
});

test("records an inbox item when push delivery fails", async () => {
  messaging.send.mockRejectedValue(new Error("unavailable"));
  await service.deliver(approvedUrgentItem);
  expect((await store.notifications.list("student-a"))[0]).toMatchObject({ deliveryState: "failed", read: false });
});
```

- [ ] **Step 5: Run push tests and verify failure**

Run: `cd server && npm test -- tests/news-push.test.js`

Expected: FAIL because push service is missing.

- [ ] **Step 6: Implement FCM delivery behind feature flags**

Create an in-app notification for every matched approved urgent item. Send through Firebase Admin Messaging only when `PUSH_NOTIFICATIONS_ENABLED=true`, the user opted in, and a subscription exists. Remove only subscriptions rejected as permanently invalid.

- [ ] **Step 7: Add scheduler CLI and contract workflow**

The CLI parses `--dry-run`, `--source=<id>`, and `--limit=<1..20>`, defaults to dry-run unless `NEWS_SYNC_ENABLED=true`, prints JSON run summaries, and sets a failing exit code for source-contract errors. The weekly GitHub workflow runs fixture contract tests and `npm run news:sync -- --dry-run --limit=1` only when repository secrets configure a staging Firebase project.

Create a separate `functions` package using `firebase-functions/v2/scheduler`. `scheduledNewsSync` runs every six hours and calls the authenticated internal sync URL. `scheduledReminderSweep` runs every hour and calls `POST /api/internal/reminders/sweep`. Both wrappers return without making a request unless their explicit enabled flag and secret configuration exist. Mount the reminder sweep beside the news sync route and protect it with the same scheduler middleware.

- [ ] **Step 8: Write reminder and scheduled-wrapper tests before implementation**

Test that reminders become due once, use the user's stored time zone, create an in-app notification when push is disabled, and never notify for completed tasks. Test that disabled scheduled wrappers perform no fetch. Observe failures, then implement `createReminderService` and inject fetch into the function wrappers.

- [ ] **Step 9: Run scheduler tests and CLI help**

Run: `cd server && npm test -- tests/news-digest.test.js tests/news-push.test.js tests/reminders.test.js && npm run news:sync -- --help && cd ../functions && npm test`

Expected: tests pass and help lists dry-run, source, and limit flags without contacting a source.

- [ ] **Step 10: Commit scheduling and delivery**

```bash
git add server/src/jobs/sync-news.js server/src/news/digest.js server/src/news/push.js server/src/reminders.js server/tests/news-digest.test.js server/tests/news-push.test.js server/tests/reminders.test.js server/package.json server/.env.example functions/package.json functions/package-lock.json functions/index.js functions/index.test.js .github/workflows/news-source-contract.yml
git commit -m "feat: schedule digests and safe update notifications"
```

### Task 9: News, coverage, and administration interface

**Files:**
- Create: `client/src/data/demo-news.js`
- Create: `client/src/lib/news-data.js`
- Create: `client/src/components/NewsCard.jsx`
- Create: `client/src/pages/NewsPage.jsx`
- Create: `client/src/pages/NewsAdminPage.jsx`
- Create: `client/src/pages/NotificationsPage.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/news.test.jsx`
- Create: `client/src/__tests__/news-admin.test.jsx`
- Create: `client/src/__tests__/notifications.test.jsx`

**Interfaces:**
- `subscribeNews(filters, handler)`, `saveNews(uid, item)`, `updateNewsPreferences(uid, input)`, `subscribeNotifications(uid, handler)`.
- `NewsPage` receives `{ items, sources, preferences, savedIds, onSave, onPreferences }` for deterministic testing.

- [ ] **Step 1: Write failing feed tests**

```jsx
test("shows legal state, effective date, freshness, and official source", () => {
  render(<NewsPage items={[fixedAdmissionRule]} sources={[healthyFederalRegister]} />);
  expect(screen.getByText("Final rule")).toBeTruthy();
  expect(screen.getByText(/effective september 15, 2026/i)).toBeTruthy();
  expect(screen.getByText(/last checked/i)).toBeTruthy();
  expect(screen.getByRole("link", { name: /official source/i }).href).toMatch(/^https:\/\/www\.federalregister\.gov/);
});

test("does not imply missing news when a source is degraded", () => {
  render(<NewsPage items={[]} sources={[degradedSource]} />);
  expect(screen.getByText(/source check is delayed/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run feed tests and verify missing-component failure**

Run: `cd client && npm test -- src/__tests__/news.test.jsx`

Expected: FAIL because NewsPage does not exist.

- [ ] **Step 3: Implement the feed and demo data**

Create For you, Federal, Your university, Saved, and Coverage tabs; topic, visa, legal-state, university, and date filters; keyword search; urgent strip; cards; revision detail; source health; empty/degraded states; and source-only review labels. Demo data includes the fixed-admission final rule and one university notice, both labeled as fixtures.

- [ ] **Step 4: Write failing admin tests**

Test that non-admin users never receive the admin route in navigation, admins can inspect consecutive failures, approving requires a non-empty source-supported summary, rejection records a reason, and source replay defaults to dry-run.

- [ ] **Step 5: Run admin tests and verify failure**

Run: `cd client && npm test -- src/__tests__/news-admin.test.jsx`

Expected: FAIL because the admin page is missing.

- [ ] **Step 6: Implement admin source health and review UI**

Use API routes from Task 7. Require explicit confirmation for a live source replay, show diffed fields rather than raw HTML, and display approval audit metadata.

- [ ] **Step 7: Write and implement notification inbox tests**

First assert unread counts, mark-read behavior, preference controls, denied browser-permission behavior, and source links. Observe the failure, then implement `NotificationsPage` and header/mobile badges.

- [ ] **Step 8: Add routes and responsive styling**

Add `/news`, `/notifications`, and `/admin/news`. Include News in both desktop and five-item mobile primary navigation; move Guides into a More section on mobile so News remains visible. Verify layouts at 375 px without horizontal overflow.

- [ ] **Step 9: Run client news tests and build**

Run: `cd client && npm test -- src/__tests__/news.test.jsx src/__tests__/news-admin.test.jsx src/__tests__/notifications.test.jsx && npm run build`

Expected: PASS.

- [ ] **Step 10: Commit the news interface**

```bash
git add client/src/data/demo-news.js client/src/lib/news-data.js client/src/components/NewsCard.jsx client/src/pages/NewsPage.jsx client/src/pages/NewsAdminPage.jsx client/src/pages/NotificationsPage.jsx client/src/components/AppShell.jsx client/src/App.jsx client/src/index.css client/src/__tests__/news.test.jsx client/src/__tests__/news-admin.test.jsx client/src/__tests__/notifications.test.jsx
git commit -m "feat: add personalized student news center"
```

### Task 10: Web push subscription client

**Files:**
- Modify: `client/src/lib/firebase.js`
- Create: `client/src/lib/push.js`
- Create: `client/public/firebase-messaging-sw.js`
- Modify: `client/.env.example`
- Test: `client/src/__tests__/push.test.js`

**Interfaces:**
- Produces: `pushAvailable`, `requestPushSubscription({ requestPermission, registerMessaging, apiRequest })`, `removePushSubscription(id)`.

- [ ] **Step 1: Write failing permission tests**

```js
test("does not register before explicit permission", async () => {
  const requestPermission = vi.fn().mockResolvedValue("denied");
  const registerMessaging = vi.fn();
  await expect(requestPushSubscription({ requestPermission, registerMessaging, apiRequest: vi.fn() }))
    .rejects.toThrow(/permission/i);
  expect(registerMessaging).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run push client tests and verify failure**

Run: `cd client && npm test -- src/__tests__/push.test.js`

Expected: FAIL because `client/src/lib/push.js` is missing.

- [ ] **Step 3: Implement opt-in registration**

Initialize Firebase Messaging only when Firebase exists, HTTPS or localhost is in use, service workers and Notifications exist, and `VITE_PUSH_NOTIFICATIONS_ENABLED=true`. Use `VITE_FIREBASE_VAPID_KEY`; post the resulting installation/subscription identifier only after permission becomes `granted`.

- [ ] **Step 4: Add background notification handler**

The service worker displays the supplied title/body and opens only a same-origin `/news/<id>` link. It contains no credentials and no hardcoded production project configuration; build-time deployment documentation supplies the public Firebase config.

- [ ] **Step 5: Run push tests and production build**

Run: `cd client && npm test -- src/__tests__/push.test.js && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit push support**

```bash
git add client/src/lib/firebase.js client/src/lib/push.js client/public/firebase-messaging-sw.js client/.env.example client/src/__tests__/push.test.js
git commit -m "feat: add consent-based browser alerts"
```

### Task 11: Complete tasks, reminders, and calendar export

**Files:**
- Create: `server/src/task-model.js`
- Modify: `server/src/routes/tasks.js`
- Create: `server/tests/task-model.test.js`
- Create: `client/src/components/TaskEditor.jsx`
- Create: `client/src/lib/calendar.js`
- Modify: `client/src/lib/student-data.js`
- Modify: `client/src/pages/TasksPage.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/tasks.test.jsx`
- Create: `client/src/__tests__/calendar.test.js`

**Interfaces:**
- Task shape: `{ title, notes, category, priority, dueAt, timeZone, reminderAt, status, source, sourceNewsId }`.
- Produces: `validateTask(input)`, `taskToIcs(task)`, `googleCalendarUrl(task)`.

- [ ] **Step 1: Write failing task validation tests**

```js
test("rejects reminders after deadlines", () => {
  expect(validateTask({ title: "File form", dueAt: "2026-10-01T12:00:00Z", reminderAt: "2026-10-02T12:00:00Z", timeZone: "America/New_York" }))
    .toMatchObject({ ok: false, code: "invalid_reminder" });
});
```

- [ ] **Step 2: Run server task tests and verify failure**

Run: `cd server && npm test -- tests/task-model.test.js`

Expected: FAIL because the model is missing.

- [ ] **Step 3: Implement task validation and route replacement semantics**

Validate title length 1–200, notes up to 2,000, closed priority/status values, ISO instants, IANA time zone through `Intl.DateTimeFormat`, and reminder-before-due. POST creates the full shape; PATCH accepts an allowlisted partial update and rejects unknown fields.

- [ ] **Step 4: Write failing calendar tests**

```js
test("escapes ICS text and emits UTC dates", () => {
  const ics = taskToIcs({ id: "task-1", title: "File form, ask DSO", notes: "Line one\nLine two", dueAt: "2026-10-01T12:00:00Z" });
  expect(ics).toContain("SUMMARY:File form\\, ask DSO");
  expect(ics).toContain("DTSTART:20261001T120000Z");
});
```

- [ ] **Step 5: Run calendar tests and verify failure**

Run: `cd client && npm test -- src/__tests__/calendar.test.js`

Expected: FAIL because calendar helpers are missing.

- [ ] **Step 6: Implement calendar helpers and task editor**

Build `.ics` with stable UID, escaped text, all-day or UTC timed events, and a 30-minute default duration. Build Google Calendar URLs with `action=TEMPLATE`, encoded dates, title, notes, and source link. Add create/edit/duplicate/reopen/delete flows, filters, due sorting, overdue labels, and news-source links.

- [ ] **Step 7: Write UI tests before each behavior**

Test create fields, edit prefill, invalid reminder feedback, overdue filter, duplicate, `.ics` download, and Google Calendar link. Run once to observe failures, then implement each behavior in `TaskEditor` and `TasksPage`.

- [ ] **Step 8: Run task suites**

Run: `cd server && npm test -- tests/task-model.test.js tests/routes.test.js && cd ../client && npm test -- src/__tests__/tasks.test.jsx src/__tests__/calendar.test.js`

Expected: PASS.

- [ ] **Step 9: Commit completed tasks**

```bash
git add server/src/task-model.js server/src/routes/tasks.js server/tests/task-model.test.js server/tests/routes.test.js client/src/components/TaskEditor.jsx client/src/lib/calendar.js client/src/lib/student-data.js client/src/pages/TasksPage.jsx client/src/index.css client/src/__tests__/tasks.test.jsx client/src/__tests__/calendar.test.js
git commit -m "feat: complete tasks reminders and calendar export"
```

### Task 12: Dynamic dashboard, navigation, and saved guides

**Files:**
- Create: `client/src/lib/readiness.js`
- Modify: `client/src/pages/DashboardPage.jsx`
- Modify: `client/src/pages/GuidesPage.jsx`
- Modify: `client/src/pages/ProfilePage.jsx`
- Modify: `client/src/lib/student-data.js`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/__tests__/dashboard.test.jsx`
- Modify: `client/src/__tests__/guides.test.jsx`
- Create: `client/src/__tests__/profile.test.jsx`

**Interfaces:**
- Produces: `calculateReadiness({ profile, tasks, documents, unreadUrgent })`, `selectRecommendation(input)`.
- Score components total 100: profile 25, overdue-task health 25, upcoming-task completion 20, document-expiry health 15, urgent-news acknowledgement 15.

- [ ] **Step 1: Write failing readiness tests**

```js
test("explains deductions instead of returning a hardcoded score", () => {
  const result = calculateReadiness({
    profile: { fullName: "Maya" },
    tasks: [{ status: "open", dueAt: "2026-09-01T00:00:00Z" }],
    documents: [], unreadUrgent: 1, now: new Date("2026-09-12T00:00:00Z"),
  });
  expect(result.score).toBeLessThan(68);
  expect(result.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/overdue/i), expect.stringMatching(/urgent/i)]));
});
```

- [ ] **Step 2: Run dashboard tests and verify failure**

Run: `cd client && npm test -- src/__tests__/dashboard.test.jsx`

Expected: FAIL because readiness helpers are missing and 68 percent remains hardcoded.

- [ ] **Step 3: Implement readiness, recommendations, and navigation**

Use `Link` for Ask GlobeReady, View all, Open guide, metrics, documents, and news. Select overdue tasks first, then urgent unread news, expiring documents, upcoming tasks, and profile gaps. Render score reasons in an accessible details panel.

- [ ] **Step 4: Write failing guide-management tests**

Test All/Saved tabs, unsave, search, demo-session label, and Create task. Observe failures before changing `GuidesPage`.

- [ ] **Step 5: Write failing profile normalization tests**

Test that the profile stores `countryCode`, normalized `universityName`, verified `universityId` when selected, and an optional HTTPS `.edu` `universityDomain`. Reject non-HTTPS, credential-bearing, and non-`.edu` domains. Observe the expected failures before updating the form.

- [ ] **Step 6: Implement saved-guide and profile management**

Add `removeResource`, pass saved resource objects instead of URLs, and create tasks with the guide URL in notes. Keep demo saves in App state and label them “Saved for this demo session.” Add searchable country and university inputs while retaining a manual university option; save normalized identity fields for news matching and source verification.

- [ ] **Step 7: Run dashboard, guide, and profile tests**

Run: `cd client && npm test -- src/__tests__/dashboard.test.jsx src/__tests__/guides.test.jsx src/__tests__/profile.test.jsx`

Expected: PASS.

- [ ] **Step 8: Commit product navigation fixes**

```bash
git add client/src/lib/readiness.js client/src/pages/DashboardPage.jsx client/src/pages/GuidesPage.jsx client/src/pages/ProfilePage.jsx client/src/lib/student-data.js client/src/App.jsx client/src/components/AppShell.jsx client/src/__tests__/dashboard.test.jsx client/src/__tests__/guides.test.jsx client/src/__tests__/profile.test.jsx
git commit -m "feat: replace placeholder workspace behavior"
```

### Task 13: Settings, data export, and account deletion

**Files:**
- Create: `server/src/account-service.js`
- Create: `server/src/routes/account.js`
- Modify: `server/src/auth.js`
- Modify: `server/src/app.js`
- Modify: `server/src/index.js`
- Create: `server/tests/account.test.js`
- Create: `client/src/pages/SettingsPage.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/AppShell.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/settings.test.jsx`

**Interfaces:**
- `createAccountService({ firestore, bucket, auth })` produces `exportUser(uid)` and `deleteUser(uid)`.
- Routes: `GET /api/account/export` and `DELETE /api/account`.
- Account deletion requires a verified token whose `auth_time` is within five minutes and the exact confirmation text `DELETE MY GLOBEREADY DATA`.

- [ ] **Step 1: Write failing account-service and route tests**

```js
test("exports only the authenticated user's workspace", async () => {
  const response = await user("student-a").get("/api/account/export").expect(200);
  expect(response.body.data.uid).toBe("student-a");
  expect(JSON.stringify(response.body.data)).not.toContain("student-b");
});

test("requires recent authentication and exact confirmation", async () => {
  await staleUser.delete("/api/account").send({ confirmation: "DELETE MY GLOBEREADY DATA" }).expect(401);
  await recentUser.delete("/api/account").send({ confirmation: "delete" }).expect(422);
});
```

- [ ] **Step 2: Run account tests and verify route-not-found failure**

Run: `cd server && npm test -- tests/account.test.js`

Expected: FAIL because account service and routes do not exist.

- [ ] **Step 3: Implement export and ordered deletion**

Include `authTime` from the verified Firebase token in `request.user`. Export profile, tasks, document metadata, saved guides/news, preferences, notifications, conversations/messages, and push-subscription metadata without raw embeddings or secret source data. For deletion, remove Storage objects under `users/<uid>/`, recursively delete the Firestore user document and subcollections, then delete the Firebase Auth user. Record only aggregate success/failure logs without user content.

- [ ] **Step 4: Write failing Settings UI tests**

Test working Settings navigation, digest/topic controls, push opt-in status, JSON export download, stale-session message, typed deletion confirmation, cancel behavior, and redirect to login after deletion.

- [ ] **Step 5: Run Settings tests and verify failure**

Run: `cd client && npm test -- src/__tests__/settings.test.jsx`

Expected: FAIL because SettingsPage is missing and the sidebar Settings button has no route.

- [ ] **Step 6: Implement Settings UI**

Route `/settings`, replace the inert sidebar button with a link, reuse news preferences, generate an object URL for the exported JSON, revoke it after download, and keep account deletion disabled until the exact phrase matches. Do not offer account deletion in demo mode.

- [ ] **Step 7: Run account and Settings tests**

Run: `cd server && npm test -- tests/account.test.js tests/auth.test.js && cd ../client && npm test -- src/__tests__/settings.test.jsx`

Expected: PASS.

- [ ] **Step 8: Commit account controls**

```bash
git add server/src/account-service.js server/src/routes/account.js server/src/auth.js server/src/app.js server/src/index.js server/tests/account.test.js client/src/pages/SettingsPage.jsx client/src/App.jsx client/src/components/AppShell.jsx client/src/index.css client/src/__tests__/settings.test.jsx
git commit -m "feat: add user-controlled data export and deletion"
```

### Task 14: Persist assistant conversations and actions

**Files:**
- Create: `server/src/routes/conversations.js`
- Modify: `server/src/app.js`
- Modify: `server/src/store.js`
- Modify: `server/src/firestore-store.js`
- Create: `server/tests/conversations.test.js`
- Create: `client/src/lib/conversations.js`
- Modify: `client/src/pages/AssistantPage.jsx`
- Modify: `client/src/App.jsx`
- Modify: `client/src/index.css`
- Create: `client/src/__tests__/assistant-history.test.jsx`

**Interfaces:**
- Conversation: `{ id, title, createdAt, updatedAt }`.
- Message: `{ id, role, text, actions, confidence, disclaimer, sources, documentCitations, documentId, mode, createdAt }`.
- Produces list/create/rename/delete conversations and list/create messages APIs.

- [ ] **Step 1: Write failing conversation API tests**

Test user isolation, title validation, message role validation, structured assistant payload preservation, bounded 100-message listing, and cascade deletion.

- [ ] **Step 2: Run conversation tests and verify failure**

Run: `cd server && npm test -- tests/conversations.test.js`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement conversation stores and routes**

Use nested message collections in Firestore and nested maps in demo store. Generate a title from the first 60 characters of the first user question unless the user renames it. Delete messages in batches before deleting the conversation.

- [ ] **Step 4: Write failing assistant-history tests**

Test new conversation, history loading, rename, delete, full action/confidence/disclaimer rendering, document selector preservation, and action-to-task conversion. Observe failures before production edits.

- [ ] **Step 5: Implement history UI**

Add a responsive conversation drawer, persist signed-in messages through the API, retain in-memory demo history, render every structured response field, and call the task create flow with the selected action and source links.

- [ ] **Step 6: Run conversation and assistant tests**

Run: `cd server && npm test -- tests/conversations.test.js tests/rag-routes.test.js && cd ../client && npm test -- src/__tests__/assistant-history.test.jsx src/__tests__/assistant-rag.test.jsx src/__tests__/assistant-response.test.js`

Expected: PASS.

- [ ] **Step 7: Commit conversation history**

```bash
git add server/src/routes/conversations.js server/src/app.js server/src/store.js server/src/firestore-store.js server/tests/conversations.test.js client/src/lib/conversations.js client/src/pages/AssistantPage.jsx client/src/App.jsx client/src/index.css client/src/__tests__/assistant-history.test.jsx
git commit -m "feat: persist assistant conversations"
```

### Task 15: OCR-backed scanned document indexing

**Files:**
- Modify: `server/package.json`
- Modify: `server/package-lock.json`
- Create: `server/src/document-extractors.js`
- Modify: `server/src/document-index.js`
- Modify: `server/src/gemini.js`
- Modify: `server/src/index.js`
- Modify: `server/.env.example`
- Modify: `client/src/pages/DocumentsPage.jsx`
- Create: `server/tests/document-extractors.test.js`
- Modify: `server/tests/document-index.test.js`
- Modify: `client/src/__tests__/documents.test.jsx`

**Interfaces:**
- `createDocumentTextExtractor({ bucket, documentAi, ocrEnabled, minimumReadableCharacters })` returns `extract({ uid, document }): Promise<{ pages: Array<{ page, text, confidence, method }> }>`.
- Embedded PDF extraction runs first; Document AI handles images and text-poor PDFs only when enabled.

- [ ] **Step 1: Install the official OCR client**

Run: `cd server && npm install @google-cloud/documentai@^9.2.0`

Expected: lockfile update and zero audit vulnerabilities.

- [ ] **Step 2: Write failing extractor-selection tests**

```js
test("uses embedded text for a readable PDF", async () => {
  const result = await extractor.extract({ uid: "user-1", document: readablePdf });
  expect(result.pages[0].method).toBe("embedded-text");
  expect(documentAi.processDocument).not.toHaveBeenCalled();
});

test("uses OCR for a text-poor PDF only when enabled", async () => {
  const result = await extractor.extract({ uid: "user-1", document: scannedPdf });
  expect(result.pages[0]).toMatchObject({ method: "document-ai-ocr", page: 1 });
});

test("rejects image indexing while OCR is disabled", async () => {
  await expect(disabledExtractor.extract({ uid: "user-1", document: pngDocument })).rejects.toThrow(/ocr.*disabled/i);
});
```

- [ ] **Step 3: Run extractor tests and verify failure**

Run: `cd server && npm test -- tests/document-extractors.test.js`

Expected: FAIL because extractor module is missing.

- [ ] **Step 4: Implement private OCR extraction**

Verify the user-owned Storage prefix before download. Send bytes and MIME type to the configured Document AI processor. Reconstruct page text from text anchors, preserve page numbers and confidence, reject empty results, and never log source bytes or OCR text.

- [ ] **Step 5: Update indexer tests before integration**

Add failing cases for image documents, scanned-PDF OCR, low-confidence metadata, disabled provider, more than 200 chunks, and partial-chunk cleanup. Then inject the new extractor into `createDocumentIndexer` and return `extractionMethod` plus `lowConfidencePages` in analysis.

- [ ] **Step 6: Add environment and UI states**

Add `DOCUMENT_OCR_ENABLED=false`, `DOCUMENT_AI_PROCESSOR_NAME`, and `DOCUMENT_AI_LOCATION=us`. Allow Index for Assistant on accepted images only when the API health response reports OCR enabled. Display extraction method and a low-confidence warning.

- [ ] **Step 7: Run OCR, document, and audit checks**

Run: `cd server && npm test -- tests/document-extractors.test.js tests/document-index.test.js tests/rag-routes.test.js && npm audit && cd ../client && npm test -- src/__tests__/documents.test.jsx`

Expected: PASS and zero vulnerabilities.

- [ ] **Step 8: Commit OCR indexing**

```bash
git add server/package.json server/package-lock.json server/src/document-extractors.js server/src/document-index.js server/src/gemini.js server/src/index.js server/.env.example server/tests/document-extractors.test.js server/tests/document-index.test.js client/src/pages/DocumentsPage.jsx client/src/__tests__/documents.test.jsx
git commit -m "feat: index scanned student documents with OCR"
```

### Task 16: Firestore vector search and migration

**Files:**
- Create: `server/src/firestore-vector-store.js`
- Create: `server/src/migrations/migrate-rag-vectors.js`
- Modify: `server/src/firestore-store.js`
- Modify: `server/src/document-assistant.js`
- Modify: `server/src/index.js`
- Modify: `server/package.json`
- Create: `server/tests/firestore-vector-store.test.js`
- Create: `server/tests/rag-vector-migration.test.js`
- Modify: `server/tests/document-assistant.test.js`

**Interfaces:**
- `ragChunks.nearest(uid, queryVector, { documentId, limit, maximumDistance })` returns scored public chunk fields without raw embeddings.
- Migration CLI supports `--dry-run`, `--uid=<uid>`, and `--limit=<1..500>`; live writes require `RAG_VECTOR_MIGRATION_ENABLED=true`.

- [ ] **Step 1: Write failing nearest-neighbor tests**

Test user pre-filter, optional document pre-filter, COSINE distance, six-result limit, distance threshold, and omission of embeddings from returned chunks.

- [ ] **Step 2: Run vector-store tests and verify failure**

Run: `cd server && npm test -- tests/firestore-vector-store.test.js`

Expected: FAIL because the vector store is missing.

- [ ] **Step 3: Implement Firestore vector fields and query**

Store embeddings with the Admin SDK vector value supported by the installed Firestore client. Query `findNearest` using `distanceMeasure: "COSINE"`, `distanceResultField: "vectorDistance"`, and UID/document pre-filters. Convert distance to similarity as `1 - vectorDistance` for the existing citation threshold.

- [ ] **Step 4: Write failing migration tests**

Test dry-run performs zero writes, array embeddings convert once, existing vector fields remain untouched, batches stay below 500 writes, per-user limits apply, and failures report resumable document IDs.

- [ ] **Step 5: Run migration tests and verify failure**

Run: `cd server && npm test -- tests/rag-vector-migration.test.js`

Expected: FAIL because the migration is missing.

- [ ] **Step 6: Implement the guarded migration and retrieval integration**

Add `npm run rag:migrate-vectors`. Default to dry-run. Update `document-assistant.js` to call `nearest` in live mode and retain `rankChunks` only for the in-memory store. Return general guidance if a vector index is unavailable and candidate count exceeds the bounded fallback limit.

- [ ] **Step 7: Run vector and RAG tests**

Run: `cd server && npm test -- tests/firestore-vector-store.test.js tests/rag-vector-migration.test.js tests/document-assistant.test.js tests/rag.test.js`

Expected: PASS.

- [ ] **Step 8: Commit scalable retrieval**

```bash
git add server/src/firestore-vector-store.js server/src/migrations/migrate-rag-vectors.js server/src/firestore-store.js server/src/document-assistant.js server/src/index.js server/package.json server/tests/firestore-vector-store.test.js server/tests/rag-vector-migration.test.js server/tests/document-assistant.test.js
git commit -m "feat: add user-scoped Firestore vector retrieval"
```

### Task 17: Security, documentation, CI, and full verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.env.example`
- Modify: `client/.env.example`
- Modify: `server/.env.example`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `SECURITY.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PRIVACY.md`
- Modify: `docs/ROADMAP.md`
- Modify: `server/tests/deployment.test.js`
- Modify: `server/tests/rules.test.js`

**Interfaces:**
- Produces a documented release contract, cost/feature matrix, source coverage statement, dry-run instructions, and CI Docker verification.

- [ ] **Step 1: Write failing deployment assertions**

```js
test("documents every disabled-by-default sensitive feature", async () => {
  const deployment = await readFile(new URL("../../DEPLOYMENT.md", import.meta.url), "utf8");
  for (const name of ["NEWS_SYNC_ENABLED", "NEWS_SUMMARIES_ENABLED", "DOCUMENT_OCR_ENABLED", "PUSH_NOTIFICATIONS_ENABLED", "RAG_VECTOR_MIGRATION_ENABLED"]) {
    expect(deployment).toContain(name);
  }
});
```

- [ ] **Step 2: Run deployment tests and verify failure**

Run: `cd server && npm test -- tests/deployment.test.js`

Expected: FAIL until documentation and environment examples list every gate.

- [ ] **Step 3: Complete documentation**

Document source scope, legal/editorial labels, source-health interpretation, university coverage states, monitoring cadences, review workflow, admin claim setup, scheduled function deployment, FCM/VAPID setup, Document AI setup, vector indexes, migration dry-run, data deletion, snapshot retention, expected billing surfaces, and a synthetic two-user release checklist. Remove any claim that GlobeReady captures every update.

- [ ] **Step 4: Add CI audits and Docker build**

Update CI to run `npm audit` in both packages, full tests, server syntax checks across every source file, client build, `firebase emulators:exec` when emulator dependencies are available, and `docker build -t globeready-api:test .`. Do not push the image.

- [ ] **Step 5: Run complete server verification**

Run:

```bash
cd server
npm ci
npm audit
npm test
npm run lint
find src -name '*.js' -print0 | xargs -0 -n1 node --check
```

Expected: zero vulnerabilities, all tests pass, and every syntax check exits 0.

- [ ] **Step 6: Run complete client verification**

Run:

```bash
cd client
npm ci
npm audit
npm test
npm run build
```

Expected: zero vulnerabilities, all tests pass, and Vite emits a production bundle.

- [ ] **Step 7: Run direct behavior checks**

Run the server with demo data and verify `/api/health`, `/api/news`, task CRUD, conversation CRUD, and source-sync dry-run through Supertest or curl. Start the Vite preview and use Playwright at desktop and 375 px widths to verify News, Tasks, Dashboard, Guides, Assistant, Documents, Notifications, and admin authorization with no console errors or horizontal overflow.

- [ ] **Step 8: Run Docker verification**

Run: `docker build -t globeready-api:test .`

Expected: exit 0. If the daemon is unavailable, report Docker as unverified and rely on the added CI job without claiming a local pass.

- [ ] **Step 9: Review the diff against every acceptance criterion**

Read the approved spec and mark each of its 14 acceptance criteria with a supporting test, route, UI behavior, or documented external release gate. Fix gaps through a new red-green cycle before continuing.

- [ ] **Step 10: Commit final hardening**

```bash
git add .github/workflows/ci.yml .env.example client/.env.example server/.env.example README.md DEPLOYMENT.md SECURITY.md docs/ARCHITECTURE.md docs/PRIVACY.md docs/ROADMAP.md server/tests/deployment.test.js server/tests/rules.test.js
git commit -m "docs: define safe GlobeReady operations and release checks"
```

- [ ] **Step 11: Verify final branch state**

Run: `git status --short && git log --oneline --decorate -20`

Expected: clean worktree with the design, implementation plan, and all implementation commits on `codex/globeready-platform`.
