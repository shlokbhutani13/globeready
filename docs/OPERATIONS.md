# Operations

This describes how the API starts, stops, reports health, logs, and limits requests, and how the local environment
keeps its data. It applies to every mode unless a section says otherwise.

## Starting

The API refuses to start with an explicit message, and exits with status 1, when:

- configuration is missing, malformed, or contains a placeholder (`docs/CONFIGURATION.md`);
- a development flag is set under `NODE_ENV=production`;
- an emulator variable is set without `LOCAL_USER_MODE=true`;
- Firebase credentials are malformed or cannot be loaded;
- Firebase Auth cannot be reached within 10 seconds (checked with a real request, `listUsers(1)`);
- the port is already in use.

Startup prints the same one-line reasons to standard error and writes a structured `startup.refused` log line. A
successful start writes `startup.ready` with the non-secret configuration summary. The process reports ready only
after it is listening.

## Stopping

On `SIGTERM` or `SIGINT` the API:

1. reports not-ready on `/api/health/ready` at once, so the orchestrator stops routing traffic;
2. stops accepting connections and closes idle keep-alive connections;
3. waits for in-flight requests, up to `SHUTDOWN_TIMEOUT_MS` (default 10 seconds);
4. releases its owned resources: the OCR recognition worker and the Firestore client;
5. exits 0 on a clean stop, or 1 if the drain timed out or cleanup failed.

A second signal during shutdown exits immediately with status 1.

Process-level failures follow one policy. An unhandled promise rejection or an uncaught exception is logged with its
error code only, the same shutdown sequence runs, and the process exits with status 1. The process does not keep
serving after an unknown failure; the orchestrator restarts it.

## Health

| Endpoint | Meaning | Responses |
| --- | --- | --- |
| `GET /api/health/live` | The process is running. Does not depend on any external service. | `200 {"status":"ok"}` |
| `GET /api/health/ready` | The app finished starting and is not shutting down. | `200 {"status":"ready"}` or `503 {"status":"not_ready"}` |
| `GET /api/health` | Summary for operators and the smoke tests. | `{ok, mode, version, build, services:{auth, ai}}` |

`mode` is `production`, `demo`, `local-user`, or `unconfigured`. `version` comes from the server package; `build` comes
from `BUILD_ID`. No secret, path, hostname of a private service, or internal detail is returned. The container image
checks liveness.

## Logging

Each log line is one JSON object on standard output with `timestamp`, `severity`, `event`, `service`, `version`,
`build`, and `mode`. Request lines add `requestId`, `method`, `route` (the route template, such as
`/api/tasks/:id`, never the raw path), `status`, and `latencyMs`. An aborted request is logged as `http.aborted`.

Sensitive fields are removed by name before any line is written. Removed names include anything containing
`authorization`, `token`, `password`, `secret`, `key`, `credential`, `excerpt`, `question`, `answer`, `prompt`,
`text`, `body`, `email`, `document`, `content`, `evidence`, and `profile`. Long strings are truncated to 200
characters, and nested objects are dropped. Errors contribute only their code. Error messages are never logged, so
a provider or parser message cannot carry document text out of the process.

The request ID comes from a valid `X-Request-Id` header, or is generated. It is returned in every response.

### Audit events

Security-relevant events use the `audit.*` event names, on the same stream and marked with a channel of `audit`:

- `audit.admin_news_mutation`: a successful administrator change to a news source or review (actor UID, method, path
  template, status). The change payload is not logged.
- `audit.account_exported`: a student exported their data (actor UID).
- `audit.account_deleted`: an account was deleted (actor UID and the Auth result).

Ordinary request logs and audit events are separate event names, so an operator can alert on audit events alone.
Collecting these into Cloud Logging or another store is a deployment step; no provider is configured by the code.

## Rate limiting

| Class | Default | Applies to |
| --- | --- | --- |
| Assistant and document indexing | 12 per minute per student | `POST /api/assistant`, `POST /api/documents/:id/index` |
| Updates reads | 60 per minute per student | `GET /api/news` |
| Source suggestions | 5 per hour per student | `POST /api/news/source-suggestions` |
| Admin changes | 30 per minute per administrator | `/api/admin/news` mutations |
| Account export | 6 per hour per student | `GET /api/account/export` |
| Account deletion | 5 per hour per student | `DELETE /api/account` |

Limits are keyed by the verified UID. A refused request returns `429` with `Retry-After`. The limiter is per process;
see `docs/CONFIGURATION.md` for the single-instance rule. Uploads go directly from the browser to Cloud Storage, and
Firestore metadata writes also go directly from the browser under the rules, so the API does not see those requests.
They are bounded by the Storage size and type rules, and by the ownership rules; a per-student quota on those writes
is future work.

## Local environment (`npm run local-user`)

```bash
cd client
npm run local-user         # start emulators, seed sample data, start the API and the app
npm run local-user:stop    # stop the app and API, then export emulator data
npm run local-user:reset   # delete all local data after you type RESET
```

Start and stop are safe to repeat. Start refuses if the environment is already running or a port is taken, and it
names the port.

### Persistent state

- The Firestore, Auth, and Storage emulators import `.local/emulator-data` at start and export it when stopped with
  `local-user:stop`. Accounts, tasks, uploads, indexed text, and conversations survive a restart.
- Stop with the script, not by closing the terminal. Closing the terminal can end the emulators without exporting.
- `.local/` is ignored by git and holds the emulator data, the credentials file (owner-only), logs, and process IDs.
- `local-user:reset` deletes that data after you type `RESET`. Reset is the only supported way to start from empty.

### Logs

- `.local/logs/api.log`: API structured logs.
- `.local/logs/emulators.log`: emulator output, including the export confirmation.
- `.local/logs/client.log`: the development server.

The message `MetadataLookupWarning ... All promises were rejected` may print once during seeding. It comes from Google's
client library probing for a cloud metadata server, which does not exist on a laptop. It does not affect the seeded data.

## Database and emulator ports

| Port | Service |
| --- | --- |
| 5173 | Client (development server) |
| 5051 | API |
| 9099 | Auth emulator |
| 8089 | Firestore emulator |
| 9199 | Storage emulator |
| 4000 | Emulator console |

Local-user binds to `127.0.0.1` only. It is not exposed to the network.
