# Security policy

## Supported version

Security updates target the latest commit on `main`.

## Report a vulnerability

Use GitHub's private vulnerability reporting option under the repository's **Security** tab. Do not include credentials, identity documents, Firebase tokens, or personal student data in a public issue.

Include:

- A concise description of the issue
- The affected route, component, or Firebase path
- Reproduction steps using synthetic data
- The expected security boundary

## Security boundaries

GlobeReady expects production operators to:

- Keep Firebase Admin and Gemini credentials in encrypted host environment settings.
- Restrict Firebase authorized domains and API-key usage.
- Deploy the checked-in Firestore and Storage rules.
- Keep `ragChunks` inaccessible to browser clients and manage it only through the authenticated API.
- Publish retention, deletion, and AI-processing policies before accepting identity documents.
- Validate authentication, cross-user isolation, upload deletion, chunk deletion, and cited document answers with two test accounts before launch.
