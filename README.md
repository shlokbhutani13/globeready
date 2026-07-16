# GlobeReady

GlobeReady is a responsive productivity workspace for international students. It organizes documents, deadlines, trusted guides, profile-based recommendations, and sourced AI explanations without pretending to replace official university or government advice.

## Current release

The repository contains a complete portfolio demo that works without credentials:

- Personalized dashboard
- Document-vault metadata and file validation
- Tasks and deadlines
- Trusted visa, CPT/OPT, SSN, banking, healthcare, and tax guides
- Profile-based recommendations
- Sourced assistant demo with explicit limitations
- Responsive desktop and mobile navigation
- User-scoped Express APIs with authentication middleware
- Firebase Firestore and Storage ownership rules

Live Firebase storage and Gemini calls require your own project credentials. The demo does not upload identity documents or send content to an AI provider.

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
cp .env.example .env.local
cd server && npm install && npm run dev
```

In a second terminal:

```bash
cd client && npm install && npm run dev
```

Open `http://localhost:5173`, then choose **Continue in demo mode**.

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
- Document metadata accepts only PDF, PNG, and JPEG files up to 10 MB.
- Local environment files are ignored.

Review Firebase Auth domains, API-key restrictions, Firestore rules, and Storage rules before a public deployment.

## Limits

- Demo uploads store safe metadata only.
- Gemini integration is optional and the checked-in demo uses deterministic answers.
- The app provides general information, not legal, immigration, tax, health, or financial advice.
- Email, SMS, calendar, and push reminders are not implemented.
- University-specific guidance is limited to curated resources.

## Project history

GlobeReady consolidates the useful product ideas and student-guide work from the former `int_students` prototype. The security model and interface were rebuilt rather than preserving its shared-user backend or tracked environment file.

## License

MIT
