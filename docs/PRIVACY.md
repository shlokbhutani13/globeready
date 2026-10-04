# Privacy

This describes data handling for the reduced launch. It is an engineering summary, not a privacy notice. Publish a notice that matches your deployment before accepting identity documents.

## Demo mode

Demo mode stores sample profile data and sample document metadata in browser memory. It uploads no files and sends nothing to Gemini or any other provider.

## What a live deployment stores

| Data | Where | Who can read it |
| --- | --- | --- |
| Account identity | Firebase Authentication | The student and the API (Admin SDK) |
| Profile, preferences, tasks, saved update IDs, notifications, saved resources | Firestore `users/{uid}` | The student (rules) and the API |
| Uploaded documents | Cloud Storage `users/{uid}/documents/` | The student (rules) and the API |
| Extracted document text (page-referenced chunks) | Firestore `users/{uid}/ragChunks` | The API only; client rules deny access |
| Assistant conversations and citations | Firestore `users/{uid}/conversations` | The student (rules) and the API |
| Review submissions from students (source suggestions) | Firestore `reviewQueue` | Administrators and the API. The submitter's UID is removed when that student deletes their account. |

## Processing by third parties

- **Gemini (optional).** When `GEMINI_API_KEY` is set, each document answer sends the question, the student's profile fields, and the retrieved excerpts (up to six short passages) to Google for answer generation. Google's processing terms apply. No embeddings are generated at launch.
- **Local OCR.** PNG and JPEG text is read by software running on the GlobeReady API host. Image bytes are not sent to any other service. The English language data ships with the server package.
- **Firebase.** Authentication, Firestore, and Storage process account and document data under your Firebase project's terms.
- **Official sources.** Source synchronization fetches public government and university pages. No student data is sent in those requests.

## Retention and deletion

Account deletion (`DELETE /api/account`) removes, in this order:

1. Every Storage object under `users/{uid}/`, including uploaded documents.
2. The whole Firestore tree under `users/{uid}`, including profile, preferences, tasks, notifications, saved items, documents, extracted text, conversations, and legacy push subscriptions.
3. The student's UID from their own review submissions. The submissions remain so administrators keep the source suggestion; they no longer identify the student.
4. The Firebase Authentication identity.

If a step fails, the earlier steps are not reversed. The student can retry; the storage step runs first, so a retry never leaves data without its files.

Not covered by account deletion:
- Firebase, Google Cloud, and backup copies that expire under your provider's retention rules.
- Global source records and published public updates, which contain no student data.
- Administrative audit records, which record the reviewer's UID for approvals and rejections.

Set and publish a backup-retention period before launch.

## Exports

`GET /api/account/export` returns the signed-in student's profile, preferences, tasks, documents with extracted page text, saved update IDs, saved resources, notifications, and conversations. Internal fields such as storage paths, embeddings, and other students' data are excluded.

## Email

GlobeReady does not send email. Email preferences are stored only so they apply after an email provider is added in a later release. No email address is stored by the email preference.

## Logging

Do not log ID tokens, document content, passport or visa numbers, or API credentials. Error responses to clients use fixed, safe messages; internal parser and OCR errors are logged server-side without the document content.
