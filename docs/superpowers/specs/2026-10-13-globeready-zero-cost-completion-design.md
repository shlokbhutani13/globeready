# GlobeReady Zero-Cost Completion Design

## Objective

Complete every production-relevant capability that can be built and verified locally without purchasing a domain,
attaching billing, provisioning cloud resources, deploying services, or creating live provider credentials. The result
must be ready for a later provisioning phase and must describe source coverage honestly rather than claiming complete
knowledge of every rule or university.

## Scope boundary

This phase changes repository code, tests, fixtures, documentation, and local verification only. It may add
provider-neutral interfaces and deployment-ready configuration templates. It must not create or modify Firebase,
Google Cloud, Gemini, email-provider, DNS, hosting, or domain resources.

The supported launch geography remains international students studying in the United States. Coverage may include
federal and university sources, but every source must have an explicit operational state. GlobeReady must never infer
that no rule changed merely because an unmonitored or failing source produced no item.

## 1. Coverage ledger

Add a server-owned coverage ledger derived from the registered source catalogue and stored source state. It represents:

- authority and publisher;
- jurisdiction and topic coverage;
- student audiences and visa types;
- adapter and verification state;
- enabled, pending, disabled, delayed, and failing states;
- expected check cadence and last successful check;
- documented limitation or pending reason;
- university identity for institution-specific sources.

Expose a safe public projection through the authenticated Updates API and an expanded administrator projection through
the existing administration API. Private notes, selector details, snapshots, secrets, and review identities must not
appear in the public response.

The student interface must summarize federal and university coverage and link to the detailed coverage view. It must
distinguish monitored, pending, delayed, and not-yet-covered sources.

## 2. Official-source contracts

Retain fail-closed source ingestion. A federal source becomes enabled only when its current official endpoint has a
bounded parser contract, deterministic fixtures, canonical URL rules, content-type limits, and failure tests. Sources
whose public pages do not permit reliable automated retrieval remain disabled with a visible reason.

This phase may improve adapters and contract tests for the existing USCIS, SEVP, Study in the States, Department of
State, CBP, IRS, SSA, Labor, and White House entries. It must not mark a source operational based only on an assumed CSS
selector or one successful manual request.

University sources use the existing suggestion and administrator-verification flow. Add a reusable onboarding record
and checklist; do not bulk-enable unverified university domains.

## 3. Scheduler-neutral operations

Add a local and provider-neutral job runner around the existing synchronization service. It must support:

- dry run by default;
- one source or a bounded source batch;
- idempotency keys for repeated scheduled invocations;
- structured run summaries and non-zero failure status;
- explicit enablement for writes;
- no live network access in tests;
- cleanup of expired official-source snapshots;
- detection and reporting of delayed and failing sources.

Repository workflows may run fixture-based source contract tests. No scheduled cloud function, GitHub schedule that
contacts live sources, or production job is enabled in this phase.

## 4. Corrections, supersession, and retractions

Extend update lifecycle metadata so a published item can reference a corrected, superseded, withdrawn, or replacing
official item. Administrator mutations must remain atomic and audited. Student cards and detail views must show the
current lifecycle state and preserve the official link and revision history.

No automatic classifier may silently retract or replace an item. Automated detection creates a review candidate;
publication changes require the existing administrator boundary.

## 5. Digests and newsletter preparation

Complete deterministic daily and weekly digest generation from published items and student preferences. Digests group
urgent changes, upcoming effective dates, university notices, saved items, and coverage warnings. Personalization
changes ordering and inclusion in a digest but never removes access to the full federal feed.

Add a provider-neutral email delivery interface with a disabled implementation used by default. It must support
idempotent delivery records, retries, unsubscribe state, safe official links, and rendering tests. No provider SDK,
API key, sender domain, or outgoing message is configured in this phase. In-app digest records remain usable without
email.

## 6. University onboarding

Add an administrator workflow that moves a suggested university source through proposed, verifying, verified-disabled,
enabled, delayed, and rejected states. Verification records the official university domain, source URL, adapter type,
robots result, parser-contract fixture, cadence, supported topics, and reviewer decision.

A `.edu` hostname is evidence of an institutional domain, not sufficient proof that a particular page is safe or
complete. Student-facing coverage must remain pending until the full verification checklist passes.

## 7. Operational observability

Extend the existing source-health administration view with:

- last attempt and last success;
- consecutive failure count;
- next expected check;
- delayed-since timestamp;
- parser-contract version;
- latest run outcome;
- actionable reason when disabled or failing.

Add a local operational report command that produces bounded JSON from repository and emulator data. It must not expose
student content, credentials, tokens, snapshots, or private review notes.

## 8. Product truthfulness

Replace broad claims such as “all updates” with exact coverage language. The Updates experience must always state:

- which federal sources are actively monitored;
- whether the student's university is covered, pending, delayed, or not covered;
- when each active source last succeeded;
- that GlobeReady provides general information and students should confirm high-risk decisions with an official agency
  or designated school official.

Local-user mode continues to show only clearly labelled synthetic updates. It must not contact live sources or send
email unless a developer deliberately runs a separate dry-run command.

## 9. Verification

Every behavior change follows test-first development. Completion requires:

- full server unit and integration tests;
- Auth, Firestore, and Storage emulator suite;
- full client tests and production build;
- fixture-based source contract tests;
- scheduler, idempotency, cleanup, correction, digest, unsubscribe, and provider-disabled tests;
- server and client production dependency audits;
- lint and syntax checks;
- production container build, offline extraction test, vulnerability scan, and fail-closed matrix;
- browser verification of coverage disclosures, update lifecycle states, digest settings, and university-source status;
- `git diff --check`;
- independent final review before the completion checkpoint.

## Deferred paid and external work

The following are explicitly deferred until separate approval:

- domain registration and DNS;
- Firebase and Google Cloud production projects;
- billing and budgets;
- Storage bucket and production Firestore;
- API and client hosting;
- real scheduler jobs;
- sender domain and email provider;
- Gemini production key;
- monitoring and backup services;
- live source synchronization and live-user testing.

The repository must remain deployable later, but no test or local command may require these resources.

