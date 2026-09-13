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

  test("parses namespaced Atom entries with XHTML child text", async () => {
    const atom = `<?xml version="1.0"?><atom:feed xmlns:atom="http://www.w3.org/2005/Atom" xmlns:xhtml="http://www.w3.org/1999/xhtml"><atom:entry><atom:id>namespaced-atom</atom:id><atom:title>F-1 update</atom:title><atom:link rel="alternate" href="/news/alerts/f-1"/><atom:content type="xhtml"><xhtml:div><xhtml:p>Important <xhtml:strong>update</xhtml:strong>.</xhtml:p></xhtml:div></atom:content><atom:published>2026-08-14T23:30:00-04:00</atom:published></atom:entry></atom:feed>`;

    await expect(createFeedAdapter().collect(source, atom)).resolves.toEqual([expect.objectContaining({
      externalId: "namespaced-atom",
      canonicalUrl: "https://www.uscis.gov/news/alerts/f-1",
      excerpt: "Important update.",
      publishedAt: "2026-08-15",
    })]);
  });

  test("parses RDF RSS items and falls back to their canonical URL without a GUID", async () => {
    const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><item rdf:about="https://www.uscis.gov/news/alerts/rdf"><title>RDF notice</title><link>https://www.uscis.gov/news/alerts/rdf?msclkid=1</link><description><![CDATA[<p>Official RDF notice.</p>]]></description></item></rdf:RDF>`;

    await expect(createFeedAdapter().collect(source, rdf)).resolves.toEqual([expect.objectContaining({
      externalId: "https://www.uscis.gov/news/alerts/rdf",
      canonicalUrl: "https://www.uscis.gov/news/alerts/rdf",
      excerpt: "Official RDF notice.",
    })]);
  });

  test("rejects ambiguous and timezone-less dates while retaining zoned RFC dates", async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>a</guid><title>A</title><link>/news/alerts/a</link><pubDate>2026-08</pubDate></item><item><guid>b</guid><title>B</title><link>/news/alerts/b</link><pubDate>2026-08-14T12:00:00</pubDate></item><item><guid>c</guid><title>C</title><link>/news/alerts/c</link><pubDate>Fri, 14 Aug 2026 23:30:00 -0400</pubDate></item></channel></rss>`;

    const candidates = await createFeedAdapter().collect(source, feed);

    expect(candidates.map((candidate) => candidate.publishedAt)).toEqual([null, null, "2026-08-15"]);
  });

  test("uses parser text extraction without deleting literal comparison text", async () => {
    const page = "<main><article><a href='/news/alerts/score'>Score &lt; 10 and &gt; 5</a><p>Score &lt; 10 and &gt; 5<script>ignored()</script><style>.ignored{}</style></p></article></main>";

    await expect(createIndexPageAdapter().collect(source, page)).resolves.toEqual([expect.objectContaining({
      title: "Score < 10 and > 5",
      excerpt: "Score < 10 and > 5",
    })]);
  });

  test("bounds excerpts by Unicode code points without a dangling surrogate", async () => {
    const description = `${"a".repeat(499)}😀z`;
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>unicode</guid><title>Unicode</title><link>/news/alerts/unicode</link><description><![CDATA[${description}]]></description></item></channel></rss>`;

    const [candidate] = await createFeedAdapter().collect(source, feed);

    expect([...candidate.excerpt]).toHaveLength(500);
    expect(candidate.excerpt.endsWith("😀")).toBe(true);
    expect(candidate.excerpt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

  test("preserves internal repeated URL slashes while removing trailing slashes and tracking keys", async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item><guid>slashes</guid><title>Slashes</title><link>https://www.uscis.gov/news//alerts/item///?dclid=1&amp;mc_cid=2&amp;mc_eid=3</link></item></channel></rss>`;

    await expect(createFeedAdapter().collect(source, feed)).resolves.toEqual([expect.objectContaining({
      canonicalUrl: "https://www.uscis.gov/news//alerts/item",
    })]);
  });

  test("uses a contained base URL and supports an anchor item selector", async () => {
    const page = "<head><base href='https://www.uscis.gov/official/'></head><main><a href='notice'>F-1 notice</a></main>";

    await expect(createIndexPageAdapter().collect({ ...source, itemSelector: "main a" }, page)).resolves.toEqual([
      expect.objectContaining({ canonicalUrl: "https://www.uscis.gov/official/notice", title: "F-1 notice" }),
    ]);
  });

  test("rejects an off-source HTML base URL", async () => {
    const page = "<head><base href='https://attacker.example/'></head><main><article><a href='notice'>Unsafe base</a></article></main>";

    await expect(createIndexPageAdapter().collect(source, page)).rejects.toThrow(/base|allowlisted|approved/i);
  });

  test("discovers namespaced sitemap indexes separately and normalizes a www university host", async () => {
    const sitemapIndex = `<?xml version="1.0"?><sm:sitemapindex xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:sitemap><sm:loc>https://international.example.edu/sitemap.xml</sm:loc></sm:sitemap><sm:sitemap><sm:loc>https://attacker.example/sitemap.xml</sm:loc></sm:sitemap></sm:sitemapindex>`;

    await expect(createUniversitySitemapAdapter().discover({ officialDomain: "www.example.edu" }, sitemapIndex))
      .resolves.toEqual({ urls: [], feeds: [], indexes: [], sitemaps: ["https://international.example.edu/sitemap.xml"] });
  });

  test("matches university relevance on path terms instead of incidental substrings", async () => {
    const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://international.example.edu/taxonomy</loc></url><url><loc>https://international.example.edu/adoption</loc></url><url><loc>https://athletics.example.edu/academic-calendar</loc></url><url><loc>https://international.example.edu/international-students</loc></url><url><loc>https://registrar.example.edu/academic-calendar</loc></url><url><loc>https://www.example.edu/global-services/visa</loc></url></urlset>`;

    await expect(createUniversitySitemapAdapter().discover({ officialDomain: "example.edu" }, sitemap))
      .resolves.toMatchObject({
        urls: [
          "https://international.example.edu/international-students",
          "https://registrar.example.edu/academic-calendar",
          "https://www.example.edu/global-services/visa",
        ],
      });
  });

  test("rejects entity declarations and input beyond the parser byte limit", async () => {
    const entity = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY xxe "unsafe">]><rss><channel><item><guid>entity</guid><title>Entity</title><link>/news/alerts/entity</link><description>&xxe;</description></item></channel></rss>`;
    const oversized = `<rss><channel>${"x".repeat(5 * 1024 * 1024)}</channel></rss>`;

    await expect(createFeedAdapter().collect(source, entity)).rejects.toThrow(/entity|malformed/i);
    await expect(createFeedAdapter().collect(source, oversized)).rejects.toThrow(/five megabyte/i);
  });

  test("preserves mixed Atom XHTML document order", async () => {
    const atom = `<?xml version="1.0"?><feed><entry><id>ordered</id><title>Ordered</title><link href="/news/alerts/ordered"/><content><div>First <strong>second <em>third</em></strong> fourth <b>fifth</b>.</div></content></entry></feed>`;

    await expect(createFeedAdapter().collect(source, atom)).resolves.toEqual([expect.objectContaining({
      excerpt: "First second third fourth fifth.",
    })]);
  });

  test("maps RSS1 Dublin Core dates and rejects impossible RFC calendar dates", async () => {
    const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>RSS1 date</title><link>/news/alerts/rss1-date</link><dc:date>2026-08-14T23:30:00-04:00</dc:date></item><item><title>Impossible April</title><link>/news/alerts/april</link><dc:date>Fri, 31 Apr 2026 12:00:00 +0000</dc:date></item><item><title>Impossible leap</title><link>/news/alerts/leap</link><dc:date>Wed, 29 Feb 2023 12:00:00 +0000</dc:date></item></rdf:RDF>`;

    const candidates = await createFeedAdapter().collect(source, rdf);

    expect(candidates.map((candidate) => candidate.publishedAt)).toEqual(["2026-08-15", null, null]);
  });

  test("keeps visible escaped markup after Cheerio has decoded page text", async () => {
    const page = "<main><article><a href='/news/alerts/literal'>Literal</a><p>&lt;em&gt;literal&lt;/em&gt; &amp; safe</p></article></main>";

    await expect(createIndexPageAdapter().collect(source, page)).resolves.toEqual([expect.objectContaining({
      excerpt: "<em>literal</em> & safe",
    })]);
  });

  test("resolves relative URLs against an uncanonicalized contained base", async () => {
    const page = "<head><base href='https://www.uscis.gov/official//'></head><main><article><a href='notice'>Base order</a></article></main>";

    await expect(createIndexPageAdapter().collect(source, page)).resolves.toEqual([expect.objectContaining({
      canonicalUrl: "https://www.uscis.gov/official//notice",
    })]);
  });

  test("uses hyphenated host labels for negative and strong relevance signals", async () => {
    const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://sports-news.example.edu/international-students</loc></url><url><loc>https://not-athletics.example.edu/visa</loc></url><url><loc>https://international.example.edu/calendar</loc></url></urlset>`;

    await expect(createUniversitySitemapAdapter().discover({ officialDomain: "example.edu" }, sitemap))
      .resolves.toMatchObject({ urls: ["https://international.example.edu/calendar"] });
  });

  test("skips sitemap paths with malformed percent escapes without leaking URIError", async () => {
    const sitemap = `<?xml version="1.0"?><urlset><url><loc>https://international.example.edu/visa%</loc></url></urlset>`;

    await expect(createUniversitySitemapAdapter().discover({ officialDomain: "example.edu" }, sitemap))
      .resolves.toMatchObject({ urls: [], feeds: [] });
  });

  test("preserves mixed Atom XHTML order for titles and content", async () => {
    const atom = `<?xml version="1.0"?><feed><entry><id>atom-order</id><title>First <b>second <i>third</i></b> fourth <em>fifth</em>.</title><link href="/news/alerts/atom-order"/><content><div>First <b>second <i>third</i></b> fourth <em>fifth</em>.</div></content></entry></feed>`;

    await expect(createFeedAdapter().collect(source, atom)).resolves.toEqual([expect.objectContaining({
      title: "First second third fourth fifth.",
      excerpt: "First second third fourth fifth.",
    })]);
  });

  test("preserves visible escaped markup in Atom XHTML text", async () => {
    const atom = `<?xml version="1.0"?><feed><entry><id>atom-literal</id><title>Literal</title><link href="/news/alerts/atom-literal"/><content><div>Show &lt;em&gt;literal&lt;/em&gt; &amp; safe</div></content></entry></feed>`;

    await expect(createFeedAdapter().collect(source, atom)).resolves.toEqual([expect.objectContaining({
      excerpt: "Show <em>literal</em> & safe",
    })]);
  });

  test("binds Atom ordered text to direct feed entries despite foreign nested decoys", async () => {
    const atom = `<?xml version="1.0"?><feed><extension><entry><title>Decoy</title><content>Wrong first</content></entry></extension><entry><id>one</id><title>One</title><link href="/news/alerts/one"/><content>First content</content></entry><foreign><entry><title>Decoy two</title><content>Wrong second</content></entry></foreign><entry><id>two</id><title>Two</title><link href="/news/alerts/two"/><content>Second content</content></entry></feed>`;

    const candidates = await createFeedAdapter().collect(source, atom);

    expect(candidates.map((candidate) => [candidate.title, candidate.excerpt]))
      .toEqual([["One", "First content"], ["Two", "Second content"]]);
  });

  test("binds RSS ordered titles and descriptions to direct channel items", async () => {
    const rss = `<?xml version="1.0"?><rss><channel><extension><item><title>Decoy</title><description>Wrong first</description></item></extension><item><title>First <b>second <i>third</i></b> fourth <em>fifth</em>.</title><link>/news/alerts/rss-one</link><description>First description</description></item><foreign><item><title>Decoy two</title><description>Wrong second</description></item></foreign><item><title>Two</title><link>/news/alerts/rss-two</link><description>Second description</description></item></channel></rss>`;

    const candidates = await createFeedAdapter().collect(source, rss);

    expect(candidates.map((candidate) => [candidate.title, candidate.excerpt]))
      .toEqual([
        ["First second third fourth fifth.", "First description"],
        ["Two", "Second description"],
      ]);
  });
});
