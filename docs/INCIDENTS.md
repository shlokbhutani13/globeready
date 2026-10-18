# Incident process

GlobeReady is a free beta run by one owner. This is the whole process.

## Detection
`.github/workflows/uptime-check.yml` runs every six hours. It checks that the site answers and that the news feed is less than 12 hours old. On failure it opens (or updates) a GitHub issue labelled `incident`, and closes it when checks pass again. GitHub emails the repository owner for new issues.

## Response
1. **Site down:** open the Firebase console, Hosting, and check the latest release. Roll back to the previous release if the last deploy caused it.
2. **News stale:** open Actions, "Refresh zero-cost live news", read the failing step, and re-run it. Stale news is already flagged in the app after 12 hours.
3. **Quota reached:** see the quota table in `docs/OWNER_RUNBOOK.md`. The app degrades to its saved offline content; do not enable billing.
4. **Wrong content reported:** fix or remove the passage, redeploy, and note it below.

## Reports from students
The feedback links in the app open the student's own email app (when `VITE_PRIVACY_CONTACT` is set) or the public issue tracker. Do not ask for or store passport numbers, receipt numbers or other private details.

## Log
Record each incident here with date, cause and fix.

| Date | What happened | Fix |
| --- | --- | --- |
