# GlobeReady zero-cost completion design

Date: 2026-10-14

## Objective

Finish the strongest practical $0 version of GlobeReady for real international students without creating infrastructure, spending money, deploying, or weakening the product's legal-information safeguards.

The work extends the current branch, `codex/globeready-zero-cost-public`. It must preserve the existing local-user environment, zero-cost Firebase design, reviewed static news artifacts, browser-only private tools, account export and restore, document processing, and release gates.

## Success criteria

The completed repository must:

1. Collect official-source update candidates on a schedule and identify additions, meaningful edits, removals, redirects, stale sources, and collection failures.
2. Keep every collected candidate out of the public feed until a human reviews and approves it.
3. Give a reviewer enough evidence to approve, reject, correct, archive, or defer a candidate without losing source history.
4. Give students useful university-specific navigation without implying that an unreviewed university or link has been verified.
5. Provide a consistent, accessible, responsive interface across every student-facing page.
6. Produce a repository that is ready for free preview provisioning, with every external or destructive verification step listed and deferred.

## Constraints

- Spend $0 during implementation.
- Do not push, merge, deploy, provision Firebase or Google Cloud resources, create domains, enable billing, or call paid AI services.
- Do not auto-publish legal or status guidance.
- Use official primary sources for update candidates.
- Preserve source URLs, collection times, review state, and correction history.
- Keep student-entered local data out of monitoring and publishing workflows.
- Do not commit `.claude/`, `.local/`, handoff files, bundles, mboxes, environment files, credentials, or generated secrets.
- Write a failing test before each behavior change.
- Keep live Google login, deployed-host checks, and destructive account deletion tests deferred until the user authorizes them.

## Existing foundation

The repository already contains the main building blocks:

- `.github/workflows/propose-news-update.yml` runs a weekly candidate-collection workflow and opens a human-review pull request.
- `server/src/news/` contains source adapters, fetching controls, approval policy, classification, lifecycle, snapshot, coverage, image, URL, and robots policies.
- `server/data/reviewed-public-news.json` and generated public artifacts supply the zero-cost feed.
- `NewsAdminPage`, `CoverageLedger`, static-news verification, public source health, and university coverage labels already exist.
- CI covers the client, server, Firebase emulator rules, production image, audits, and fail-closed checks.
- The client already includes onboarding, help, news discovery, profile relevance, document tools, planning, life tools, browser-only backup, and account controls.

The completion phase must extend these components instead of creating parallel systems.

## Workstream 1: official-source change monitoring

### Source registry

Use the existing source registry as the single definition of monitored sources. Each source must declare:

- stable source ID and publisher;
- official HTTPS origin and collection adapter;
- topics and visa tags that the source may cover;
- expected collection cadence;
- whether robots policy permits collection;
- active, paused, or retired status;
- last successful collection and last human review.

Federal Register, USCIS, DHS, ICE/SEVP, Department of State, and IRS international-student sources form the initial federal set. A source can join the active set only after its adapter and URL policy pass the existing onboarding checks.

### Change detection

Normalize fetched entries before comparison so tracking parameters, insignificant whitespace, and presentation-only markup do not create false changes. Compute a stable content fingerprint from the fields that affect students: title, canonical URL, publication or effective date, source summary, and relevant source text.

For every collection run, classify each result as:

- `new`: no prior snapshot exists;
- `changed`: the meaningful fingerprint differs;
- `redirected`: the canonical official URL changed;
- `removed`: a previously observed entry remains absent for the configured confirmation window;
- `unchanged`: no meaningful difference;
- `failed`: the collector could not establish the source state.

One transient failure must not mark content removed. Removal requires successful source collections across the confirmation window. Redirects must pass the official-domain and SSRF protections before the system records them.

### Candidate artifact

The scheduled workflow writes a deterministic, size-bounded review artifact. Each candidate contains:

- candidate and source IDs;
- change type;
- current and previous source snapshots;
- field-level differences;
- canonical source URL;
- observed and collected timestamps;
- source-health context;
- suggested topic and visa tags from deterministic rules;
- publication state `unreviewed`.

Candidates contain no AI-generated legal interpretation. The workflow may summarize field differences with deterministic text. It omits unchanged entries and previously resolved candidate versions.

### Workflow behavior

The existing GitHub Actions workflow remains the $0 scheduler. It runs weekly and on manual dispatch, applies least-privilege permissions, enforces concurrency, and opens or updates one review pull request. A collection failure still produces source-health evidence but cannot modify reviewed public news.

The implementation must also provide a local command that produces the same artifact without network calls when fixture inputs are supplied. Tests use fixtures only.

## Workstream 2: review and publishing operations

### Review queue

Extend the existing news administration surface and local tooling around one shared candidate schema. The reviewer must be able to filter by source, change type, topic, visa tag, collection date, and review state.

Candidate detail shows:

- the official source and collection time;
- old and new values side by side;
- a concise deterministic change list;
- source-health warnings;
- image provenance and fallback state;
- all fields that would enter the public record.

### Review decisions

The supported decisions are:

- approve as a new reviewed record;
- approve as a correction or update to an existing record;
- reject with a bounded reason code and optional reviewer note;
- defer for later review;
- archive or retract a previously published item with a public correction note.

Approval requires the reviewer to confirm the official source, title, dates, legal state, factual summary, affected tags, and image policy. The application must refuse incomplete approvals.

### Publication boundary

Only reviewed records generate `client/public/data/news.json` and related static artifacts. The generator must remain deterministic. CI fails if committed artifacts do not match reviewed input or if an unreviewed candidate appears in a public artifact.

Corrections preserve the stable public item ID and append review metadata. Retractions remain discoverable in the archive with a plain explanation; the feed must not silently erase published history.

### News images

Prefer an explicitly reviewed official image whose reuse and origin fields satisfy the existing image policy. Otherwise use the current local topic illustration. The product must never hotlink an arbitrary candidate image or present an unrelated stock image as evidence.

## Workstream 3: university coverage

### Reviewed registry

Keep `reviewedUniversities` as the client-visible registry for the zero-cost build. Add a schema and validation command so each reviewed university entry includes:

- stable ID, official name, and official domain;
- review date;
- international office, advising, emergency, health, and academic-calendar links when verified;
- per-link review state and optional note;
- no claim that GlobeReady represents or partners with the university.

The first completion pass proves the system with a small fixture-backed reviewed set. It does not fabricate or bulk-claim coverage for every university.

### Unreviewed universities

When a student enters a university that is not reviewed, GlobeReady may generate official-domain search links from the student's domain. Each generated link must say that GlobeReady has not checked the result. If no domain exists, the page asks the student to add one and provides general resources.

Student-entered office contacts and links remain labelled `Entered by you`. Reviewed links remain labelled `Reviewed by GlobeReady` with the review date. Federal news relevance must remain separate from university-specific coverage.

### Scalable maintenance

Provide a deterministic validation and generation path for future registry additions. Reject duplicate IDs, invalid domains, non-HTTPS links, off-domain links without an explicit allowed reason, impossible review dates, unknown office types, and oversized fields.

## Workstream 4: product-wide polish

### Navigation and information architecture

Keep the current Home, Updates, Ask, Plan, and Life organization. Remove duplicate routes or links only when the destination remains reachable. Desktop and mobile navigation must use the same labels and grouping.

Every primary page must provide:

- one `h1`;
- a short purpose statement or contextual help;
- a useful loading, empty, error, and offline state where applicable;
- a clear next action;
- no dead controls.

### Visual system

Use the existing design system as the source of truth. The final interface uses white and soft neutral surfaces, restrained blue and sage accents, readable dark text, consistent spacing, and limited elevation. It must avoid decorative gradients, saturated backgrounds, cramped dashboards, and inconsistent card treatments.

### Responsive and accessible behavior

All student-facing routes must pass checks at 390 px and 1280 px with:

- no horizontal overflow;
- touch targets at least 44 px;
- visible keyboard focus;
- labelled inputs and buttons;
- semantic headings and landmarks;
- status and error announcements;
- reduced-motion support;
- acceptable color contrast.

The review must include long titles, empty datasets, maximum supported list sizes, offline state, and signed-out state. Automated structure checks supplement, but do not replace, the final browser pass.

### Trust language

Use the same vocabulary across the app:

- `Reviewed by GlobeReady` for checked records;
- `Entered by you` for student content;
- `Not reviewed` for generated or unverified links;
- `Date you entered` for personal dates;
- `Informational, not legal advice` where a student could mistake guidance for a legal conclusion.

Remove claims that imply complete source monitoring, automatic legal interpretation, guaranteed timeliness, document validation, or university endorsement.

## Workstream 5: release preparation

### Repository gates

The completion gate includes:

- focused tests for each new behavior;
- complete client and server suites;
- Firestore/Auth/Storage emulator suites when rules or account behavior are touched;
- production and zero-cost client builds;
- server and client production dependency audits;
- syntax and lint checks;
- deterministic static-artifact checks;
- workflow syntax and permission checks;
- responsive and accessibility checks;
- `git diff --check` and a secret/unwanted-file scan.

No test may depend on a live government, university, Firebase, Gemini, or email service.

### Preview-ready documentation

Update the zero-cost setup, privacy, news operations, university review, and release-readiness documents. A person following the documentation must know:

- which Firebase Spark resources to create later;
- which settings remain free and which prompt for billing;
- how to configure Google and email sign-in;
- how reviewed news moves from candidate to publication;
- how to add a reviewed university;
- how to roll back a bad static release;
- which checks still require a real preview.

### Deferred live checks

The final report must keep these pending until separately authorized:

- push and GitHub-hosted CI;
- Firebase project creation and preview deployment;
- real Google sign-in and email verification delivery;
- hosting headers, MIME types, service worker, and quota behavior;
- disposable-account export, restore, and destructive deletion smoke test;
- domain purchase and DNS;
- paid production API, Storage, Gemini, email, push, monitoring, and backup services.

The repository can be ready for these steps without claiming that they passed.

## Data and safety boundaries

- Candidate and reviewed news contain public official-source material only.
- The monitoring pipeline cannot read student profiles, documents, tasks, localStorage, or Firestore student collections.
- Profile relevance runs after publication and remains a tag comparison, not a legal decision.
- Review notes must not enter the public artifact unless the reviewer writes an explicit public correction note.
- Logs and workflow output must exclude credentials, response bodies that may contain unexpected personal data, and full exception dumps from fetched pages.
- Fetching retains the existing SSRF, HTTPS, redirect, size, timeout, content-type, and robots safeguards.

## Failure behavior

- A source failure marks that source delayed or failing and leaves the last reviewed feed intact.
- A malformed candidate aborts candidate generation; it cannot be partially published.
- An incomplete review decision remains unpublished.
- An artifact mismatch fails CI.
- An unavailable university page falls back to labelled official-domain search or general resources.
- A UI request failure shows a retry path and does not replace known-good content with an empty success state.

## Delivery sequence

Implement the five workstreams in dependency order:

1. Monitoring schema and change detection.
2. Review decisions and deterministic publication.
3. University registry validation and student-facing coverage.
4. Product-wide UX and accessibility polish.
5. Full repository verification and release documentation.

Each workstream receives its own test-first tasks and local commits. The branch remains local until the user gives separate push authorization.

## Out of scope

- Legal advice or personalized eligibility decisions.
- Automatic publication from scraped content.
- Automatic AI summaries presented as reviewed facts.
- Claiming verified coverage for all universities.
- Live trading, payments, subscriptions, advertising, or analytics.
- Paid infrastructure, custom domains, email, push, Gemini, and production service guarantees.
- Final live verification without a provisioned preview environment.
