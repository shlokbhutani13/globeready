# Contributing

## Development setup

Use Node.js 22 and install dependencies separately for the API and client:

```bash
cd server && npm ci
cd ../client && npm ci
```

Copy `server/.env.example` to `server/.env` and `client/.env.example` to `client/.env.local`. Leave credential values blank to use demo mode.

## Checks

Run the full verification suite before opening a pull request:

```bash
cd server
npm audit
npm test
npm run lint

cd ../client
npm audit
npm test
npm run build
```

## Pull requests

- Keep each pull request focused on one feature or fix.
- Add tests for changed behavior.
- Do not commit environment files, credentials, identity documents, or generated build folders.
- Update the README or deployment documentation when behavior or configuration changes.
- Keep immigration, legal, tax, health, and financial guidance tied to official sources and a clear disclaimer.
