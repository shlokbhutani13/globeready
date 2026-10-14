# GlobeReady

[![CI](https://github.com/shlokbhutani13/globeready/actions/workflows/ci.yml/badge.svg)](https://github.com/shlokbhutani13/globeready/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-17191e.svg)](LICENSE)
[![Node 22](https://img.shields.io/badge/Node-22%20LTS-315fda.svg)](.nvmrc)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%7C%20Firestore%20%7C%20Storage-f0a534.svg)](firebase.json)

GlobeReady helps international students in the United States follow verified official updates, plan deadlines, ask grounded questions about their own documents, and control their data.

GlobeReady provides general information, not legal, immigration, tax, health, or financial advice. Confirm decisions with your Designated School Official (DSO), your university, or the relevant government agency.

> **Release status:** the repository includes a verified `$0` public-beta mode, but nothing has been deployed from this branch. Paid/full-production provisioning remains separate. See [docs/ZERO_COST_PUBLIC.md](docs/ZERO_COST_PUBLIC.md) and [docs/RELEASE_READINESS.md](docs/RELEASE_READINESS.md).

## What the launch includes

- **Updates:** a visual top-story reader plus a searchable weekly, monthly, yearly, and custom-range archive; verified story details, official links, safe image fallbacks, saved items, lifecycle labels, and on-demand cited AI explanations. The Federal Register is the only live source enabled by default; USCIS, SEVP, State Department, and other registered sources remain visibly pending until their extraction contracts are verified. Local-user mode seeds clearly labeled development stories so the experience can be tested without external network access.
- **My Plan:** tasks with due dates and priorities, a month calendar, and in-app reminders with a notification inbox.
- **Documents and Assistant:** text-based PDFs with page-referenced text, and PNG/JPEG photos of printed text read with local OCR. Scanned or image-only PDFs, handwriting, and malformed or blank files are not read; each gets a clear message and keeps the upload. Document questions return citations, say when the evidence is missing, and route high-risk questions to a DSO or professional. Conversations are kept per student.
- **Account:** profile, university, time zone, digest and email-preference settings (email delivery is deliberately disabled), a JSON data export, and account deletion.

The repository is ready for production provisioning, not deployed production. Source operations default to credential-free dry run, no scheduler or email provider is configured, and the UI never claims comprehensive university coverage.

Email delivery and browser push are not part of the launch.

## Architecture

```mermaid
flowchart LR
    Student["Student"] --> Client["React + Vite client"]
    Client --> Auth["Firebase Authentication"]
    Client --> Firestore["Firestore (own records)"]
    Client --> Storage["Cloud Storage (own documents)"]
    Client --> API["Express API"]
    API --> Admin["Firebase Admin: token verification"]
    API --> Firestore
    API --> Storage
    API --> Extraction["PDF parsing + local OCR"]
    Extraction --> Chunks["Private Firestore chunks"]
    API --> Gemini["Gemini answers (optional)"]
```

The client reads a student's own records through Firebase rules. The API verifies identity on every protected request, derives the student from the verified token, and performs document reading, answer generation, publication, administration, and account deletion. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes each component.

## Run locally

Requirements: Node.js 22 (`.nvmrc`). Local-user mode also needs Java 21 for the Firebase emulators.

GlobeReady has four mutually exclusive modes:

| Mode | Start | What it is |
| --- | --- | --- |
| Demo | `npm run demo` in `server/` and `client/` | Sample data in memory; no account, no uploads. Development only. |
| Local-user | `npm run local-user` in `client/` | Real accounts, rules, uploads, and document reading, on the Firebase emulators on this computer. Persists across restarts. Development only. |
| Zero-cost public | `npm run build -- --mode zero-cost-public` in `client/` | Static signed-in beta: Firestore, local document processing, deterministic cited retrieval, and reviewed static news; no API, Storage, cloud AI, email, or push. |
| Production | Not started locally | Real Firebase only. Refuses to start without its full configuration. See [docs/CONFIGURATION.md](docs/CONFIGURATION.md). |

Local-user mode, from a fresh clone:

```bash
cd server && npm ci && cd ../client && npm ci
npm run local-user        # starts the emulators, seeds two synthetic accounts, starts the API and the app
```

Open `http://127.0.0.1:5173`. The seeded accounts and their passwords are in `.local/credentials.json` (ignored by git).
The Google button is a mock identity from the emulator; it is not your Google account. Stop with `npm run local-user:stop`,
and delete all local data with `npm run local-user:reset`. Details are in [docs/OPERATIONS.md](docs/OPERATIONS.md).

Demo mode:

```bash
cd server && npm run demo        # terminal 1
cd client && npm run demo        # terminal 2 (uses client/.env.demo, which contains no credentials)
```

Demo mode accepts the `x-demo-user` header as the identity. Production refuses it.

## Verification

```bash
cd server && npm ci && npm test && npm run lint && npm run test:rules
cd client && npm ci && npm test && npm run build
cd client && npm run build -- --mode zero-cost-public
```

`npm run test:rules` starts the Firestore, Auth, and Storage emulators (requires Java 21). It covers the security rules,
recursive account deletion, the account path with real Auth tokens and Storage objects, and the source-snapshot commit
under a lease. The production image is checked with `scripts/release/docker-fail-closed.sh <image>`. GitHub Actions runs
all of these on every push and pull request. Nothing is deployed by CI.

## Security and privacy

- Protected API routes derive identity from verified Firebase ID tokens, with revocation checks. Request bodies cannot select another student.
- Firestore and Storage rules restrict each student's records to their own UID. Retrieval chunks are server-only.
- Uploaded files are checked by declared type, real file signature, size, and exact private path, both at upload and again before reading.
- A university domain is registered only as pending until an administrator verifies it.
- Account deletion requires a recent sign-in and removes the student's stored data, in an order that can be retried.
- Generated answers are limited to retrieved evidence, and definitive legal or status conclusions are replaced with a referral.
- Production refuses to start without its full configuration, and never falls back to demo or local-user behavior.

Read [SECURITY.md](SECURITY.md) and [docs/PRIVACY.md](docs/PRIVACY.md) before configuring real identity documents.

## Documentation

- [V1 scope](docs/V1_SCOPE.md)
- [Data policy: retention, deletion, backup, and restore](docs/DATA_POLICY.md)
- [Modes: demo, local-user, and production](docs/MODES.md)
- [Configuration contract](docs/CONFIGURATION.md)
- [Operations: startup, shutdown, health, logging, local state](docs/OPERATIONS.md)
- [Deployment procedure](DEPLOYMENT.md)
- [Rollback and recovery](docs/ROLLBACK.md)
- [Smoke tests](docs/SMOKE_TESTS.md)
- [Release readiness](docs/RELEASE_READINESS.md)
- [Zero-cost public beta](docs/ZERO_COST_PUBLIC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy model](docs/PRIVACY.md)
- [Security policy](SECURITY.md)
- [Roadmap](docs/ROADMAP.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT
