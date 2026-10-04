# Configuration contract

Every server setting is read once, at startup, by `server/src/runtime-config.js` (`loadServerConfig`). The process
validates the whole environment before it accepts traffic. If anything is wrong, it prints one line per problem
and exits with status 1. Nothing is silently defaulted when a value is malformed.

Secret values are never printed. Startup logs and `/api/health` report only non-secret summaries
(`configured`, `not-configured`, `enabled`, `disabled`).

## Runtime modes

Exactly one mode is active. The mode is chosen by two flags, which must be exactly `true` or `false` when set.

| Mode | Selected by | Where it may run | Identity |
| --- | --- | --- | --- |
| `production` | Neither flag set (the default) | Anywhere real Firebase is configured | Firebase ID tokens, verified by the Admin SDK |
| `demo` | `DEMO_MODE=true` | Development only; refused when `NODE_ENV=production` | `x-demo-user` header; in-memory sample data |
| `local-user` | `LOCAL_USER_MODE=true` plus all four emulator hosts | Development only; refused when `NODE_ENV=production` | Emulator-issued ID tokens; persistent local data |

Setting both flags is refused. Setting any emulator host variable without `LOCAL_USER_MODE=true` is refused, so an
emulator address cannot reach a real-Firebase configuration by accident.

## Production requirements

These must be present and valid when the mode is `production`. Every failure is reported at once.

| Variable | Rule |
| --- | --- |
| `FIREBASE_PROJECT_ID` | Required. A valid Firebase project ID (6 to 30 characters, lowercase letters, digits, hyphens). |
| `FIREBASE_STORAGE_BUCKET` | Required. Account deletion removes stored files from this bucket, so it cannot be omitted. |
| `CLIENT_URL` | Required. One or more comma-separated **https** origins with no path, query, or credentials. Loopback (`localhost`, `127.0.0.1`, `[::1]`) may use http for development. No wildcard. |
| `RATE_LIMIT_SCOPE` | Required, and must be `single-instance`. The limiter is per process; see "Rate limiting" below. |
| `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` | Set together, or both unset to use Application Default Credentials. A malformed key is refused without being echoed. |

Placeholder values are refused in production. The check matches text such as `your-`, `example.`, `changeme`,
`replace-me`, `placeholder`, `<...>`, and `xxx`. An unedited copy of `server/.env.example` therefore cannot start a
production server.

## All server variables

| Variable | Default | Purpose and rule |
| --- | --- | --- |
| `DEMO_MODE` | `false` | Selects demo mode. Exactly `true` or `false`. |
| `LOCAL_USER_MODE` | `false` | Selects local-user mode. Exactly `true` or `false`. |
| `NODE_ENV` | unset | `production` in the container image. Makes demo and local-user refuse to start. |
| `PORT` | `5051` | Listen port, 1 to 65535. |
| `CLIENT_URL` | `http://localhost:5173` (development) | Allowed browser origin(s). Production requires https except for loopback. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Bound on graceful shutdown, 1000 to 60000 ms. |
| `TRUST_PROXY` | `false` | `false`, `loopback`, or a hop count from 1 to 3. Set `1` behind one managed proxy (for example Cloud Run). Never `true`. |
| `BUILD_ID` | `unset` | Build identifier for `/api/health`. Letters, digits, dot, underscore, hyphen; up to 64 characters. |
| `FIREBASE_PROJECT_ID` | unset | See production requirements. |
| `FIREBASE_STORAGE_BUCKET` | unset | See production requirements. |
| `FIREBASE_CLIENT_EMAIL` | unset | Service-account email, ending in `.iam.gserviceaccount.com`. Prefer Application Default Credentials. |
| `FIREBASE_PRIVATE_KEY` | unset | Service-account key with `\n` escapes. Secret. Never commit it. |
| `ADMIN_UIDS` | empty | Comma-separated Firebase UIDs allowed to use the admin news routes. Administrators can also be set with the `admin` custom claim. |
| `RATE_LIMIT_SCOPE` | unset | `single-instance` declares one process. Required in production. |
| `AI_REQUESTS_PER_MINUTE` | `12` | Per-student limit on assistant and document-indexing requests, 1 to 600. |
| `NEWS_QUERIES_PER_MINUTE` | `60` | Per-student limit on Updates reads, 1 to 6000. |
| `NEWS_SOURCE_SUGGESTIONS_PER_HOUR` | `5` | Per-student limit on source suggestions, 1 to 500. |
| `NEWS_ADMIN_MUTATIONS_PER_MINUTE` | `30` | Per-administrator limit on admin changes, 1 to 600. |
| `ACCOUNT_EXPORTS_PER_HOUR` | `6` | Per-student limit on data exports, 1 to 100. |
| `ACCOUNT_DELETIONS_PER_HOUR` | `5` | Per-student limit on deletion attempts, 1 to 100. |
| `GEMINI_API_KEY` | unset | Optional. Enables generated document answers. Secret. Server-side only. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Answer model name. |
| `GEMINI_TIMEOUT_MS` | `20000` | Bound on each model call, 1000 to 60000 ms. |
| `GEMINI_EMBEDDINGS_ENABLED` | `false` | Must stay `false`. `true` is refused: embeddings are not supported in this release. |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Inert while embeddings are disabled. |
| `DOCUMENT_OCR_ENABLED` | `true` | Local OCR for PNG and JPEG. `false` disables it. |
| `NEWS_SYNC_ENABLED` | `false` | Allows live source fetches. Requires `NEWS_SYNC_SECRET`. |
| `NEWS_SYNC_SECRET` | unset | Bearer secret for `POST /api/internal/news/sync`, 16 to 512 characters. Secret. |

## Client variables (build time, public)

Every `VITE_` value is compiled into the browser bundle. None may be a secret.

| Variable | Rule |
| --- | --- |
| `VITE_API_URL` | Production builds require an https origin with no path. There is no localhost fallback in production. |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID` | Firebase web-app identifiers. Public. Access is enforced by the rules. |
| `VITE_DOCUMENT_UPLOADS_ENABLED` | `true` shows upload controls. Enable only for a deployment whose Storage rules are deployed. |
| `VITE_DEMO_MODE` | `true` only in development. Refused in production builds. |
| `VITE_LOCAL_USER_MODE` | `true` only for `npm run local-user`. Refused in production builds, and the emulator wiring is removed from every non-local build. |

## Files

- `server/.env.example` and `client/.env.example`: templates. Copy them to `.env` or `.env.local` for development only.
- `client/.env.demo`: explicit demo mode. It contains only `VITE_DEMO_MODE` and `VITE_API_URL`, and no credentials. It is
  safe to track because it has no secrets and it is refused in production builds.
- `client/.env.local-user`: placeholder identifiers for the local emulators. They are not credentials.
- `.env`, `.env.local`, and `.local/` are ignored by git. Never commit a real value.

## Rate limiting

The limiter is in process memory. It is correct for one instance and wrong for several: each instance would count
separately. Production therefore refuses to start unless `RATE_LIMIT_SCOPE=single-instance` is set, which is the
operator's statement that the deployment runs exactly one instance. Scaling out requires a shared store behind the
same `store.increment(key, windowMs)` contract in `server/src/rate-limit.js`. That is recorded as future work in
`docs/RELEASE_READINESS.md`.
