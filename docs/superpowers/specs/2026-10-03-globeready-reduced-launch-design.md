# GlobeReady Reduced Launch Design

## Objective

Ship a nationwide US web application that real international students can use for verified updates, personal planning, document questions, and account management. Reduce engineering work by sharing infrastructure and removing production systems that do not change the core student experience.

GlobeReady provides general information, not legal advice. Every immigration or status-related update identifies its official source and freshness. High-risk questions direct students to the relevant government agency, their designated school official, or another qualified professional.

## Product areas

### Updates

Students can browse the complete national feed and receive ranked results based on visa type, nationality, university, program dates, and selected topics. Each update shows legal state, effective date when known, publisher, official link, freshness, and source-health status. Students can filter and save updates.

Federal sources use the existing verified source registry. University coverage grows through submitted `.edu` sources that remain disabled until verified. The interface reports partial, pending, and delayed coverage without implying that silence means no change occurred.

### My Plan

Students can create tasks and deadlines, receive reminders, and view a simple calendar. Update cards and document answers may suggest tasks, but students control whether those tasks enter their plan.

### Documents and Assistant

Students can upload bounded PDF and image files. One extraction pipeline produces text with page references. The assistant answers questions using the uploaded document and approved official sources, cites the relevant page or source, and refuses unsupported conclusions.

Failed extraction preserves the upload and exposes a retry state. The system does not invent missing dates or requirements.

### Account

Students can manage their profile, topics, university, visa information, digest preferences, and email settings. They can export their data and permanently delete their account through explicit confirmation.

## Update pipeline

1. The scheduler checks registered official government sources and enabled, verified university sources.
2. GlobeReady stores a private source snapshot and detects content changes.
3. Verified source text may publish as a source-only card.
4. Generated explanations and actions remain private until an administrator validates them against the current content revision and committed snapshot.
5. The system ranks published updates for each student without hiding the rest of the feed.
6. Matched updates create in-app notifications and optional email digests.

Approval, rejection, and their audit record commit atomically. Public projections use explicit allowlists. They exclude reviewer identity, drafts, snapshots, hashes, validation evidence, and internal notes.

If a source check fails, the feed displays a delayed-source state and retains the last verified item. Disabled, unverified, and verification-pending sources cannot run, including dry runs.

## Simplified architecture

The existing Express API, Firestore stores and rules, Firebase authentication, secure fetcher, adapters, and news synchronization remain the foundation.

The launch version uses:

- One responsive React web application.
- Firestore queries and deterministic ranking instead of vector search.
- In-app notifications and email digests instead of browser push.
- One document extraction pipeline for PDFs and images instead of a separate OCR subsystem.
- One small administration area for source health and editorial review.
- One scheduler path in the existing server rather than a separate Firebase Functions package.

The repository keeps vector-ready data interfaces only where they do not add launch work. No embedding generation, vector migration, browser service worker, native application, or advanced recommendation engine ships in the first release.

## Reduced work packages

### 1. Secure API completion

Finish the active Task 7 review fixes: strict canonical source validation, current-revision and snapshot-bound approval, atomic decision audits, safe public projection, source eligibility enforcement, and resolvable source suggestions.

### 2. Student workspace

Build the news feed, source-health states, saved updates, tasks, reminders, calendar, notification inbox, university coverage view, and administration screen as one responsive interface. Reuse shared cards, filters, status components, and forms.

### 3. Documents, assistant, and account

Build upload and extraction for PDFs and images, grounded document questions, conversation history, profile and preferences, email settings, export, and deletion. Use bounded Firestore retrieval for launch.

### 4. Release verification

Test authentication, cross-user isolation, public/private projections, stale approval rejection, source failures, disabled sources, upload limits, document citations, reminders, email preferences, accessibility, mobile layouts, export, deletion, and the main student journeys. Add CI and deployment documentation. Deployment still requires explicit approval.

## Launch exclusions

The first release does not include browser push, a service worker, a separate scheduled-functions package, vector embeddings, vector migration, multiple digest engines, a separate advanced OCR service, a preloaded integration for every university, native mobile applications, or extensive analytics and customization.

These exclusions simplify the implementation, not the student-facing promise. Students still receive nationwide verified updates, personalized ranking, university-source support, planning, notifications, document help, and account controls.

## Success criteria

- A student can register, create a profile, browse and save verified nationwide updates, and understand coverage health.
- A student can manage tasks, deadlines, reminders, and an in-app notification inbox.
- A student can upload a supported document and receive cited, source-grounded answers.
- An administrator can verify sources and approve or reject generated explanations without stale revisions or partial audit state.
- Users cannot read or modify another user's data, private news state, reviews, snapshots, or audit records.
- Source failures and unknown information appear as explicit uncertainty rather than empty or fabricated results.
- Core flows work on a 375-pixel mobile viewport and meet basic keyboard and screen-reader requirements.
- The full automated test, emulator security test, build, lint, production dependency audit, and end-to-end smoke suite pass before deployment.
