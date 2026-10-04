# Privacy

This is an engineering description of how GlobeReady handles data. It is not a privacy notice. Publish a notice that
matches your deployment before accepting identity documents.

## Demo and local modes

- **Demo mode** keeps sample data in server memory and in the browser. It uploads no files and sends nothing to any
  provider. Restarting the server clears it.
- **Local-user mode** keeps data in the local emulators, under `.local/`. Nothing leaves the computer. The Google button
  is a mock identity, not a Google account (`docs/MODES.md`).

## What production stores

| Data | Where | Who can read it |
| --- | --- | --- |
| Account identity (email, password hash, provider link) | Firebase Authentication | The student, and the API through the Admin SDK |
| Profile: name, home country, university, domain, degree, program, visa type, journey stage, dates, time zone | Firestore `users/{uid}` | The student (rules), and the API |
| Preferences, tasks, saved updates, saved resources, notifications | Firestore `users/{uid}/…` | The student (rules), and the API |
| Uploaded documents (PDF, PNG, JPEG) | Cloud Storage `users/{uid}/documents/{id}/` | The student (rules), and the API |
| Extracted document text, with page numbers | Firestore `users/{uid}/ragChunks` | The API only. Client rules deny all access. |
| Assistant conversations, messages, citations, referrals | Firestore `users/{uid}/conversations` | The student (rules), and the API |
| Source suggestions from students | Firestore `reviewQueue` | Administrators and the API. The submitter's UID is removed when that student deletes their account. |
| Public and reviewed Updates, and source text they were checked against | Firestore `newsItems` (public fields only) and `newsSourceSnapshots` (server only) | Anyone signed in (public fields); the API only (snapshots). Official text; no student data. |
| Audit records of administrator changes | Structured logs, `audit.*` events | Operators, through the log collector. Not stored in Firestore. |

In production and local-user modes, the API keeps no student data in memory between requests. The only in-memory state
is the rate-limit counters, which hold a UID and a count and reset with their window. Demo mode keeps its sample data in
memory by design, and clears it on restart.

## Privacy choices

Before a document is read, the student records a choice in the app, at the current wording version. Document reading
and AI-written answers are separate choices, and the AI choice is available only after document reading is on. Each is
changeable at any time. The record is kept in the profile, is included in the export, and each change is audited
without its content. The Firestore rules refuse document records without document reading consent, and the server refuses
to read, index, or send document text without it. Full detail: `docs/DATA_POLICY.md`.

## Third-party processing

- **Firebase** (Authentication, Firestore, Storage) processes account and document data under your Firebase project's
  terms. Choose the region once, at project creation.
- **Google Gemini (optional).** When `GEMINI_API_KEY` is set, each document answer sends to Google:
  - the student's question;
  - these profile fields only, when present: visa type, journey stage, degree level, program, and university. Name,
    contact details, time zone, dates, and home country are not sent;
  - up to six retrieved excerpts from the student's selected documents, each shortened, with document name and page
    number, fenced as untrusted content;
  - the approved official-source titles and links that match the question.

  It does not send the full document, other students' data, or identifiers. Google's processing terms apply. With no key,
  nothing is sent to Google.
- **Local OCR** reads PNG and JPEG text on the API host. Image bytes are not sent to any service. The English language
  data ships with the server package.
- **Official sources.** Source synchronization requests public government and university pages. Those requests carry no
  student data.

## Retention and deletion

`DELETE /api/account` runs in this order. Each step is safe to repeat.

1. Storage: every object under `users/{uid}/` (uploaded documents).
2. Firestore: the whole `users/{uid}` tree, including profile, tasks, notifications, saved items, documents, extracted
   text, conversations, and the legacy push-subscription collection.
3. Review submissions: the student's UID is removed from their own source suggestions. The suggestion remains, so
   administrators keep the source; it no longer identifies the student.
4. Firebase Authentication: the identity, last. If the earlier steps fail, the request fails and the account stays
   signed in, so a retry can complete the deletion. A retry after the identity was already removed succeeds.

Before deletion, the request must carry the exact phrase `DELETE MY ACCOUNT`, and the sign-in must be recent (within
five minutes). Deletion attempts are rate limited.

Not covered by account deletion:

- Copies held by Firebase, Google Cloud, or backups. These expire under your provider's retention rules; set and publish
  a backup retention period before launch.
- Public Updates and official-source snapshots, which contain no student data.
- Audit log lines already collected. They record the actor's UID and the action, not content.

Source snapshots carry an expiry field (90 days). **No scheduled sweep deletes them yet.** This is recorded as future work
in `docs/RELEASE_READINESS.md`. They hold public official text only.

## Export

`GET /api/account/export` returns JSON for the signed-in student only. Schema version 1 contains:

- `schemaVersion`, `exportedAt`
- `profile`, `preferences`
- `tasks`: id, title, category, priority, due date, completed, notes, created time
- `documents`: id, name, category, content type, size, uploaded, created, expiry, analysis status, and extracted pages
  (page number and text). Storage paths are not included.
- `savedUpdateIds`, `savedResources`, `notifications`
- `conversations`: id, title, created time, and messages (role, text, citations, sources, evidence, referral, created time)

It does not include credentials, tokens, storage paths, embeddings, other students' data, or internal identifiers.
Each export is recorded as an `audit.account_exported` event.

## Email

GlobeReady sends no email. Email preferences are stored so they apply once an email provider is added. The preference
record holds no address.

## Logging

- Request logs contain the request ID, the route template, the method, the status, and the latency. They do not contain
  request bodies, query strings, raw paths, headers, tokens, document text, questions, answers, excerpts, or profile
  values. See `docs/OPERATIONS.md` for the complete list of removed field names.
- Error responses to clients contain fixed, safe messages. Internal messages, stack traces, and provider responses are
  never returned.
- Parser and OCR failures are logged by code only, never by message, so a document cannot leak through an error.

## Students' rights in practice

- Access: the student can view their data in the app and download the export.
- Correction: profile, tasks, and preferences can be edited. Documents can be deleted; deleting a document removes its
  stored file and its indexed text.
- Deletion: `DELETE /api/account`, as described above.
- Objection to Gemini processing: remove the document's indexed text, or do not use the Assistant. Without a key, nothing
  is sent to Google.

Publish how a student contacts you about these rights.
