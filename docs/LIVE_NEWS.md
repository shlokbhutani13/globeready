# Automatic live news in the zero-cost site

GlobeReady's zero-cost site combines two separate feeds:

- `client/public/data/news.json` contains human-reviewed records. These records may include GlobeReady summaries, lifecycle context and cautious profile matching.
- `client/public/data/live-news.json` contains short, automatically collected source excerpts. They are labelled **From official source — not yet reviewed by GlobeReady**. A deterministic classifier adds only the supported topic and visa tags found in the headline and excerpt. Those tags can produce the existing **May be relevant to you** profile match, but never a legal conclusion, applicability decision or suggested deadline.

The reviewed record wins when the same canonical URL or title appears in both feeds. Both artifacts have deterministic SHA-256 content hashes that the browser verifies before rendering. A failed automatic feed does not hide the reviewed feed.

## Schedule and cost

`.github/workflows/refresh-live-news.yml` runs at minute 17 every four hours and can also be started manually. It uses the repository's included GitHub Actions allowance, requires no secret, invokes no Firebase service and deploys nothing. The job commits only these generated files back to the branch on which it runs:

- `client/public/data/live-news.json`
- `server/data/live-news-run.json`
- `server/data/live-news-candidates.json`

One failed source is recorded and isolated; successful sources still update. Previously collected items for the failed source remain available and are identified as retained. Each report preserves the last successful refresh and the start of the current failure. After an enabled source has been failing for 24 hours, the workflow opens one GitHub issue with a stable source marker; it closes that issue after recovery or intentional disabling. Collection uses an honest GlobeReady user agent, bounded responses, timeouts, retries, host allowlists and robots.txt checks.

## Relevance filtering and tags

Study in the States and SEVP are explicitly marked as student-specific sources, so their items enter the feed by default and receive deterministic tags wherever supported terms occur. Broader sources must match an international-student topic and any configured source-specific relevance terms. The vocabulary includes F/J/M classifications, nonimmigrants, academic students, exchange visitors, DSO, SEVP, SEVIS, admission periods, duration of status, extensions of stay and student-program fee terms. The supported visible topics are Visa (`status`), Forms and fees (`forms-fees`), Work authorization (`employment`), Travel (`travel-entry`), Tax (`taxes-social-security`) and University (`university`). Visa types are tagged only when an explicit visa term such as F-1, J-1 or M-1 appears. Keyword matching is boundary-aware so a term such as `OPT` cannot match an unrelated word such as “adoption.”

This is a conservative text filter, not an AI or legal classifier. It can miss a relevant update, and a tag only describes the words in the source excerpt. Reviewed records remain separate and retain their human-reviewed treatment.

Each automatic record also has a deterministic `updateType`: proposed rule, final rule, announcement, court development or guidance. Federal Register structured document metadata controls its rule type and supplies a separate effective date when one is published; other parsers use bounded explicit wording and otherwise fall back to announcement/guidance. `publishedAt` and `effectiveAt` are never treated as the same date. Exact Federal Register document numbers, or an exact normalized title plus publication date, form conservative cross-source clusters. Clustering does not delete a story: every source record remains available through **Show all** and source filters.

## Enabled sources and verified dry run

The registry is `config/news-sources.json`. A local real-source dry run completed 2026-10-16 UTC after relevance filtering returned:

| Source | Type | Items parsed |
| --- | --- | ---: |
| U.S. Citizenship and Immigration Services | RSS | 0 |
| Study in the States | RSS | 4 |
| Student and Exchange Visitor Program | HTML | 7 |
| Federal Register | JSON | 5 |
| NAFSA press releases | HTML | 9 |
| MIT International Students Office | RSS | 20 |

Cross-source deduplication produced 44 relevant public stories, all with at least one supported topic. The USCIS newsroom was reachable but its current item did not contain explicit international-student context, so it correctly contributed zero rather than admitting an unrelated story. The U.S. Department of State Visa News page returned HTTP 403 to the collector on 2026-10-15, so it is explicitly disabled and remains visible in the run report rather than being presented as monitored. This dry run does not update or deploy the checked-in public artifact; the scheduled workflow will regenerate it after merge.

## Adding or repairing a source

1. Add an entry to `config/news-sources.json` with a unique slug, source name, HTTPS URL, parser type, trust label, enabled flag, exact allowed hosts and exact image hosts. Add `studentContextKeywords` when a broad source must mention an international-student term before an item is accepted.
2. For HTML, provide narrow item, title, link, date, excerpt and image selectors. For JSON, add a bounded items path. Do not enable a URL until it returns real data with the production fetch policy.
3. Add a parser fixture and tests for malformed input, unsafe URLs and sanitization. Run `npm run news:live` from `server/` against the actual source.
4. Inspect `server/data/live-news-run.json`, the generated stories and candidate count. Disable the source with a dated reason if it fails or blocks collection.
5. Never add a source solely because its name looks official. Confirm ownership, terms, robots policy and the exact returned content.

## Copyright and images

GlobeReady stores only the headline, source name, publication date, original URL, and a source-supplied excerpt capped at about 300 characters. It does not copy full article bodies. **Read more** opens the original page in a new tab with `noopener noreferrer`.

Images are not downloaded or re-hosted. The browser may display an HTTPS lead-image URL supplied by that same source when its terms permit it. If no permitted image exists or it fails, the page uses a distinct, original GlobeReady illustration for that source. These local illustrations contain no source seals or logos. Source owners can change or remove a hotlinked image at any time.

NAFSA images are not displayed because its published terms reserve reuse of site images without prior written consent. NAFSA stories therefore use GlobeReady's local illustration fallback while retaining the short attributed excerpt and original-source link.

No new image-bearing source was enabled in this change. The IRS and U.S. Department of Labor were evaluated from their official reuse policies. Both warn that third-party material can appear within otherwise public-domain federal content, and the IRS did not expose a suitable structured, student-focused newsroom feed. The Department of Labor has an official releases feed, but it is broad rather than international-student focused and does not provide blanket rights for every supplied image. Adding either merely to increase image count would reduce relevance or create avoidable rights ambiguity. See [IRS use of content](https://www.irs.gov/about-irs/use-of-content-from-irsgov) and [Department of Labor copyright policy](https://www.dol.gov/general/aboutdol/copyright).

## Human review and limits

Every automatic story also becomes an `unreviewed` record in `server/data/live-news-candidates.json`. An operator can import it into the existing local/full-backend review workflow, verify all required evidence, and deliberately promote an approved record through `server/data/reviewed-public-news.json`. Automation cannot mark a record reviewed.

Automatic collection can be delayed by GitHub scheduling, source outages, feed changes, robots rules or rate limits. A source excerpt can omit important context. The interface therefore shows the last successful artifact time, source coverage notes and a direct original-source link. The feed is informational and is not legal advice or proof that no other rule has changed.

The public source indicator reports both sources reached successfully and sources that returned at least one relevant story. It shows failure duration and how many older stories are retained when applicable. A reachable source with zero matching stories is not presented as failed; an intentionally disabled source is listed separately with its reason and excluded from the monitored-source denominator. On the unfiltered News page, automatic stories are initially capped at six per source so one publisher cannot dominate the page. **Show all** and the source filter reveal every collected story; reviewed records are never capped.
