# GlobeReady Continuous Updates and Product Completion Design

**Date:** 2026-09-12

**Status:** Proposed for implementation

## Purpose

GlobeReady will become a maintained information and planning workspace for international students in the United States. It will monitor official federal and university sources, publish source-linked notices, personalize updates, improve tasks and reminders, retain assistant conversations, support OCR-backed document retrieval, and replace placeholder dashboard behavior with data derived from each user's workspace.

The system will optimize for verified coverage, visible freshness, and traceable provenance. It will not claim to capture every change on the internet. Every monitored source will expose its scope, health, polling cadence, and last successful check so users can see what GlobeReady has and has not checked.

## Product boundaries

### Included

- Rules, proposals, guidance, forms, fees, deadlines, court-related agency notices, travel restrictions, visa operations, practical training, employment authorization, taxes, Social Security, emergency relief, and university international-office notices that affect international students in the United States.
- F, M, and J students as the primary audience, plus transition topics such as OPT, STEM OPT, CPT, H-1B cap-gap, and post-study status changes.
- Federal monitoring for every user.
- University monitoring through a generic connector for any `.edu` institution domain and a maintained registry of verified international-office and registrar sources.
- In-app news, weekly in-app digests, saved notices, unread state, and opt-in browser push for approved urgent notices.
- Full task fields, reminders, calendar export, dynamic dashboard readiness, actionable navigation, saved-guide management, assistant history, OCR, and Firestore vector search.
- Source and ingestion administration inside GlobeReady.

### Excluded from this implementation

- Legal representation, case-specific eligibility conclusions, or automated advice that tells a user to file, travel, work, or depart without consulting an official source and a designated school official or qualified lawyer.
- Republishing complete university articles. GlobeReady stores metadata, a short excerpt, a content hash, and a private comparison snapshot with retention controls.
- Monitoring authenticated student portals, private email lists, social-media-only announcements, or pages that prohibit automated access.
- Sending email. The first newsletter is an in-app digest. Browser push is opt-in. Email requires a separate provider, consent model, unsubscribe handling, deliverability controls, and approval before any messages leave the system.
- Deployment, paid-service activation, billing changes, or production data migration. Those actions require explicit approval after local implementation and verification.

## Delivery strategy

The work remains one feature program on one branch, but each vertical slice must produce working, tested software:

1. News data model, official-source ingestion, APIs, and source health.
2. News interface, personalization, digest, administration, and browser notifications.
3. Tasks, dashboard, navigation, saved guides, reminders, and calendar export.
4. Assistant conversation history, OCR extraction, and scalable vector retrieval.
5. Security hardening, migration tools, Docker CI, documentation, and release checks.

The implementation must not publish or deploy partial slices. Local commits may separate the slices for review and rollback.

## Information integrity model

GlobeReady will separate three concepts that news products often collapse:

1. **Document type:** notice, proposed rule, final rule, guidance, policy manual update, form change, fee change, court update, emergency notice, university notice, or correction.
2. **Legal or operational state:** proposed, final, scheduled, effective, delayed, enjoined, superseded, withdrawn, expired, or informational.
3. **Editorial state:** imported, published-source-only, review-required, approved, rejected, or archived.

An official item may appear immediately as `published-source-only` with its official title, agency description, dates, and link. GlobeReady will display a visible “Official source notice; plain-language review pending” label for high-impact items. The system will never delay the existence of a high-impact official notice while waiting for an editor.

Generated classification and summaries are suggestions. A generated summary may publish automatically only when all of these conditions hold:

- The source domain appears in the verified registry.
- The item does not match a high-impact category.
- The structured output passes schema validation.
- Dates in the output occur verbatim in the source metadata or extracted text.
- Every outbound URL matches the canonical source or another verified official domain.
- The summary carries an “Automated summary” label and links to the source.

High-impact categories always require review before the generated summary becomes visible:

- Maintenance of status, unlawful presence, grace periods, departure periods, duration of status, and extension of stay.
- CPT, OPT, STEM OPT, cap-gap, employment authorization, and work-hour rules.
- Visa suspension, travel restriction, entry ban, country-specific limitation, or consular closure.
- Filing deadline, form edition, fee, eligibility standard, court injunction, or effective date.
- Tax filing obligations, Social Security eligibility, health-insurance mandates, or emergency relief.

The imported official title, source excerpt, publication date, document type supplied by the source, and canonical link may still appear before review.

## Source coverage

### Federal source registry

The initial registry will include adapters or monitored index pages for:

- Federal Register API and published-document pages, filtered by DHS, ICE, USCIS, State, Education, Labor, Treasury, IRS, SSA, and relevant executive documents.
- USCIS newsroom, alerts, policy manual updates, forms, filing-fee pages, and Federal Register announcements.
- ICE Student and Exchange Visitor Program pages, SEVIS updates, and practical-training guidance.
- Study in the States news, student guidance, school search, and SEVIS Help Hub.
- Department of State visa news, travel advisories, embassy and consulate operational notices, and Foreign Affairs Manual change pages when publicly available.
- Customs and Border Protection admission and I-94 notices.
- Internal Revenue Service international taxpayer and foreign-student updates.
- Social Security Administration noncitizen and student-employment guidance.
- Department of Labor notices that affect student employment and employer obligations.
- White House proclamations and executive orders that affect entry or student status.
- GovInfo links associated with Federal Register documents for official-format verification.

The Federal Register adapter will use its public JSON API because the API exposes machine-readable document type, agency, publication date, effective date, docket, RIN, abstract, HTML URL, and PDF URL. Page adapters will use RSS or Atom when an official feed exists and conditional HTTP requests for index pages otherwise.

### University coverage

GlobeReady cannot truthfully promise that every university publishes a machine-readable feed. It will support any U.S. university through a generic verified-domain connector:

1. The profile records a normalized university name and optional official `.edu` domain.
2. The system checks the domain's declared RSS or Atom feeds and sitemap indexes.
3. Discovery keeps same-domain URLs matching international-student, global-services, registrar, academic-calendar, tax, safety, employment, CPT, OPT, visa, immigration, and emergency terms.
4. An administrator verifies the international office, registrar, calendar, safety, and tax sources before GlobeReady marks the university as covered.
5. Once verified, the scheduler monitors the sources used by active profiles.
6. Users may submit a missing official URL. Submission creates a review item and never becomes a trusted source automatically.

The News page will show one of four university coverage states: covered, partial, verification pending, or no verified source. “All universities” means any institution can enter this connector workflow; it does not mean GlobeReady will claim coverage for an unverified website.

### Polling cadence

- Federal Register and urgent federal alert pages: every 6 hours.
- Other federal pages and feeds: every 12 hours.
- Active university sources: every 24 hours.
- Inactive university sources with no matching user profile: every 7 days for health verification only.
- Failed sources: exponential retry at 15 minutes, 1 hour, 6 hours, and then the source's normal cadence.

Scheduled jobs must use a Firestore lease so overlapping invocations cannot process the same source twice. The scheduler may trigger more than once; all writes must remain idempotent.

## Ingestion architecture

### Source adapters

Every adapter returns the same `SourceCandidate` contract:

```ts
type SourceCandidate = {
  externalId: string;
  canonicalUrl: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  updatedAt: string | null;
  effectiveAt: string | null;
  sourceDocumentType: string | null;
  docketNumber: string | null;
  regulationIdNumber: string | null;
  excerpt: string;
  normalizedText: string;
};
```

Adapters will include `FederalRegisterAdapter`, `FeedAdapter`, `IndexPageAdapter`, and `UniversitySitemapAdapter`. Fetching uses HTTPS only, an explicit domain allowlist, DNS and redirect checks, a 10-second timeout, a 5 MB response limit, accepted text/feed/PDF MIME types, and a descriptive GlobeReady user agent. University adapters honor `robots.txt` and stop when a site disallows the relevant path.

### Normalization and deduplication

- Canonicalize URLs by removing tracking parameters, fragments, and duplicate trailing slashes.
- Derive `sourceKey` from the source ID and external ID when the source supplies one; otherwise use the canonical URL.
- Hash normalized title, excerpt, body text, dates, and document metadata with SHA-256.
- An unchanged hash updates `lastSeenAt` without creating a revision.
- A changed hash stores a private revision record and re-runs classification.
- Federal Register items connect proposal, final rule, correction, delay, and withdrawal records through docket and RIN values.
- A new legal-state record supersedes the earlier display state but does not erase history.

### Relevance and classification

Deterministic agency, document-type, status, date, visa-type, and topic extraction runs before any model call. Gemini may propose missing tags and a plain-language draft through schema-constrained JSON. The classifier must retain an `explanation` field for administrators but the public interface will not present model reasoning as evidence.

The relevance filter includes an item when it directly affects F, M, J, student dependents, international student employment, student taxation, Social Security, admission, travel, school certification, or a nationality represented by an active user. Borderline items enter review instead of publishing.

### Failure monitoring

Each run records start time, end time, item count, changed count, HTTP status, response validators, error code, and next retry. Source health becomes degraded after two consecutive failures and failed after five. Administrators see stale sources ordered by impact and elapsed time. A source that has not succeeded within twice its cadence cannot display a healthy badge.

## Firestore data model

Global collections use server-only writes:

```text
newsSources/{sourceId}
newsItems/{newsItemId}
newsItems/{newsItemId}/revisions/{revisionId}
newsRuns/{runId}
universities/{universityId}
universities/{universityId}/sources/{sourceId}
reviewQueue/{reviewId}
systemLeases/{leaseId}
```

User-scoped collections remain below `users/{uid}`:

```text
users/{uid}/newsPreferences/profile
users/{uid}/savedNews/{newsItemId}
users/{uid}/notifications/{notificationId}
users/{uid}/conversations/{conversationId}
users/{uid}/conversations/{conversationId}/messages/{messageId}
users/{uid}/pushSubscriptions/{subscriptionId}
users/{uid}/tasks/{taskId}
```

### News item fields

Each `newsItems` record contains:

- `sourceId`, `sourceKey`, `canonicalUrl`, `officialPdfUrl`, `publisher`, and verified-domain status.
- `title`, `sourceExcerpt`, `plainLanguageSummary`, and summary provenance.
- `documentType`, `legalState`, `editorialState`, `urgency`, and `impactAreas`.
- `visaTypes`, `nationalities`, `universityIds`, `journeyStages`, and `topics`.
- `publishedAt`, `updatedAt`, `effectiveAt`, `expiresAt`, `firstSeenAt`, `lastSeenAt`, and `reviewedAt`.
- `docketNumber`, `regulationIdNumber`, `contentHash`, `supersedes`, and `supersededBy`.
- `actions`, where every action includes a source URL and a label such as “Ask your DSO,” “Review official instructions,” or “Check whether this applies to you.”

Public Firestore rules allow reads only when `editorialState` is `published-source-only` or `approved`. Browsers cannot write global news, source, review, lease, run, or university-source records. Administrative routes use Firebase Admin and require an `admin` custom claim or a UID in `ADMIN_UIDS`.

## News experience

### Navigation and landing page

Add `News` to desktop and mobile navigation. The page contains:

- An urgent strip for approved or source-only high-impact items.
- “For you,” “Federal,” “Your university,” and “Saved” views.
- Topic, visa, legal-state, date, and university filters.
- Search across titles, excerpts, publishers, and tags.
- Cards showing publisher, official-domain badge, document type, legal state, publication date, effective date, review label, short summary or official excerpt, affected audiences, and source link.
- A detail view with revision timeline, related proposal/final records, source-health timestamp, and actions.
- Empty and degraded-source states that explain coverage without implying no rules exist.

### Personalization

The matcher scores items using visa type, home-country ISO code, university ID, journey stage, topic subscriptions, saved notices, and deadlines. Users can inspect and change every preference. GlobeReady will never hide the complete federal feed; personalization only controls ordering, badges, digest inclusion, and notifications.

### Digest and notifications

Every user receives a weekly in-app digest assembled from the preceding seven days. It groups urgent changes, upcoming effective dates, university notices, and saved-item reminders. Users can change digest frequency to daily, weekly, or off.

Browser push uses Firebase Cloud Messaging and requires a user gesture, HTTPS, and explicit permission. Push sends only approved urgent items that match a user's preferences. Notification records remain in the in-app inbox even when browser permission is denied. Users can disable categories or all push notifications.

## Task and dashboard completion

### Tasks

Replace title-only quick-add with create and edit flows supporting:

- Title, notes, category, priority, due date, due time, time zone, reminder date, status, and source-news link.
- Validation that reminder time precedes due time.
- Filters for open, completed, overdue, category, and priority.
- Sorting by due date and priority.
- Duplicate, edit, complete, reopen, and delete actions.
- `.ics` download and a prefilled Google Calendar link. GlobeReady will not request broad Calendar OAuth access in this release.
- One-click task creation from news actions and assistant responses.

### Dashboard

- Replace the hardcoded 68 percent with a documented readiness score derived from profile completeness, overdue tasks, upcoming required tasks, document expirations, and unread urgent notices.
- Replace the static recommendation with the highest-scoring actionable task or news item.
- Make Ask GlobeReady, View all, Open guide, metric cards, and recent documents navigate to their destinations.
- Show source freshness and the count of relevant unread notices.
- Explain the readiness score so users know which actions change it.

### Saved resources

Guides gain All and Saved views. Users can unsave resources, search them, and create tasks from a guide. Demo-mode saves remain session-only and carry a demo label.

## Assistant completion

### Conversation history

Signed-in users can create, rename, list, and delete conversations. Messages persist in user-scoped Firestore collections. Each assistant message stores the answer, actions, confidence, disclaimer, official sources, document citations, selected document ID, mode, and timestamps. Demo conversations remain in memory.

The assistant interface renders actions, confidence, response mode, and disclaimers. A user can convert an action into a task. Deleting a conversation deletes its messages through a server endpoint or bounded batched client operation covered by Firestore rules.

### OCR and document indexing

Retain direct PDF text extraction as the first path. Add a `DocumentTextExtractor` interface with two implementations:

- `PdfTextExtractor` for PDFs with embedded text.
- `DocumentAiOcrExtractor` for scanned PDFs, PNG, and JPEG documents when `DOCUMENT_AI_PROCESSOR_NAME` is configured.

The indexer selects OCR when embedded PDF text falls below a minimum readable-character threshold or when the file is an accepted image. OCR output retains page number, text, and confidence. The UI marks low-confidence pages and tells the user to compare the citation with the original document. Failed OCR removes partial chunks and preserves the original vault file.

The service will not send identity documents to an OCR provider unless the deployment privacy notice names the provider and an administrator has enabled `DOCUMENT_OCR_ENABLED=true`.

### Vector retrieval

Store embeddings using Firestore vector fields and query with a user pre-filter plus optional document ID. Create the required vector indexes in repository configuration. Keep the in-memory cosine implementation for tests and demo mode. Retrieval returns six nearest candidates, applies a maximum cosine-distance threshold, and refuses document-grounded claims when no candidate passes.

Existing array embeddings require a migration script. The migration is idempotent, supports dry-run, reports counts, and never deletes the old field until the new field and index pass verification.

## API surface

Authenticated user routes:

```text
GET    /api/news
GET    /api/news/:id
GET    /api/news/preferences
PUT    /api/news/preferences
POST   /api/news/:id/save
DELETE /api/news/:id/save
GET    /api/notifications
PATCH  /api/notifications/:id
POST   /api/push-subscriptions
DELETE /api/push-subscriptions/:id
GET    /api/conversations
POST   /api/conversations
PATCH  /api/conversations/:id
DELETE /api/conversations/:id
GET    /api/conversations/:id/messages
POST   /api/conversations/:id/messages
```

Administrative and scheduler routes:

```text
GET    /api/admin/news/sources
POST   /api/admin/news/sources
PATCH  /api/admin/news/sources/:id
POST   /api/admin/news/sources/:id/run
GET    /api/admin/news/review
PATCH  /api/admin/news/review/:id
GET    /api/admin/news/health
POST   /api/internal/news/sync
```

`/api/internal/news/sync` requires a scheduler identity or timing-safe comparison against `NEWS_SYNC_SECRET`. It accepts a bounded source batch and is idempotent. The command-line job calls the same service directly so tests do not depend on HTTP.

## Scheduling and deployment model

The repository will contain a scheduler-neutral `syncNews` service and two invocation options:

- A Firebase scheduled function using `onSchedule`, intended for production after billing approval.
- A GitHub Actions scheduled workflow for non-production monitoring and contract tests.

Production uses the Firebase scheduler only after the user approves billing and deployment. The scheduled function runs federal sources every six hours and university sources daily. The implementation will document expected invocation counts, source request counts, OCR costs, Gemini costs, Firestore read/write volume, and FCM requirements before enabling services.

The public preview keeps ingestion, OCR, uploads, RAG, and push behind feature flags until the required services and security checks pass. The News interface may use checked-in synthetic fixtures in demo mode.

## Security and privacy

- Accept only verified HTTPS sources. Block loopback, link-local, private-network, non-HTTP, credential-bearing, and cross-domain redirect targets.
- Sanitize imported HTML and render it as plain text. Never execute scripts or trust source instructions.
- Store no cookies or authenticated content from monitored sites.
- Limit stored university excerpts to 500 characters. Keep comparison snapshots in an admin-only bucket and delete them after 90 days unless a legal-state revision requires longer provenance.
- Validate every model output against a closed schema and official URL allowlist.
- Treat imported content as untrusted data in every model prompt.
- Rate-limit public news queries, assistant requests, source submissions, and admin mutations separately.
- Record admin approvals, rejections, edits, and timestamps in an append-only audit trail.
- Let users delete conversations, saved items, preferences, push subscriptions, tasks, documents, and their account data.
- Update the privacy notice to identify Firebase, Gemini, Firebase Cloud Messaging, and Google Document AI when enabled.

## Error behavior

- A failed source does not remove prior published notices.
- A changed page that fails classification appears in the review queue and does not overwrite the prior approved summary.
- A malformed date remains unknown. GlobeReady never infers an effective date from publication date.
- A generated summary failure leaves the official source-only card available.
- A push failure leaves the in-app notification unread and records a delivery error.
- A university with no verified feed displays its coverage state and a source-submission action.
- An OCR failure leaves the document downloadable and marks indexing as failed with a safe error.
- A vector-index configuration error falls back to bounded user-scoped retrieval only when the chunk count stays below the configured safety limit; otherwise the assistant returns general guidance.

## Testing strategy

### Server

- Contract tests for each adapter using checked-in official-format fixtures.
- URL canonicalization, hashing, deduplication, revision linking, legal-state transitions, and idempotency tests.
- SSRF, redirect, MIME, size, timeout, malformed feed, invalid date, and source-allowlist tests.
- Classification schema and high-impact publication-gate tests.
- Source lease, retry, stale-health, and concurrent-run tests.
- Firestore store tests for global and user-scoped collections.
- Admin authorization, scheduler-secret, news query, preferences, saved-news, notifications, conversations, and deletion tests.
- OCR selection, low-confidence, cleanup, and disabled-provider tests using injected extractors.
- Vector-query and bounded-fallback tests using injected stores.

### Client

- News filters, legal/editorial labels, source links, saved state, personalization, degraded coverage, and revision timeline tests.
- Admin review and source-health tests.
- Task create/edit validation, filters, reminders, calendar links, and news-to-task tests.
- Dynamic dashboard score and navigation tests.
- Saved-guide management tests.
- Conversation persistence, action rendering, citations, task conversion, and deletion tests.
- OCR status and low-confidence warning tests.
- Responsive tests for 375 px mobile and desktop layouts.

### Security and release

- Firebase emulator tests proving users cannot write global news or read another user's data.
- Two-user synthetic-document test for Storage, OCR, RAG chunks, conversations, and notifications.
- Feed replay test proving proposal-to-final-to-effective transitions do not duplicate notices.
- Accessibility checks for keyboard navigation, focus, labels, contrast, and notification permission controls.
- Production client build, server syntax/lint, dependency audits, and Docker build in CI.
- A dry-run source sync that performs no Firestore writes and reports candidates, changes, errors, and estimated operations.

## Acceptance criteria

The feature program is complete when:

1. GlobeReady imports and deduplicates synthetic Federal Register, agency feed, index-page, and university sitemap fixtures through one adapter contract.
2. High-impact items publish official source data immediately but withhold generated summaries until approval.
3. Users can browse, filter, save, and personalize news while inspecting source freshness and legal state.
4. Administrators can manage sources, review summaries, inspect failures, and replay a source safely.
5. Signed-in users receive in-app digests and may opt into approved urgent browser notifications.
6. Tasks support complete fields, editing, reminders, filters, and calendar export.
7. Dashboard metrics, readiness, recommendations, and buttons use live application state.
8. Guides support saved-item management.
9. Assistant conversations persist, display full structured responses, and create tasks from actions.
10. Text PDFs, scanned PDFs, PNGs, and JPEGs can enter the document index when their required extraction provider is configured.
11. Firestore vector search replaces unbounded chunk loading in live mode, with a tested safety fallback.
12. Tests, build, audits, Firebase rules, and Docker CI pass.
13. Documentation states the exact services, costs, privacy implications, source coverage, and remaining production release checks.
14. No deployment, scheduler activation, paid API activation, or real-user notification occurs without explicit approval.

## Success metrics

- At least 95 percent successful checks across enabled federal sources over a rolling seven-day window.
- Every published item includes a verified official URL, publisher, publication or first-seen date, editorial state, and last-checked timestamp.
- Every high-impact generated summary has an approval audit record.
- Duplicate rate below 2 percent in the feed replay corpus.
- Source-only publication latency below one scheduler interval for healthy sources.
- Zero cross-user reads or writes in emulator and two-user tests.
- Zero push notifications sent without an explicit user subscription.

## Operational truthfulness

GlobeReady will display a coverage page rather than claim omniscience. The page lists enabled sources, supported universities, degraded monitors, excluded source types, and last successful checks. A footer on every news detail page states: “GlobeReady monitors selected official sources and may miss or delay an update. Read the linked source and consult your DSO or a qualified professional before acting.”
