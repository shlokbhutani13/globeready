import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { createFeedAdapter } from "../src/news/adapters/feed.js";
import { createIndexPageAdapter } from "../src/news/adapters/index-page.js";
import { createUniversitySitemapAdapter } from "../src/news/adapters/university-sitemap.js";

const source = {
  id: "uscis-alerts",
  url: "https://www.uscis.gov/news/alerts",
  allowedHosts: ["www.uscis.gov"],
  publisher: "U.S. Citizenship and Immigration Services",
};

async function fixture(name) {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

describe("official feed, index-page, and university adapters", () => {
  test("parses RSS and removes markup from excerpts", async () => {
    const candidates = await createFeedAdapter().collect(source, await fixture("agency-feed.xml"));

    expect(candidates).toEqual([expect.objectContaining({
      externalId: "alert-7",
      canonicalUrl: "https://www.uscis.gov/news/alerts/f-1-filing-update",
      title: "F-1 filing update",
      publisher: "U.S. Citizenship and Immigration Services",
      publishedAt: "2026-07-07",
      updatedAt: "2026-07-08",
      effectiveAt: null,
      sourceDocumentType: "Notice",
    })]);
    expect(candidates[0].excerpt).toBe("Submit the updated form before the deadline.");
    expect(candidates[0].normalizedText).toBe(candidates[0].excerpt);
  });

  test("maps Atom alternate links and unsupported dates deterministically", async () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>atom-4</id><title>J-1 update</title><link rel="alternate" href="/news/alerts/j-1-update"/><summary><![CDATA[<p>Updated <em>guidance</em>.</p>]]></summary><published>invalid</published><updated>2026-08-14T00:00:00Z</updated></entry></feed>`;

    await expect(createFeedAdapter().collect(source, atom)).resolves.toEqual([expect.objectContaining({
      externalId: "atom-4",
      canonicalUrl: "https://www.uscis.gov/news/alerts/j-1-update",
      publishedAt: null,
      updatedAt: "2026-08-14",
      excerpt: "Updated guidance.",
    })]);
  });

  test("rejects an off-source feed item URL instead of emitting it", async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>unsafe</guid><title>Unsafe</title><link>https://attacker.example/news</link></item></channel></rss>`;

    await expect(createFeedAdapter().collect(source, feed)).rejects.toThrow(/not allowlisted|approved source host/i);
  });

  test("extracts dated index entries while ignoring navigation", async () => {
    const candidates = await createIndexPageAdapter().collect(source, await fixture("agency-index.html"));

    expect(candidates).toEqual([
      expect.objectContaining({
        externalId: "alert-8",
        canonicalUrl: "https://www.uscis.gov/news/alerts/opt-reporting",
        title: "OPT reporting deadline",
        publishedAt: "2026-08-12",
        excerpt: "Students must report address changes within 10 days.",
      }),
      expect.objectContaining({
        externalId: "alert-9",
        canonicalUrl: "https://www.uscis.gov/news/alerts/form-update",
        publishedAt: null,
      }),
    ]);
  });

  test("rejects an off-source index item URL instead of emitting it", async () => {
    const page = "<main><article><a href='https://attacker.example/notice'>Unsafe notice</a><time datetime='2026-09-01'>September 1</time></article></main>";

    await expect(createIndexPageAdapter().collect(source, page)).rejects.toThrow(/not allowlisted|approved source host/i);
  });

  test("university discovery keeps relevant same-domain URLs", async () => {
    const result = await createUniversitySitemapAdapter().discover(
      { officialDomain: "example.edu" },
      await fixture("university-sitemap.xml"),
    );

    expect(result.urls).toEqual([
      "https://international.example.edu/news",
      "https://registrar.example.edu/academic-calendar",
    ]);
    expect(result.feeds).toEqual(["https://international.example.edu/feed.xml"]);
    expect(result.indexes).toEqual(result.urls);
  });

  test("university discovery excludes sibling and external domains", async () => {
    const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://evil-example.edu/visa</loc></url><url><loc>https://example.edu.evil.test/registrar</loc></url><url><loc>https://international.example.edu/visa</loc></url></urlset>`;

    await expect(createUniversitySitemapAdapter().discover({ officialDomain: "example.edu" }, sitemap))
      .resolves.toMatchObject({ urls: ["https://international.example.edu/visa"], feeds: [] });
  });
});
