# GlobeReady News and Orientation Design

## Purpose

Turn GlobeReady's existing verified-update infrastructure into a useful daily news experience for international students. Students should immediately see important visual stories, understand how each development affects them, search the complete archive, and learn where the rest of the product lives without confronting a complicated onboarding flow.

## Product principles

- Official-source-first: a published story must trace to an approved government or university source.
- Source transparency: every story displays its publisher, official URL, publication date, last verification time, and legal state when applicable.
- AI explains; it does not manufacture news. Explanations must use stored story evidence and disclose uncertainty.
- Images support comprehension but are not evidence. Missing images use neutral category artwork rather than invented documentary imagery.
- The interface stays calm, professional, accessible, responsive, and consistent with GlobeReady's white/slate visual system.
- Empty, delayed, and incomplete coverage states are explained honestly.

## Current-state findings

The application already has news storage, ranking, legal-state filters, saved stories, preferences, digest settings, source-health reporting, university coverage, review workflows, and scheduled-sync foundations. Only the Federal Register source is currently enabled. USCIS, SEVP, Study in the States, Department of State, CBP, IRS, SSA, Department of Labor, and White House sources are registered but disabled because their bounded extraction contracts have not been verified. The local environment can therefore show no stories even though the UI and API are operating correctly.

This phase must improve both the presentation and the truthful explanation of source coverage. It must not silently claim universal monitoring.

## User experience

### News landing page

The page starts with a compact toolbar containing search, time range, topic, visa type, source, university, legal state, and saved-only controls. Common ranges are This week, This month, This year, and All time; a custom start/end range is also supported.

When stories exist, the first section is a visual Top Stories reader. It shows one story at a time on desktop and mobile with:

- a verified image or neutral category fallback;
- headline, short summary, publisher, date, legal-state badge, and relevance label;
- a concise "Why this matters" statement;
- previous and next controls, keyboard navigation, swipe navigation, and visible position;
- manual advancement by default and an optional Play/Pause control;
- Save, Read details, Explain with AI, and Official source actions.

The reader must pause autoplay on hover, focus, reduced-motion preference, tab invisibility, or any user interaction. It must not trap keyboard focus.

Below the reader, All News displays the complete matching archive in a responsive card/list layout. Search and filters apply to both surfaces. Pagination or cursor-based loading must preserve filter state and avoid implying that only the first page is searchable.

When no stories are available, the page explains whether the cause is no matching result, no completed synchronization, delayed sources, or limited source coverage. It links to the source-status section and offers Retry where appropriate.

### Story detail

Each story has a dedicated detail view containing:

- headline, image, publisher, publication and effective dates;
- plain-language summary and full verified detail;
- affected visa types, nationalities, universities, and topics;
- "What changed," "Who may be affected," "What to do," and "Important dates" sections when evidence supports them;
- legal state and revision history;
- official source links and verification metadata;
- related verified stories;
- Save and Explain with AI actions.

The detail view never converts an informational update into individualized legal advice.

### AI explanation

"Explain with AI" opens a focused explanation panel for the selected story. The server sends only the published story, its approved evidence, safe profile fields, and the student's question to the existing grounded assistant pathway. The response separates:

1. verified facts from the story;
2. likely relevance based on the student's saved profile;
3. practical questions to ask an international student office or qualified professional;
4. missing or uncertain information.

Every explanation includes citations to the stored official sources and the existing informational disclaimer. If the grounded assistant is unavailable, the original story remains fully usable and the UI states that AI explanation is temporarily unavailable.

### Getting Started board

First-time authenticated users see a small, dismissible Getting Started board. It contains five concise destinations: Home, Updates, Documents, Guides, and Ask GlobeReady. Each item explains its purpose in one sentence and navigates directly to the destination.

Completion or dismissal is stored per user. A Help / Getting Started entry remains accessible from navigation or settings. The board is not a modal, does not block product use, and contains no multi-step tour overlays.

## News data model

Published news items gain optional presentation and detail fields while retaining the existing source/evidence contract:

- `image`: canonical HTTPS URL, alt text, source URL, and attribution where required;
- `shortSummary` and `detailSections`;
- `whyItMatters`;
- normalized publisher/source identifiers;
- publication and effective timestamps suitable for range queries;
- search text generated only from verified published content;
- revision and verification timestamps.

All new fields must be bounded, sanitized, covered by the public news projection, and backward-compatible. Existing items without images or detail sections receive deterministic fallbacks.

## Images

Adapters may capture an image only from approved official-page metadata or an approved official media host. URLs are canonicalized and validated against source allowlists. The client must not hotlink unknown hosts. The preferred production design is a bounded server-side image proxy/cache with content-type, size, redirect, and host validation; local-user mode may use bundled category artwork.

Fallback artwork is bundled with the client and keyed by topic. It is abstract and neutral so it cannot be mistaken for evidence from the reported event. Alt text distinguishes a source image from category artwork.

## Search and filtering

The news API adds bounded filters for query text, source, date range, saved-only state where user context is available, and existing classification fields. Date filtering uses published time by default, with effective-date filtering exposed separately only when useful. Invalid ranges and unknown filters return explicit validation errors.

For local and modest production scale, normalized server-side filtering can use the existing store interface. The store contract must keep pagination deterministic. A future external search service is not introduced in this phase.

## Source ingestion and coverage

Source adapters remain isolated and fail closed. Each disabled source may be enabled only after fixtures and live-contract verification prove canonical URLs, dates, bounded extraction, allowlisted redirects, content types, and relevance behavior. The application exposes source state as active, delayed, failing, or pending verification.

The phase improves coverage incrementally rather than claiming "all news." The Federal Register remains the baseline. Other official sources are enabled only when they meet the existing trust model. University-source coverage continues to be explicit and institution-specific.

Synchronizations create reviewable revisions and do not publish unverified material. Local-user mode includes deterministic sample stories so the news experience can be evaluated without external network access.

## Components and boundaries

- `NewsPage`: query state, loading states, and composition only.
- `NewsToolbar`: search and accessible filters with URL-backed state.
- `TopStoriesReader`: navigation, optional autoplay, swipe, keyboard, and reduced-motion behavior.
- `NewsArchive`: paginated result collection.
- `NewsCard`: compact story presentation.
- `NewsDetailPage`: full verified story view.
- `NewsExplanation`: grounded AI request and cited response.
- `GettingStartedBoard`: simple orientation and per-user dismissal.
- News service/store: validated query, detail retrieval, image metadata, and explanation context.
- Source adapters: source-specific extraction with shared safety validation.

No component should combine ingestion, editorial decisions, and display behavior.

## Error handling and safety

- Broken images fall back without layout shift.
- Search and filters keep their values after transient failures.
- AI failures never hide the verified article.
- Delayed sources are named explicitly.
- Unverified or pending source material is never shown as published news.
- External links use safe targets and clearly identify the official destination.
- Image fetching blocks private networks, unapproved redirects, oversized files, and unsupported content types.
- Search inputs, query parameters, and generated explanations are bounded.

## Accessibility and responsive behavior

All reader controls have visible labels and focus states. Story advancement is announced without excessive live-region output. The reader honors reduced motion and never auto-starts. Touch targets are at least 44 pixels. Mobile uses a single story card and bottom-safe controls; desktop keeps content within the existing readable page width. Images preserve stable aspect ratios and meaningful alt text.

## Testing and completion criteria

The implementation is complete when:

- users can browse visual top stories and the full archive on desktop and mobile;
- search, weekly/monthly/yearly/custom ranges, classification filters, source filters, saved state, and pagination work together;
- story detail and grounded AI explanation show citations and safe failure states;
- source publisher and official URL are visible on every story;
- source-health and empty-state explanations accurately describe coverage;
- first-time guidance is dismissible, persistent, and reopenable;
- deterministic local sample stories demonstrate all key states without network access;
- adapter, route, store, component, accessibility, and end-to-end tests cover successful and failure paths;
- existing client, server, Firestore rules, Storage rules, emulator, audit, and production-build checks remain green;
- no production infrastructure, billing, deployment, domain, or cloud resources are created.

## Scope boundaries

This phase does not send real email or push notifications, deploy the application, purchase a domain, enable billing, create production cloud resources, scrape unapproved websites, offer individualized legal advice, or guarantee universal coverage of every university and government publisher.
