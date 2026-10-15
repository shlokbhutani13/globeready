# News review operations

GlobeReady never publishes a collected legal or status update automatically. Monitoring creates a bounded candidate;
a human reviewer makes an explicit decision; only reviewed input generates the static student feed.

## Candidate to publication

1. The weekly GitHub workflow or the local fixture command collects only registered official HTTPS sources. It records
   source, collection time, source health, old and new values, meaningful field differences, and a stable fingerprint.
2. The change ledger classifies a candidate as new, changed, redirected, or removed. A removal requires two successful
   collections with the item absent. A failed collection marks source health and cannot remove an item.
3. The candidate stays `unreviewed`. It is not read by the public artifact builder and contains no AI-written legal
   interpretation.
4. Download `server/data/news-proposals.json` from the review pull request or workflow artifact. In a locally running
   full-backend admin workspace, use **Import review artifact** to load it into the durable candidate queue, then compare
   the evidence with the official page. Importing never publishes. Approving requires confirmation of the
   source, title, dates, legal state, factual summary, affected tags, and image policy. Reject and defer use bounded
   reason fields. A correction keeps the public ID; archive/retraction keeps public history and requires public wording.
   The complete decision payload is retained with the candidate for the editor to apply. The public zero-cost site has
   no admin backend by design; editorial review happens locally or in a separately provisioned full backend.
5. Apply the retained approved record to `server/data/reviewed-public-news.json`, then run:

   ```bash
   cd server
   npm run news:public -- --input data/reviewed-public-news.json
   npm test -- tests/public-news-artifact.test.js
   ```

The generator is deterministic and allowlists public fields. Reviewer identity, private notes, raw exception details,
and unreviewed candidates never enter `client/public/data/news.json`.

## Credential-free local rehearsal

Use committed fixtures; this command makes no government, university, Firebase, Gemini, or email request:

```bash
cd server
candidate_dir="$(mktemp -d)"
npm run news:public -- \
  --fixture-input tests/fixtures/news-change-ledger/current.json \
  --snapshot-input tests/fixtures/news-change-ledger/previous.json \
  --snapshot-output "$candidate_dir/snapshot.json" \
  --discover-output "$candidate_dir/candidates.json"
```

Review decisions can be previewed without writes with `npm run news:operations -- --candidate-file=<file>
--decision=reject`. The command is dry-run by default.

## Failure and rollback

- A malformed or oversized candidate aborts the artifact; it is never partially published.
- A collection failure preserves the last reviewed feed and changes only source-health evidence.
- If a bad static update has not deployed, revert the reviewed input and regenerate. If it deployed, redeploy the last
  known-good commit or use the hosting release rollback, then correct the reviewed input. Do not erase a published
  correction or retraction from history.
- Never bypass review because a source is urgent. Link students to the official source and complete the same evidence
  confirmations.

Pushing, GitHub-hosted CI, live collection, preview deployment, and destructive smoke tests require separate approval.
