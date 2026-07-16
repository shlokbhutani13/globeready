# GlobeReady

GlobeReady is a responsive productivity workspace for international students. It organizes documents, deadlines, trusted guides, profile-based recommendations, and sourced AI explanations without pretending to replace official university or government advice.

## Current release

The repository supports two modes:

- **Demo mode:** safe sample data with no account, uploads, or API keys.
- **Connected mode:** Firebase email/password and Google login, user-scoped Firestore data, Firebase Storage uploads, saved guides, verified API tokens, and optional Gemini answers and document explanations.

The product includes the personalized dashboard, document vault, tasks, trusted student guides, profile recommendations, responsive navigation, and sourced AI guidance. GlobeReady does not replace official government or university advice.

## Architecture

```text
React + Vite
    |
    | Firebase ID token or explicit demo identity
    v
Express API
    |
    +-- user-scoped data store
    +-- Firebase Admin verification
    +-- optional Gemini assistant

Firebase Auth + Firestore + Storage
```

See [Architecture](docs/ARCHITECTURE.md), [Privacy](docs/PRIVACY.md), and [Migration](docs/MIGRATION.md).

## Local setup

Requirements: Node.js 22.

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
cd server && npm install && npm run dev
```

In a second terminal:

```bash
cd client && npm install && npm run dev
```

Open `http://localhost:5173`, then choose **Continue in demo mode**. For connected mode, follow [Deployment](DEPLOYMENT.md) and add the Firebase client values to `client/.env.local` and server values to `server/.env`.

## Verification

```bash
cd server && npm test && npm run lint
cd ../client && npm test && npm run build
```

## Security model

- Protected API routes never trust a caller-provided user ID.
- Live mode verifies Firebase ID tokens.
- Demo mode requires an explicit demo identity header.
- Firestore and Storage rules require `request.auth.uid == uid`.
- Storage accepts only PDF, PNG, and JPEG files up to 10 MB.
- Document analysis loads only a file recorded in the authenticated user's collection.
- AI routes apply a configurable per-user request limit.
- Local environment files are ignored.

Review Firebase Auth domains, API-key restrictions, Firestore rules, and Storage rules before a public deployment.

## Release boundary

- The code is prepared for deployment but this repository does not contain production credentials.
- Live Firebase and Gemini behavior still requires validation against the Firebase project you choose.
- Demo uploads store metadata in memory and never send file contents.
- Gemini remains optional. Without it, the assistant uses deterministic sourced guidance and document analysis explains that content was not read.
- The app provides general information, not legal, immigration, tax, health, or financial advice.
- Email, SMS, calendar, and push reminders are not implemented.
- University-specific guidance is limited to curated resources.

## Project history

GlobeReady consolidates the useful product ideas and student-guide work from the former `int_students` prototype. The security model and interface were rebuilt rather than preserving its shared-user backend or tracked environment file.

## License

MIT
