# Automatic live news in the zero-cost site

GlobeReady's zero-cost site combines two separate feeds:

- `client/public/data/news.json` contains human-reviewed records. These records may include GlobeReady summaries, lifecycle context and cautious profile matching.
- `client/public/data/live-news.json` contains short, automatically collected source excerpts. They are labelled **From official source — not yet reviewed by GlobeReady** and never receive personalised relevance claims, legal conclusions or suggested deadlines.

The reviewed record wins when the same canonical URL or title appears in both feeds. Both artifacts have deterministic SHA-256 content hashes that the browser verifies before rendering. A failed automatic feed does not hide the reviewed feed.

## Schedule and cost

`.github/workflows/refresh-live-news.yml` runs at minute 17 every four hours and can also be started manually. It uses the repository's included GitHub Actions allowance, requires no secret, invokes no Firebase service and deploys nothing. The job commits only these generated files back to the branch on which it runs:

- `client/public/data/live-news.json`
- `server/data/live-news-run.json`
- `server/data/live-news-candidates.json`

One failed source is recorded and isolated; successful sources still update. Previously collected items for the failed source remain available. Collection uses an honest GlobeReady user agent, bounded responses, timeouts, retries, host allowlists and robots.txt checks.

## Enabled sources and verified run

The registry is `config/news-sources.json`. On the real collection completed 2026-10-16 UTC, the enabled sources returned:

| Source | Type | Items parsed |
| --- | --- | ---: |
| U.S. Citizenship and Immigration Services | RSS | 1 |
| Study in the States | RSS | 10 |
| Student and Exchange Visitor Program | HTML | 14 |
| Federal Register | JSON | 7 |
| NAFSA press releases | HTML | 10 |
| MIT International Students Office | RSS | 20 |

Cross-source deduplication produced 58 public stories. The U.S. Department of State Visa News page returned HTTP 403 to the collector on 2026-10-15, so it is explicitly disabled and remains visible in the run report rather than being presented as monitored.

## Adding or repairing a source

1. Add an entry to `config/news-sources.json` with a unique slug, source name, HTTPS URL, parser type, trust label, enabled flag, exact allowed hosts and exact image hosts.
2. For HTML, provide narrow item, title, link, date, excerpt and image selectors. For JSON, add a bounded items path. Do not enable a URL until it returns real data with the production fetch policy.
3. Add a parser fixture and tests for malformed input, unsafe URLs and sanitization. Run `npm run news:live` from `server/` against the actual source.
4. Inspect `server/data/live-news-run.json`, the generated stories and candidate count. Disable the source with a dated reason if it fails or blocks collection.
5. Never add a source solely because its name looks official. Confirm ownership, terms, robots policy and the exact returned content.

## Copyright and images

GlobeReady stores only the headline, source name, publication date, original URL, and a source-supplied excerpt capped at about 300 characters. It does not copy full article bodies. **Read more** opens the original page in a new tab with `noopener noreferrer`.

Images are not downloaded or re-hosted. The browser may display an HTTPS lead-image URL supplied by that same source. If no permitted image exists or it fails, the page uses an original GlobeReady illustration. Source owners can change or remove a hotlinked image at any time.

NAFSA images are not displayed because its published terms reserve reuse of site images without prior written consent. NAFSA stories therefore use GlobeReady's local illustration fallback while retaining the short attributed excerpt and original-source link.

## Human review and limits

Every automatic story also becomes an `unreviewed` record in `server/data/live-news-candidates.json`. An operator can import it into the existing local/full-backend review workflow, verify all required evidence, and deliberately promote an approved record through `server/data/reviewed-public-news.json`. Automation cannot mark a record reviewed.

Automatic collection can be delayed by GitHub scheduling, source outages, feed changes, robots rules or rate limits. A source excerpt can omit important context. The interface therefore shows the last successful artifact time, source coverage notes and a direct original-source link. The feed is informational and is not legal advice or proof that no other rule has changed.
