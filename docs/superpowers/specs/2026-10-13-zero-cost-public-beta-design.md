# GlobeReady Zero-Cost Public Beta Design

## Objective

Publish the strongest safe GlobeReady beta that can operate with a hard recurring infrastructure budget of zero dollars. Real students must be able to sign in, organize their journey, read source-transparent updates, and work with documents without GlobeReady uploading the original files. The product must disclose that schedules and source coverage are best-effort and must never present free-tier infrastructure as guaranteed production service.

## Non-negotiable boundaries

- No billing account, paid API, purchased domain, paid hosting, or paid monitoring.
- No private student document or extracted passage is sent to a free third-party AI service.
- Original documents remain on the student's device and are never uploaded in zero-cost mode.
- The free product does not claim an SLA, guaranteed synchronization, universal university coverage, legal advice, or uninterrupted availability.
- Existing production mode and its fail-closed controls remain intact for a later paid deployment.

## Runtime architecture

Add an explicit `zero-cost-public` client runtime alongside production, demo, and local-user. It is a static application hosted on Firebase Hosting's no-cost tier and uses Firebase Authentication plus direct, rules-protected Firestore access. It never boots the Express API and never expects Cloud Storage, Cloud Run, Gemini, service-account credentials, or a server secret.

Build-time configuration selects the runtime. Production continues to require its API URL and server contracts; zero-cost-public refuses configuration that contains an API URL, Storage bucket, emulator wiring, or a private AI endpoint.

## Identity and student data

Use Firebase email/password and Google authentication. Profiles, tasks, saved resources, news preferences, notification state, consent choices, and locally extracted document records remain scoped under the authenticated UID and validated by Firestore rules.

Account export is generated in the browser from the user's readable collections. Account deletion first deletes the user's Firestore records in bounded batches and then reauthenticates and deletes the Firebase identity. Failures remain retryable and must never claim full deletion when cleanup is incomplete.

## Private documents

Replace cloud upload in zero-cost-public mode with browser-only processing:

1. The student explicitly chooses a supported PDF, PNG, or JPEG.
2. The client validates type, signature, and size before reading.
3. Text-based PDFs are parsed in a Web Worker; printed English images may use lazy-loaded browser OCR where the device supports it.
4. The original bytes never leave the browser and are discarded after processing.
5. With explicit document-reading consent, bounded extracted chunks, page references, hashes, and safe metadata are stored in the student's Firestore namespace. The UI clearly says the original file is not backed up.
6. Questions use deterministic term retrieval in the browser and quote matching passages with page citations. No generated answer is offered in this runtime.

Unsupported, scanned, oversized, encrypted, malformed, or memory-intensive documents fail safely with actionable copy. The paid production document pipeline is not removed.

## Updates and scheduled collection

Public news is a signed-in read-only static artifact bundled with the client. A repository script runs the existing bounded official-source adapters, validates URLs and content, applies the existing publication policy, and emits deterministic JSON plus a coverage manifest. It must never include private review data or unreviewed AI summaries.

A scheduled GitHub Actions workflow may run within the repository's included Actions allowance. It fetches only approved official sources, validates the artifact, and opens or updates a review pull request when content changes. It does not publish directly to students. Merging the reviewed artifact triggers the normal static deployment. Schedule delay, workflow suspension, parser failure, and stale data are visible through generated freshness metadata.

Federal Register is enabled because it already has a verified adapter contract. Additional sources remain pending until each has deterministic fixtures, current official endpoint verification, robots and URL-policy checks, and human approval. Universities remain opt-in and verification-gated; zero-cost mode does not imply universal coverage.

## Orientation, truthfulness, and feature availability

The interface retains the professional responsive shell, Getting Started board, tasks, resources, news reader, archive, filters, lifecycle labels, coverage ledger, in-app reminders, privacy controls, export, and deletion.

Zero-cost-public shows a persistent, concise environment disclosure in Settings and contextual document/news copy. Controls for server AI, original-file backup, email delivery, push delivery, and guaranteed background refresh are absent or explicitly unavailable—not dead controls.

## Security and privacy

- Firestore rules are the authorization boundary and receive dedicated emulator tests for every direct client write.
- App Check may be enabled only if its selected attestation path remains free; the app must not claim App Check protection until live enforcement is verified.
- Content Security Policy, frame restrictions, referrer policy, MIME protections, and cache headers are configured at static hosting.
- Browser document workers cannot access Firebase credentials beyond the normal client SDK and receive only the chosen file bytes.
- Analytics and advertising are disabled by default.
- Logs contain no student content, document text, tokens, or filenames.

## Failure behavior

Authentication or Firestore quota exhaustion produces an honest temporary-unavailable state. News artifacts older than their declared cadence show as delayed. Browser extraction failures keep the original file local and write nothing. Partial account cleanup reports what remains and provides a retry path. The UI never falls back from zero-cost-public into demo data without an explicit development build.

## Verification and release gates

- Test-first unit coverage for runtime selection, direct data access, document validation/extraction/retrieval, export/deletion, static-news integrity, stale coverage, and unavailable features.
- Firestore emulator tests for all zero-cost-public reads and writes.
- Client production build contains no emulator address, API secret, server URL, Storage upload path, or private test fixture.
- Accessibility checks for keyboard navigation, focus, labels, contrast, reduced motion, and mobile layout.
- Browser journeys for sign-up/sign-in, profile, tasks, document-local processing, cited retrieval, news filters, export, and deletion.
- Dependency audit, secret scan, CSP inspection, artifact-size check, and `git diff --check`.
- A preview deployment is tested before the public channel is updated.

## External setup allowed in this phase

Only no-cost resources are allowed: a Firebase Spark project, Firebase web app, Authentication providers, Firestore, Firebase Hosting on its generated subdomain, and GitHub Actions/secrets already included with the repository account. If any console step requests billing, a paid plan, credit purchase, or domain purchase, stop that path and preserve the completed code.

## Explicitly deferred

- Cloud Storage and original-file backup
- Server-side OCR and private-document AI generation
- Cloud Run/API hosting and guaranteed scheduler
- Paid Gemini, email, push, backups, logging, SLA, custom domain, legal review, and universal source operations
- Any feature whose provider ceases to offer a sufficient no-cost tier
