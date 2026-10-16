import { describe, expect, test, vi } from "vitest";

import { buildAutoReviewCandidates, collectAutoNews, contentHashForAutoNews } from "../src/news/auto-collector.js";

const sources = [
  { id: "ok", name: "Working Agency", enabled: true, type: "rss", url: "https://ok.gov/feed", allowedHosts: ["ok.gov"] },
  { id: "down", name: "Unavailable Agency", enabled: true, type: "rss", url: "https://down.gov/feed", allowedHosts: ["down.gov"] },
  { id: "disabled", name: "Disabled", enabled: false, disabledReason: "HTTP 403", type: "html", url: "https://disabled.gov/news", allowedHosts: ["disabled.gov"] },
];

const rss = `<?xml version="1.0"?><rss><channel><item><title>Official update</title><link>https://ok.gov/update</link><pubDate>Thu, 15 Oct 2026 12:00:00 GMT</pubDate><description>Official excerpt.</description></item></channel></rss>`;

describe("automatic news collector", () => {
  test("isolates a failed source, retries it, and preserves its previous stories", async () => {
    const fetcher = vi.fn(async (source) => {
      if (source.id === "down") throw new Error("HTTP 503");
      return { text: rss, finalUrl: source.url };
    });
    const previous = { stories: [{ id: "old", sourceId: "down", title: "Prior official item", canonicalUrl: "https://down.gov/old", publishedAt: "2026-10-14", editorialState: "source-only" }] };

    const artifact = await collectAutoNews({ sources, fetcher, robots: { isAllowed: async () => true }, previous, now: () => new Date("2026-10-15T16:00:00Z"), retryDelays: [0, 0] });

    expect(artifact.stories.map((item) => item.id)).toEqual(expect.arrayContaining(["old", expect.stringMatching(/^auto-ok-/u)]));
    expect(artifact.sourceReports).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: "ok", state: "current", fetched: 1 }),
      expect.objectContaining({ sourceId: "down", state: "failed", attempts: 3, retained: 1, error: "HTTP 503" }),
      expect.objectContaining({ sourceId: "disabled", state: "disabled", reason: "HTTP 403" }),
    ]));
    expect(fetcher.mock.calls.filter(([source]) => source.id === "down")).toHaveLength(3);
    expect(artifact.contentHash).toBe(await contentHashForAutoNews(artifact));
  });

  test("a robots refusal disables only that source for the run", async () => {
    const artifact = await collectAutoNews({
      sources: sources.slice(0, 2),
      fetcher: async (source) => ({ text: rss.replaceAll("ok.gov", `${source.id}.gov`), finalUrl: source.url }),
      robots: { isAllowed: async (source) => source.id !== "down" },
      now: () => new Date("2026-10-15T16:00:00Z"), retryDelays: [],
    });
    expect(artifact.sourceReports.find((entry) => entry.sourceId === "down")).toMatchObject({ state: "blocked-by-robots", fetched: 0 });
    expect(artifact.stories).toHaveLength(1);
  });

  test("adds a source-owned Open Graph image without failing the story when detail fetch fails", async () => {
    const detailFetcher = vi.fn(async (source) => {
      if (source.url.endsWith("/update")) return { text: `<meta property="og:image" content="https://ok.gov/lead.jpg">`, finalUrl: source.url };
      throw new Error("detail unavailable");
    });
    const artifact = await collectAutoNews({
      sources: [sources[0]], fetcher: async (source) => ({ text: rss, finalUrl: source.url }), detailFetcher,
      robots: { isAllowed: async () => true }, now: () => new Date("2026-10-15T16:00:00Z"), retryDelays: [],
    });
    expect(artifact.stories[0].image).toEqual({ url: "https://ok.gov/lead.jpg", alt: "Official update" });
  });

  test("turns every automatic story into an unreviewed candidate for the existing approval flow", async () => {
    const artifact = await collectAutoNews({
      sources: [sources[0]], fetcher: async (source) => ({ text: rss, finalUrl: source.url }),
      robots: { isAllowed: async () => true }, now: () => new Date("2026-10-15T16:00:00Z"), retryDelays: [],
    });
    const candidates = buildAutoReviewCandidates(artifact.stories, [sources[0]], artifact.generatedAt);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ sourceId: "ok", publicationState: "unreviewed", changeType: "new", current: { title: "Official update", sourceExcerpt: "Official excerpt." } });
    expect(candidates[0].id).toMatch(/^review-candidate:[a-f0-9]{64}$/u);
  });
});
