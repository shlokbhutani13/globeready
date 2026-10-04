# V1 scope

This is what the first production release includes, what it deliberately leaves out, and what a student will find
limited. It is the reference for launch decisions and for the release notes.

## Included

- **Accounts.** Email and password, and Google sign-in, through Firebase Authentication. Password reset. Sign out.
- **Profile.** Name, home country, university, a verified `.edu` domain (pending until an administrator verifies it),
  degree, program, visa type, journey stage, dates, and time zone.
- **Tasks and calendar.** Create, complete, and delete. Due dates, priorities, and a month view.
- **Reminders.** In-app only. A reminder is created when a task is due, by a check at sign-in, every 15 minutes while
  the app is open, when the window regains focus, and after the task list changes. A rescheduled task earns a new
  reminder. Reminders do not arrive when the app is closed.
- **Updates.** Verified official items, saved and unsaved, filtered by legal state. Shown only to signed-in students.
  The feed states when a source's check has stopped. When no verified source covers a student's university, the feed
  says so.
- **Documents.** PDF (text-based), PNG, and JPEG of printed text. Up to 10 MB and 100 PDF pages. Upload and delete.
- **Assistant.** Questions about the student's own documents, answered with real passages and page numbers. With an
  AI key configured, a written answer is also offered, after a separate choice.
- **Privacy choices.** Document reading and AI answers, each with its own recorded choice, changeable at any time.
- **Account.** Export of the student's data as JSON, and account deletion.
- **Administration.** Review of source suggestions and of proposed update summaries, for listed administrators.

## Not included

- Email delivery of any kind, and browser push notifications. Email preferences are stored and do nothing yet.
- Reminders when the app is closed, and any background job.
- Scanned or image-only PDFs, and handwriting. These are reported as having no readable text.
- Vector search and embeddings.
- Native mobile apps.
- Calendar export.
- Live university catalogues. A university's updates appear only after an administrator verifies its source.
- Sharing between students, and any social feature.
- Payments of any kind.

## Limited, and stated in the product

- Without an AI key, the assistant shows passages rather than written answers. The product says so.
- The Updates feed is only as complete as the verified sources. Early on, most universities will show "no verified
  source."
- Document reading is local OCR for printed text, English only.
- A missing or stale source is shown as delayed. The feed never presents a failed check as "no update."

## Decided against for V1

- Automatic deletion of inactive accounts.
- A shared rate limiter. The deployment runs one instance.
- Automated backup of student data; the operator decides (see `docs/DATA_POLICY.md`).

## Reading order for a launch decision

1. This scope, then [DATA_POLICY.md](DATA_POLICY.md) and [PRIVACY.md](PRIVACY.md).
2. [DEPLOYMENT.md](../DEPLOYMENT.md), for what must be provisioned.
3. [RELEASE_READINESS.md](RELEASE_READINESS.md), for the open items.
