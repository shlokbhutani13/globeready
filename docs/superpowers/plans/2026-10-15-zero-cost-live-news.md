# Zero-cost live news ingestion implementation plan

**Approved brief:** the owner's 2026-10-15 “Automatic live news ingestion for GlobeReady” task.

**Goal:** enrich the zero-cost static news page with frequently refreshed official-source excerpts while preserving the stronger trust and personalization rules for human-reviewed records.

## Global constraints

- Work only on the feature branch based on `0552bcb`; do not push, deploy, or modify Firebase.
- The reviewed artifact remains authoritative and unchanged by automation.
- Automated records are excerpts with original links, never legal conclusions or personalized matches.
- Source or item failures are isolated and recorded; unsafe text and URLs never enter the artifact.

## Task 1 — Source registry and secure parsers

Create `config/news-sources.json`, a registry loader, RSS/Atom/HTML parsers, canonical URL and text sanitizers, image extraction, stable IDs, and deduplication. Extend only the zero-cost public-artifact tooling. Tests cover every parser type, sanitization, image policy, and duplicate handling.

## Task 2 — Resilient collector and real source run

Create the collector with timeout, retry, robots policy, per-source isolation, bounded responses and a machine-readable run report. Verify at least six enabled official/public sources against the network; disable and document failures. Generate `client/public/data/live-news.json` from the successful run. Tests cover retry and one-source failure isolation.

## Task 3 — Scheduled refresh workflow

Add a 4-hour/manual GitHub Actions workflow that installs locked dependencies, runs the collector, validates/tests the artifact, commits only changed live-feed data and the run report, and uses no secret except the repository token. It must not deploy or call Firebase.

## Task 4 — Zero-cost feed merge and trust boundary

Load and integrity-check both static artifacts in zero-cost/local-user modes, merge by canonical URL/title with reviewed records winning, and expose generated time/source failures. Prevent auto records from entering relevance ranking, review-only detail language or deadline suggestions. Tests cover labels, precedence, zero/many items and failure fallback.

## Task 5 — Responsive news UI

Render remote source images with the local illustration fallback, external “Read more” links with `target="_blank" rel="noopener noreferrer"`, correct singular/plural counts, source filtering, newest/oldest sorting, loading/error/last-updated states and accessible structure. Keep save/search behavior and one `h1`.

## Task 6 — Documentation and release gates

Document sources, schedule, source onboarding, copyright/excerpt stance, trust labels, operational limits and failures. Run real collection and report counts. Run all client/server tests, both builds, audits, artifact/sample scans, and responsive checks. Commit only source files and generated public artifacts; leave local handoff/bundle files untouched.

## Review focus

- Host allowlists and redirects cannot be used for SSRF or unsafe link/image injection.
- XML/HTML parsing cannot preserve scripts, styles, event handlers or article bodies.
- Auto items never receive `sourceVerified`, relevance, legal-state, or reviewed-detail treatment.
- One broken source does not erase successful sources or the previous valid artifact.
- Scheduled commits cannot recursively trigger themselves or modify unrelated files.
