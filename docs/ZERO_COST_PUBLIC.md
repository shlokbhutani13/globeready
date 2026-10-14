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
