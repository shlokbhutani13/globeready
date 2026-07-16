# Deployment

GlobeReady uses a static Vite client, a Node.js API, and Firebase. The repository includes the required configuration, but no deployment runs from this document.

## 1. Create the Firebase services

1. Create a Firebase project.
2. Enable **Email/Password** and **Google** in Authentication.
3. Create Firestore in production mode.
4. Create a Firebase Storage bucket.
5. Add the final client domain under Authentication > Settings > Authorized domains.
6. From the repository root, authenticate with the Firebase CLI and deploy the checked-in ownership rules:

```bash
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules,storage
```

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
```

Use the Firebase web-app configuration values. The Firebase web API key identifies the project; Firestore and Storage rules enforce user ownership. Restrict the key and authorized domains in Google Cloud and Firebase.

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
5. With Gemini enabled, request an explanation and confirm the result stays attached to that user's document.
6. Confirm a second account cannot read the first account's Firestore records or Storage files.

Use synthetic documents until this checklist passes. Publish a privacy notice and retention policy before accepting identity documents.
