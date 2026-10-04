# Rollback and recovery

Prefer reversing a release over editing code in an emergency. Every change below can be undone without a data
migration, unless the table says otherwise.

## Decision guide

| Symptom | First action | Then |
| --- | --- | --- |
| Client broken, API healthy | Redeploy the previous client build | Investigate with the failing build kept aside |
| API crashes or fails readiness after a deploy | Redeploy the previous image (keep its digest) | Check the `startup.refused` line |
| Startup refused with a configuration message | Fix the variable in the host's secret settings; no redeploy needed | Re-check `/api/health/ready` |
| Document reading fails for every upload | Set `DOCUMENT_OCR_ENABLED=false` (OCR only) or redeploy the previous image | Keep uploads enabled; PDFs still read |
| Answers wrong or unsafe | Remove `GEMINI_API_KEY` (answers fall back to retrieved passages) | Investigate the prompt or output |
| Updates wrong or stale | Set `NEWS_SYNC_ENABLED=false`; published items stay visible with their freshness state | Review `/api/admin/news/health` |
| Source fetches misbehaving | Disable the specific source through the admin screen (`enabled: false`) | Review its run records |
| Firestore rules regression | Redeploy the previous `firestore.rules` | Re-run the rules tests against the emulator |
| Storage rules regression | Redeploy the previous `storage.rules` | Set `VITE_DOCUMENT_UPLOADS_ENABLED=false` in the client build meanwhile |
| Index problem | Keep the index; restore the previous query shape in code | Do not delete indexes that queries rely on |
| Account deletion malfunction | Set the deletion route to refuse: redeploy the previous image, or stop the release | Never run a manual Auth deletion without the Firestore and Storage cleanup |

## Release artifacts

- **Client**: a static build. Keep the last two build directories. Redeploying the previous build restores the
  previous behaviour, because the client holds no server state.
- **API**: a container image referenced by its digest. Record the digest of every release. Rolling back means
  deploying an earlier digest with the same environment.
- **Configuration**: keep the previous set of secret values. A configuration change is a rollback only if the old
  values are still valid.

## Data

- **Profiles, tasks, notifications, saved updates, conversations, and documents** are written in the current format.
  Earlier code reads newer fields tolerantly (for example `analysisError`, conversation messages). A rollback does not
  need a data migration.
- **Source snapshots** (`newsSourceSnapshots`) are written only by this release. No earlier release wired a snapshot
  store, so earlier releases never published live Updates. Rolling back below this release leaves publication disabled.
  Items already published keep their snapshot identifiers.
- **Firestore rules** are part of the release. Rolling them back restores the previous, looser write shapes. Rules
  restrict only client writes, so a rollback never loses data.
- **Account deletion is not reversible.** A deleted account is gone from Auth, Firestore, and Storage. Keep backups
  only as long as your retention policy says (see `docs/PRIVACY.md`).

## Operations that cannot be trivially rolled back

- Deleting a Firebase project or bucket.
- Account deletion (above).
- Removing a field from Firestore documents or renaming a collection. Do not do this in a release that may roll back.
- Changing the document bucket. Existing `storagePath` values refer to the old bucket.

## Verifying a rollback

After any rollback, run the read-only smoke checks (`docs/SMOKE_TESTS.md`) against the restored deployment, and
confirm `/api/health/ready` returns `ready`.
