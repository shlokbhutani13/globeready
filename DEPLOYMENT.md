# Deployment

GlobeReady uses a static Vite client, a Node.js API, and Firebase. The public preview at [globe-ready.web.app](https://globe-ready.web.app/) keeps uploads and live RAG disabled. The steps below enable the full document workflow; none of them runs automatically from this document.

| Configuration | Available behavior |
| --- | --- |
| No credentials | Local demo data and deterministic guidance |
| Firebase Auth + Firestore | Accounts, profiles, tasks, deadlines, and saved guides |
| Firebase Storage + deployed API + Gemini | Private PDF indexing and cited document answers |

## 1. Create the Firebase services

1. Create a Firebase project.
2. Enable **Email/Password** and **Google** in Authentication.
3. Create Firestore in production mode.
4. Upgrade the project to the pay-as-you-go **Blaze** plan, set budget alerts, and create a Firebase Storage bucket. [Firebase requires Blaze for Cloud Storage](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
5. Add the final client domain under Authentication > Settings > Authorized domains.
6. From the repository root, authenticate with the Firebase CLI and deploy the checked-in ownership rules:

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

Keep `VITE_DOCUMENT_UPLOADS_ENABLED=false` until the bucket, rules, API, and synthetic-file checks are ready. Linking a billing account can create charges; do it only after you choose a budget and approve the change.

## 2. Configure the API

Deploy the repository `Dockerfile` or the `server/` directory to a Node.js 22 host. The Docker image contains the API only.

Set these server variables:

```text
PORT=5051
CLIENT_URL=https://your-client.example
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
AI_REQUESTS_PER_MINUTE=12
```

Create a dedicated Firebase service account with only the permissions the API needs. Keep its private key in the host's encrypted environment settings. `GEMINI_API_KEY` is optional; login, storage, tasks, and profiles work without it. `AI_REQUESTS_PER_MINUTE` applies a per-user, per-instance limit. Use a shared rate-limit store if you later run many API instances.

Check the API after configuration:

```bash
curl https://your-api.example/api/health
```

The response should report `auth: true`. It reports `ai: true` only when both Gemini and the Storage bucket are configured.

## 3. Configure the client

Deploy `client/` as a Vite project. For Vercel, set the root directory to `client`; `client/vercel.json` preserves client-side routes.

Set these build variables:

```text
VITE_API_URL=https://your-api.example
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_APP_ID=...
VITE_DOCUMENT_UPLOADS_ENABLED=true
```

Use the Firebase web-app configuration values. Set the upload switch to `true` only for the build that should expose uploads. The Firebase web API key identifies the project; Firestore and Storage rules enforce user ownership. Restrict the key and authorized domains in Google Cloud and Firebase.

For Firebase Hosting, build from the repository root and deploy only after reviewing the target project:

```bash
cd client
npm ci
npm run build
cd ..
firebase use YOUR_PROJECT_ID
firebase deploy --only hosting
```

## 4. Release checks

Run these commands before production traffic:

```bash
cd server
npm ci
npm test
npm run lint

cd ../client
npm ci
npm test
npm run build
```

Then test one new account end to end:

1. Create an email account and sign out/in.
2. Complete the profile and refresh the page.
3. Create, complete, and delete a task.
4. Upload a non-sensitive PDF under 10 MB and delete it.
5. With Gemini enabled, index a synthetic PDF, ask a question about it, and confirm the answer contains only that user's retrieved document citations.
6. Confirm a second account cannot read the first account's Firestore records, Storage files, or RAG chunks.

Use synthetic documents until this checklist passes. Publish a privacy notice and retention policy before accepting identity documents.
