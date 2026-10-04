# Security policy

## Supported version

Security fixes target the latest commit on `main`.

## Report a vulnerability

Use GitHub's private vulnerability reporting under the repository's **Security** tab. Do not include credentials,
identity documents, Firebase tokens, or personal student data in a public issue.

Include:

- A concise description of the issue.
- The affected route, component, rule, or configuration.
- Reproduction steps with synthetic data only.
- The security boundary you expect to hold.

## Security boundaries

| Boundary | How it is enforced | Tested by |
| --- | --- | --- |
| Identity | Firebase ID tokens verified by the Admin SDK, with revocation checks. The demo header is accepted only in demo mode. | `auth.test.js`, `auth-modes.test.js`, `account-hardening.test.js` |
| Student isolation | Every store read and write is scoped to the verified UID. Firestore and Storage rules enforce the same rule for clients. | `cross-user-authorization.test.js`, `firestore-rules-emulator.test.js`, `storage-rules-emulator.test.js` |
| Administration | An admin claim or an `ADMIN_UIDS` entry. Admin changes are audited. | `admin-news-routes.test.js`, `cross-user-authorization.test.js` |
| Production fails closed | Configuration is validated before listening; development modes are refused; emulator variables are refused. | `runtime-config-contract.test.js`, `startup-config.test.js`, `scripts/release/docker-fail-closed.sh` |
| Local-user cannot leave the machine | The API binds to loopback only, because emulator tokens are unsigned. | `runtime-config-contract.test.js` |
| Uploads | Declared type, real signature, size in metadata and in bytes, owned exact path, and bounded parsing. | `document-hardening.test.js`, `document-real-extraction.test.js` |
| Outbound fetches | Strict URL and host policy, public-address enforcement with pinned DNS, same-origin redirects, size and time caps. | `news-url-policy.test.js`, `news-fetch.test.js` |
| AI output | Answers cite only retrieved chunks; conclusions are replaced by a referral; the provider call is time-bounded; prompts fence document text. | `gemini-provider.test.js`, `ai-guardrails.test.js` |
| Secrets | Read from the environment only; never logged, returned, or placed in the client bundle. | `runtime-config-contract.test.js`, `logger.test.js` |

## What operators must do

- Keep Firebase Admin and Gemini credentials in the platform's secret store. Use Application Default Credentials where
  possible.
- Restrict the Firebase web API key and authorized domains in the Google Cloud console.
- Deploy the checked-in Firestore and Storage rules, and confirm them with two synthetic accounts.
- Run exactly one API instance, or move the rate limiter to a shared store first (`docs/CONFIGURATION.md`).
- Publish retention, deletion, and AI-processing notices before accepting identity documents (`docs/PRIVACY.md`).
- Keep `NEWS_SYNC_ENABLED=false` until the source-synchronization conditions in `DEPLOYMENT.md` are met.

## Known dependency advisories

`npm audit --omit=dev` reports zero findings for both packages. The full server audit reports advisories only in
`firebase-tools` and its transitive packages. Those are used by the local emulators and CI, and are not present in the
production image. Upgrading the emulator CLI is a planned change, recorded in `docs/RELEASE_READINESS.md`, not an
emergency.
