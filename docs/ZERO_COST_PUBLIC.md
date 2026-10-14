# Zero-cost public beta

GlobeReady can run as a static, signed-in public beta on Firebase's no-cost services. This mode is deliberately separate from the full production architecture: it uses Firebase Authentication and rules-protected Firestore, serves reviewed news as static files, processes documents in the browser, and never calls the Express API or Cloud Storage.

## What students can use

- Email/password and Google sign-in after the provider is enabled in Firebase Authentication.
- Profile, task, guide, consent, and browser-extracted document-text storage in Firestore.
- PDF text extraction and printed-English PNG/JPEG OCR on the student's device. Original files are never uploaded or backed up.
- Deterministic document passage retrieval with document and page citations. No private text is sent to an AI provider.
- Searchable reviewed news with official links, images or local fallbacks, legal-state labels, and visible source/freshness coverage.
- Browser JSON export and cleanup-first account deletion.

Email, push notifications, cloud AI prose, original-file backup, and an availability SLA are not provided.

## One-time setup

These steps use existing no-cost Firebase resources. Stop if any provider screen requests a plan upgrade or payment method.

1. Create or select a Firebase project on the Spark plan and register a Web app.
2. Create Firestore, choosing its permanent region carefully. Enable Email/Password and optionally Google sign-in. Add only the real hosting domains to Authentication's authorized domains.
3. Deploy `firestore.rules` and `firestore.indexes.json`. Do not create a Storage bucket for this mode.
4. Copy `client/.env.zero-cost-public.example` to an ignored local environment file and enter the Firebase Web app's public identifiers. Never put service-account JSON or private keys in a `VITE_` variable.
5. Verify locally:

   ```bash
   cd client
   npm ci
   npm test
   npm run build -- --mode zero-cost-public
   ```

6. In GitHub, create repository variables `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID`. Add the scoped deploy credential as the `FIREBASE_SERVICE_ACCOUNT` secret. Protect the `globeready-live` environment with required reviewer approval.

The deployment workflow is manual. Choose `preview` first, complete the smoke checks below, and use `live` only after approval. It never creates projects, enables services, changes plans, or deploys the API.

## Reviewed news operation

`.github/workflows/propose-news-update.yml` runs weekly and writes official Federal Register candidates to a pull request. Candidates are not public news. A reviewer must verify the source, dates, lifecycle/legal state, student impact, and wording before deliberately editing `server/data/reviewed-public-news.json`. Regenerate the signed static artifacts with:

```bash
cd server
npm ci
npm run news:public -- --input data/reviewed-public-news.json
```

CI verifies deterministic output and browser integrity checks. The app labels an artifact delayed after twice its declared cadence; it never substitutes demo news.

## Preview smoke checks

- Sign up, sign out, sign back in, and test Google only if it is enabled for the preview domain.
- Save and reload a profile; create, complete, and delete a task.
- Consent to document reading; process a synthetic text PDF and printed-text image; confirm the original file is not present in Firestore.
- Ask a matching and a non-matching question; confirm only verbatim cited passages appear.
- Search and filter Updates; open a detail page and its official link; verify the freshness and source-coverage labels.
- Export the account; verify the JSON; delete a disposable account and confirm Firestore plus Auth are empty.
- Repeat at 390 px width and with keyboard-only navigation.

## Rollback and recovery

For a bad live release, redeploy the last known-good Git commit through the protected workflow or use Firebase Hosting's release rollback. Do not roll back Firestore rules independently unless the older client has been verified against them. Static news can be reverted by reverting the reviewed input and regenerated artifacts. Firebase Hosting rollback does not restore deleted Firestore or Authentication data; the free beta has no backup guarantee.

## Operating limits

Firestore and Hosting quotas are finite. Quota errors are shown to the student and never switch to demo data. The browser rejects files over 10 MB, PDFs over 100 pages, collections over 500 records for export/deletion, and exports over 10 MB. OCR may be slow and downloads its open-source runtime/language data from the allowlisted CDN. Source updates are best-effort and human-reviewed, not real-time or comprehensive.
