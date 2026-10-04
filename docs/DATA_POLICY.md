# Data policy: retention, deletion, backup, and restore

This is the policy the repository enforces, and the policy an operator must publish. It separates what the code does
today from what needs a decision or a provisioned service. Where something is not automated, this document says so.

## 1. What is kept, and for how long

| Data | Where | Kept until | Automatic expiry in V1 |
| --- | --- | --- | --- |
| Account identity | Firebase Authentication | The student deletes the account | None |
| Profile, preferences, tasks, saved updates and resources, notifications | Firestore `users/{uid}` | Deletion by the student, or account deletion | None |
| Uploaded documents | Cloud Storage `users/{uid}/documents/` | Deletion of the document, or account deletion | None |
| Extracted document text and page references | Firestore `users/{uid}/ragChunks` | Deletion of the document, or account deletion | None |
| Assistant conversations, messages, citations | Firestore `users/{uid}/conversations` | Deletion of the account | None |
| Consent record (choice, wording version, time of change) | Inside the profile | Account deletion | None |
| Source suggestions from students | Firestore `reviewQueue` | Kept for review; the student's UID is removed on account deletion | None |
| Official source text behind a published update | Firestore `newsSourceSnapshots` (server only) | Public official text, not student data | Expiry is recorded at 90 days, **but no sweep deletes it yet** (see section 6) |
| Published updates | Firestore `newsItems` | While the source is kept | None |
| Rate-limit counters | API process memory | One window (1 minute or 1 hour) | Yes, by design |
| Request logs | Log collector (not provisioned) | Set by the collector's retention setting | Provisioning decision |
| Audit events (`audit.*`) | Log collector (not provisioned) | Set by the collector's retention setting | Provisioning decision |

Recommended settings for the collector, which the operator sets: request logs 30 days, audit events 1 year. These are
recommendations, not enforced by the repository.

## 2. What is deleted, and how

**Single document.** The student deletes a document in the app. The API deletes the stored file first, and removes the
record and its extracted text only after that succeeds. If the stored file cannot be deleted, the record stays, and the
student can retry. A record whose file path is outside the student's own folder never reaches storage.

**Account.** `DELETE /api/account`, with the exact phrase and a sign-in no older than five minutes. The steps run in this
order, and each can be repeated safely:
1. Every Storage object under `users/{uid}/`.
2. The whole Firestore tree under `users/{uid}`.
3. The student's UID is removed from their own source suggestions.
4. The Firebase Auth identity, last.

If a step fails, the request fails, and the account remains signed in so the deletion can be retried. Deletion is
audited as `audit.account_deleted`, with the student's UID and the Auth result, and no content.

**What deletion does not reach** is the backup copies described in section 4 and the audit lines already collected.

## 3. Consent

Document reading and AI-written answers each need a recorded choice, made at the current wording version
(`server/src/consent.js`). A student who has not consented cannot upload a document record (enforced by the Firestore
rules), cannot index or analyze a document, and gets no passage from the document text. AI-written answers are sent to
Google only with the separate AI choice, and only when the operator has configured the key. Withdrawing a choice stops
new processing immediately. It does not delete data; deletion is a separate action. A change to the wording requires a
new version, so an earlier choice does not carry over.

**Storage gap.** The Storage rules do not check consent, so a file can be placed in a student's folder before the
record exists. The server never reads such a file without consent, and the account deletion removes it. Adding the
consent check to the Storage rules is future work.

## 4. Backup

The repository does not enable or manage any backup. Firestore backups and point-in-time recovery, and Storage object
versioning or copies, cost money and need a provisioned service. The decision belongs to the operator, and it must be
recorded before real student data is accepted.

Until a backup is provisioned, a platform failure that loses data cannot be recovered by the application.

## 5. Restore

Restoring from a backup must not bring back a deleted account. The repository has no deletion ledger, so the operator
reconciles manually:

1. Restore the backup to a separate project or database first, and check it.
2. List every account deleted after the backup time, from the `audit.account_deleted` events in the log collector.
3. Delete those accounts again (Storage prefix, Firestore tree, Auth identity), in the same order as section 2.
4. Confirm each deleted student's UID is absent from every collection and bucket.
5. Only then restore the production traffic path.

A deletion ledger that makes this step automatic is future work.

## 6. Known gaps in V1

- Source snapshot expiry is recorded but not enforced. Official text only.
- Orphaned files from an upload interrupted before its record was written have no sweep. Account deletion removes them.
- Consent is not checked by the Storage rules (see section 3).
- No deletion ledger (see section 5).
- No automatic expiry for student data. Students keep their data until they delete it.

## 7. Requests from outside the app

A student who cannot sign in can ask for deletion or access by email, at the address the operator publishes. The
operator then performs the same steps as section 2, using a verified identity check, and records the request. The
repository does not provide a request form or an identity-verification workflow.
