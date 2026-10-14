# Zero-cost public beta

GlobeReady can run as a static, signed-in public beta on Firebase's no-cost (Spark) services. This mode is deliberately separate from the full production architecture. It uses Firebase Authentication and Firestore directly, serves reviewed news as static files, reads documents in the browser, and never calls the Express API or Cloud Storage.

The zero-cost beta has its own Firebase configuration and its own Firestore rules:

| File | Used by | Purpose |
| --- | --- | --- |
| `firebase.zero-cost.json` | zero-cost beta only | Hosting with the Content Security Policy and cache headers, plus `firestore.zero-cost.rules`. No Storage. |
| `firestore.zero-cost.rules` | zero-cost beta only | Validates every direct browser write: exact fields, types, lengths, server timestamps, verified email, and per-account bounds, including key dates, contacts and checklist progress. |
| `firebase.json` / `firestore.rules` | full production only | Unchanged. The API writes profiles and documents through the Admin SDK, and its client calls an API origin that the zero-cost CSP would block. |

Never deploy the zero-cost rules to a production project, or the production rules to the zero-cost project.

## What students can use

- Email/password sign-in (after verifying the email address) and Google sign-in (after the provider is enabled).
- Profile (including start and graduation dates), tasks with priorities, due dates, completion and a calendar, saved guides (removable), saved updates (with a saved-only view), and privacy choices, stored in the student's own Firestore records.
- In-app due reminders: tasks that are overdue or due within three days are listed on Home and in Notifications. They are worked out in the browser, appear only while GlobeReady is open (checked every 15 minutes and when the window regains focus), and read marks stay on that device. Nothing runs in the background.
- Plain-language reading aids on each update: a status explanation, dates and the official link, built from the reviewed record. They do not say how an update applies to a particular student.
- Journey planner (F-1, J-1 and general templates across arrival, enrollment, travel, employment, graduation and after the program), travel-readiness checklist with custom items, and one-click conversion of steps into tasks. Templates are general guidance and are labelled as such.
- Key dates typed in by the student (passport, visa, I-20/DS-2019, travel signature, insurance, lease), with reminders and an upcoming list on Home. Nothing is read from documents automatically.
- Calendar export: tasks and key dates as an `.ics` file built in the browser, for Google Calendar, Apple Calendar and Outlook.
- Private contacts (DSO, international office, campus safety, insurance, embassy or consulate, trusted people) with click-to-copy phone and email.
- Informational relevance labels on updates that list the matching fields (visa type, journey stage, university, saved topics). They never say an update legally applies to the student.
- Search across reviewed updates, guides, task titles and document names. Document contents are searched only inside Ask, only while document reading is on.
- Installable app with an offline shell. Offline use covers the app, reviewed updates already loaded, and guides. Changes made offline are not saved, queued or synchronized, and Firestore data and document text are never cached.
- Restore from the app's own JSON export, with a full preview, size/ownership/limit validation, duplicate skipping, and no overwriting or deleting.
- Text size, high contrast and reduced motion choices, remembered on the device; a skip link; labelled controls; 44 px touch targets.
- Rules and forms library: official rules, regulations, forms and agency guidance, each linking to its official source with publication and effective dates (or an honest "no single effective date"), a superseded status and what replaced it, search, and filters by type, status, visa and topic. GlobeReady links to the source and does not copy form editions or fees. "Listed" is the date an entry was added, not a legal review.
- What may apply to you: informational matches between the student's visa type, journey stage, university and saved topics and the tags on reviewed updates and library entries, with the matching fields shown. Never a legal conclusion.
- Case tracker: private cases (OPT, STEM OPT, change or extension of status, SEVIS transfer, travel document) with form and receipt numbers, a manual status history, appointments and request-for-evidence deadlines that feed reminders, Home and the calendar file. GlobeReady never contacts USCIS or any agency; the status is only what the student entered, and the page says so and links to the official case status page.
- University workspace for any university: coverage status stated honestly (no university is marked reviewed in this beta), search links generated from the website the student entered and labelled as unreviewed, the student's own saved office links, and school contacts.
- Safety and life resources: emergency, scams, health, tax and Social Security, housing, travel and campus-safety links to the organizations that run them. U.S. numbers, short, not exhaustive.
- Tasks can be edited and carry private notes, a weekly, monthly or yearly repeat (finishing one adds the next), a manual reminder date, and connections to updates, rules, cases, key dates and guides, shown in both directions.
- Update pages show a timeline of related reviewed updates and rule changes, and original local illustrations credited as not official images. No outside images are loaded.
- Guided start and help: a five-step "Set up in five minutes" page (profile, key dates, school contact, first journey steps, topics; each skippable, progress shown as text), collapsed "How this page works" notes on every section, and a Help page that states what is and is not stored, with a searchable glossary of common terms. All general and informational.
- News discovery: topic and visa filters (offering only values present in the published feed), "may be relevant to my profile", "has an upcoming effective date" and "new or changed since I last looked" options, "New"/"Updated" markers and up to 10 saved searches. The seen markers and saved searches live in this browser only. A reading guide on each update (what changed, who it is tagged for, questions to ask your DSO) is built only from the reviewed record, never from the student's profile, and is labelled informational.
- Your next steps: one ranked list from tasks, key dates and case dates the student entered plus up to three common journey steps, each with the reason it is shown, a one-tap action, and a snooze (device only), and a seven-day summary that can be copied. Dates are the ones the student typed in; suggestions carry no deadline; nothing is presented as a legal deadline.
- Appointment preparation: a checklist of general questions for the international office (plus the student's own), typed term and orientation notes, an office directory built from the student's own contacts, and a one-page summary the student downloads as text, prints or copies. Nothing is included unless ticked; cases show a masked receipt number and no notes unless the student chooses otherwise; documents are never included. Notes are kept in this browser only. No page is shared or uploaded, and entered information is labelled apart from reviewed coverage.
- Life section under Plan: **Arrival and daily life** is a topic view (housing, banking, phone, transport, health, insurance, taxes, campus, emergencies) over the Journey steps plus a few extra general steps, each addable as an ordinary task with no invented dates; it links only to guides and resources already curated, and says plainly where no vetted source exists. A **Budget planner** holds repeating and one-time costs in whole cents in one currency the student chooses (a label only; no exchange rates or banking connections) with category totals, a month-by-month view and a spreadsheet-safe CSV. A **Documents checklist** records have / missing / needs-review marks for common documents and the student's own; passport, visa, I-20, insurance and lease dates come from Key dates, and it never reads, uploads or validates a document. An **Emergency card** puts typed details and picked Contacts on a card only when ticked, for print, download or copy. These four, plus Contacts, University and Appointment prep, share a Life tab bar so the Plan bar stays short.
- The private life tools add a few items to Your next steps (documents the student marked missing or for review, a typed expiry that is close, and gentle suggestions to start a budget or card) without repeating Key dates or Journey. Home shows the count of open next steps and a shorter set of links.
- Device-only backup: Settings can download and restore the budget, documents checklist, emergency card, appointment-preparation workspace, news seen markers, saved searches and snoozes as a versioned JSON file. The file stays in the browser unless the student saves or moves it, is limited to the same signed-in account, and is fully validated and previewed before it replaces those seven local categories. It is not encrypted and may contain sensitive information, so the interface warns the student to keep it safe. This remains separate from the account export.
- Clear messages for sign-in problems, password reset, offline use, permission errors, and daily quota limits; an offline notice appears when the connection drops.
- Document reading on the student's device: text PDFs up to 100 pages and PNG/JPEG photos of printed English up to 25 megapixels, 10 MB maximum. Up to 50 documents per account. Original files are never uploaded or backed up; only the extracted text is saved, and only while document reading is on.
- Every page is read or the document is refused. If the text does not fit the per-document storage budget (about 800 KB), nothing is saved and the student is asked to split the file. Each document shows how many pages were read and how many had no readable text.
- Ask GlobeReady finds exact passages across all saved documents and shows them with the document name and page. It never writes an answer, labels results as quotes rather than answers or legal advice, adds the same official-contact referral as the full product for immigration, legal, tax, and health questions, and stops searching as soon as document reading is turned off.
- Searchable reviewed news with official links, legal-state labels, and source coverage that shows which sources are reviewed and which are only planned.
- JSON export of everything stored, and account deletion that confirms identity first.

Email, push notifications, background reminders, cloud AI answers, original-file backup, and an availability guarantee are not provided. Reminders cannot fire when the app is closed because that would need a server.

## One-time setup

These steps use only no-cost Firebase resources. Stop if any screen asks for a plan upgrade or a payment method.

1. Create or select a Firebase project on the Spark plan and register a Web app.
2. Create Firestore, choosing its region carefully (it cannot be changed). Do not create a Storage bucket.
3. In Authentication, enable Email/Password and, if wanted, Google. Add only the real hosting domains to Authorized domains. Check that preview-channel domains work for Google sign-in during the preview smoke test; add a preview domain only if sign-in on the preview fails.
4. Optional, still free: in Google Cloud's credentials page, restrict the browser API key to the Firebase Auth and Firestore APIs and to the hosting domains as HTTP referrers.
5. Deploy the zero-cost rules and indexes with the zero-cost configuration:

   ```bash
   cd server
   npx firebase deploy --config ../firebase.zero-cost.json --only firestore:rules,firestore:indexes --project <project-id>
   ```

6. Copy `client/.env.zero-cost-public.example` to `client/.env.zero-cost-public.local` (Git ignores it) and enter the Web app's four public identifiers. Never put service-account JSON or private keys in a `VITE_` variable.
7. Verify locally:

   ```bash
   cd client
   npm ci
   npm test
   npm run build -- --mode zero-cost-public
   ```

8. In GitHub, create repository variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. Add a deploy credential limited to Firebase Hosting as the `FIREBASE_SERVICE_ACCOUNT` secret. Protect the `globeready-live` environment with required reviewers and restrict it to the `main` branch.

The deployment workflow is manual. It copies `firebase.zero-cost.json` over `firebase.json` inside the CI checkout before deploying, so Hosting gets the zero-cost headers. Choose `preview` first, complete the smoke checks below, and use `live` only after approval. It never creates projects, enables services, changes plans, deploys rules, or deploys the API.

## Security headers

`firebase.zero-cost.json` sets a Content Security Policy that allows only:

- scripts from the site itself, WebAssembly compilation (`'wasm-unsafe-eval'`, needed for OCR), and `https://apis.google.com` (Google sign-in's helper script);
- workers from the site itself (the PDF and OCR workers);
- connections to Firebase Auth and Firestore;
- frames from the project's `firebaseapp.com` auth domain and `accounts.google.com`.

OCR files (worker, WebAssembly core, and English model) are copied from pinned npm packages into a content-addressed `/ocr/<hash>/` folder at build time, so no third-party code ever receives a student's image. A browser check with these exact headers is part of the release record in `docs/RELEASE_READINESS.md`.

HTML revalidates on every visit; hashed `/assets/` and `/ocr/` files are cached for a year. Only extension-less paths fall back to `index.html`, so a missing code file is a real 404, and the app reloads once if an open tab asks for code from an older deployment.

## Reviewed news operation

`.github/workflows/propose-news-update.yml` runs weekly and writes Federal Register candidates that are not already reviewed to a pull request. The proposal file has no timestamps, so the pull request changes only when there is something new. Candidates are not public news. The workflow needs the repository setting that allows GitHub Actions to create pull requests, and pull requests it opens do not start CI on their own; push a commit or re-run CI before merging.

A reviewer must verify the source, dates, lifecycle and legal state, student impact, and wording, then deliberately edit `server/data/reviewed-public-news.json` (including `generatedAt`, the date of the review). Only `active` coverage entries may carry `lastVerifiedAt`; `planned` entries are listed for transparency and shown as not monitored. Regenerate the static files with:

```bash
cd server
npm ci
npm run news:public -- --input data/reviewed-public-news.json
```

The files carry a SHA-256 content hash that the browser checks to detect corruption; it is not a signature and does not prove who produced them. A server test fails if the committed `client/public/data/*.json` files differ from what the reviewed input generates. The app labels the feed delayed after twice its declared cadence (14 days at the current 7-day cadence), so the feed needs a human review at least every two weeks to stay current.

## Preview smoke checks

Use disposable accounts and synthetic documents only.

- Sign up with email, confirm the verification screen appears, open the link, and continue. Sign out and back in. Test Google sign-in if enabled for the preview domain.
- Save and reload a profile; create, complete, and delete a task; confirm a due-soon task appears under Notifications; save and unsave an update and a guide; open the Account menu at 390 px width.
- Turn on document reading. Process a synthetic text PDF with one blank page and confirm the page count report. Process a printed-text PNG; in the browser's network panel, confirm every OCR request goes to the site itself. Cancel a long OCR run. Confirm no original file appears in Firestore.
- Ask a matching and a non-matching question and an OPT question; confirm only quoted passages appear, the referral appears, and an unrelated passage is not shown.
- Turn document reading off; confirm Ask stops searching. Delete all saved document text.
- Search and filter Updates; open a detail page and its official link; confirm planned sources say "Not monitored".
- In the browser console, confirm there are no Content Security Policy violations on any page.
- Export the account and inspect the JSON. Delete one email/password account (with its password) and one Google account (with the pop-up); confirm Firestore and Authentication are empty for both.
- Journey planner: add steps to Tasks and confirm repeats are skipped. Key dates: add, edit, delete, see them on Home and in Reminders. Contacts: copy a phone and an email. Download the `.ics` file and import it into a calendar. Search for a word in an update, guide, task and document name, and confirm text inside a document is not found there.
- Install the app, go offline, reload, and confirm the shell opens, the offline banner says changes are not saved, and no Firebase or OCR request is served from cache.
- Export the account, then restore the file: check the preview, confirm duplicates are skipped, and confirm a file from another account is refused.
- Switch text size, contrast and animation in Settings and confirm they persist after reload.
- Rules and forms: search for I-765, filter to Superseded, open an official source, add a review task and confirm it shows on the rule and in Tasks.
- Cases: add a case, add a status update, an appointment and a response deadline; confirm the dates reach Home, Reminders and the `.ics` file; remove a history entry; delete the case. Confirm the page says nothing is checked with any agency.
- Tasks: edit a task, set a repeat and a reminder date, complete it and confirm the next one appears; remove a connection.
- University: with and without a website entered; confirm the not-reviewed wording, save a link and remove it.
- For you and Safety and life: change profile fields and confirm the matches and their reasons change; open a few resource links.
- Repeat at 390 px width and with keyboard-only navigation.

## Rollback and recovery

For a bad release, redeploy the last known-good commit through the protected workflow or use Firebase Hosting's release rollback. Do not roll back `firestore.zero-cost.rules` independently unless the older client has been verified against them. Static news can be reverted by reverting the reviewed input and regenerated files. Hosting rollback does not restore deleted Firestore or Authentication data; the free beta has no backup guarantee.

## Operating limits

Spark quotas are per project and shared by every student ([Firebase pricing](https://firebase.google.com/pricing), [Authentication limits](https://firebase.google.com/docs/auth/limits)):

| Resource | No-cost limit | What it means here |
| --- | --- | --- |
| Hosting transfer | 360 MB/day | The app shell is about 0.3 MB compressed; first PDF use adds about 0.5 MB; first OCR use on a device adds about 4.5 MB (cached afterwards). Roughly 80 first-time OCR devices a day would use most of the allowance, after which Hosting stops serving until the next day. |
| Firestore writes / reads / deletes | 20K / 50K / 20K per day | Every save is a write; account deletion uses one delete per record. |
| Firestore storage | 1 GiB | Each account can store at most 50 documents of about 1 MB of extracted text. |
| Verification emails | 1,000/day | New email/password sign-ups beyond this wait until the next day. |
| Password-reset emails | 150/day | |

Quota errors are shown to the student and never switch to demo data. Abuse controls in this beta are: verified email before any write, Firebase's per-IP sign-up limit, strict rule validation, and the 50-document cap. App Check is not enabled; a determined attacker with many verified accounts can still exhaust the shared daily quotas. Source updates are best-effort and human-reviewed, not real-time or comprehensive.
