import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

import {
  classifyAutoStory,
  deduplicateAutoStories,
  extractLeadImage,
  parseAutoSource,
  sanitizeExcerpt,
  stableStoryId,
} from "../src/news/auto-ingestion.js";

const rssSource = {
  id: "agency", name: "Agency", type: "rss", url: "https://agency.gov/feed.xml",
  allowedHosts: ["agency.gov"], imageHosts: ["agency.gov", "media.agency.gov"], itemLimit: 20,
};

describe("automatic official-source ingestion", () => {
  test.each([
    ["visa", "F-1 student visa interview guidance", "", ["status"]],
    ["work authorization", "New STEM OPT employment authorization update", "", ["employment"]],
    ["travel", "Travel signatures and re-entry reminder", "", ["travel-entry"]],
    ["tax", "Nonresident student Form 1040-NR tax filing", "", ["taxes-social-security"]],
    ["university", "International office orientation for new students", "", ["university"]],
  ])("tags %s stories with the canonical profile topic", (_label, title, excerpt, topics) => {
    expect(classifyAutoStory({ title, excerpt }).topics).toEqual(expect.arrayContaining(topics));
  });

  test("extracts student visa types without turning them into legal conclusions", () => {
    expect(classifyAutoStory({ title: "F-1 and J-1 students: new OPT guidance", excerpt: "" }))
      .toEqual(expect.objectContaining({ topics: expect.arrayContaining(["status", "employment"]), visaTypes: ["f-1", "j-1"] }));
  });

  test("does not hotlink NAFSA images without reuse permission", () => {
    const registry = JSON.parse(readFileSync(new URL("../../config/news-sources.json", import.meta.url), "utf8"));
    const nafsa = registry.sources.find((source) => source.id === "nafsa-press");
    expect(nafsa.imageHosts).toEqual([]);
    expect(extractLeadImage(nafsa, '<meta property="og:image" content="https://www.nafsa.org/logo.jpg">', nafsa.url, "NAFSA update")).toBeUndefined();
  });

  test("parses RSS excerpts, dates and media without retaining markup", () => {
    const xml = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/"><channel><item><guid>one</guid><title> F-1 &amp; J-1 update </title><link>https://agency.gov/news/one?utm_source=x</link><pubDate>Wed, 14 Oct 2026 12:00:00 GMT</pubDate><description><![CDATA[<p>Short <strong>official</strong> summary.</p><script>alert(1)</script>]]></description><media:content url="https://media.agency.gov/lead.jpg" type="image/jpeg" /></item></channel></rss>`;
    const [story] = parseAutoSource(rssSource, { text: xml, finalUrl: rssSource.url });

    expect(story).toMatchObject({
      id: stableStoryId("agency", "https://agency.gov/news/one"),
      sourceId: "agency", publisher: "Agency", title: "F-1 & J-1 update",
      canonicalUrl: "https://agency.gov/news/one", publishedAt: "2026-10-14",
      excerpt: "Short official summary.", editorialState: "source-only",
      trustLabel: "From official source — not yet reviewed by GlobeReady",
      image: { url: "https://media.agency.gov/lead.jpg", alt: "F-1 & J-1 update" },
    });
    expect(JSON.stringify(story)).not.toMatch(/script|alert\(1\)/i);
  });

  test("uses the first source-owned image embedded in a feed summary", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Campus update</title><link>https://agency.gov/campus</link><description><![CDATA[<img src="https://agency.gov/campus.jpg" alt="International students"><p>Campus summary.</p>]]></description></item></channel></rss>`;
    expect(parseAutoSource(rssSource, { text: xml, finalUrl: rssSource.url })[0].image).toEqual({ url: "https://agency.gov/campus.jpg", alt: "Campus update" });
  });

  test("parses Atom alternate links and enclosures", () => {
    const source = { ...rssSource, type: "atom" };
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:agency.gov,2026:two</id><title>Visa alert</title><link rel="alternate" href="/news/two"/><link rel="enclosure" type="image/png" href="https://agency.gov/two.png"/><updated>2026-10-15T08:30:00Z</updated><summary type="html">&lt;p&gt;Read the agency update.&lt;/p&gt;</summary></entry></feed>`;
    const [story] = parseAutoSource(source, { text: xml, finalUrl: source.url });
    expect(story).toMatchObject({ canonicalUrl: "https://agency.gov/news/two", publishedAt: "2026-10-15", excerpt: "Read the agency update.", image: { url: "https://agency.gov/two.png", alt: "Visa alert" } });
  });

  test("parses configured HTML cards and their lead images", () => {
    const source = {
      ...rssSource, type: "html", itemSelector: "article", titleSelector: "h2",
      linkSelector: "a", dateSelector: "time", excerptSelector: "p", imageSelector: "img",
    };
    const html = `<main><article><h2>OPT filing notice</h2><a href="/news/opt">Open</a><time datetime="2026-10-13">Oct 13</time><p>Use the updated form. <style>bad{}</style></p><img src="/images/opt.webp" alt="USCIS building"></article></main>`;
    const [story] = parseAutoSource(source, { text: html, finalUrl: source.url });
    expect(story).toMatchObject({ title: "OPT filing notice", canonicalUrl: "https://agency.gov/news/opt", publishedAt: "2026-10-13", excerpt: "Use the updated form.", image: { url: "https://agency.gov/images/opt.webp", alt: "USCIS building" } });
  });

  test("parses Federal Register JSON search results", () => {
    const source = { ...rssSource, id: "federal-register", name: "Federal Register", type: "json", jsonItemsPath: "results", allowedHosts: ["www.federalregister.gov"] };
    const payload = JSON.stringify({ results: [{ document_number: "2026-12345", title: "Student visa rule", html_url: "https://www.federalregister.gov/documents/2026/10/15/2026-12345/student-visa-rule", publication_date: "2026-10-15", abstract: "A proposed change affecting student visas." }] });
    expect(parseAutoSource(source, { text: payload, finalUrl: source.url })).toEqual([expect.objectContaining({ sourceId: "federal-register", title: "Student visa rule", publishedAt: "2026-10-15", excerpt: "A proposed change affecting student visas." })]);
  });

  test("sanitizes, bounds and rejects unsafe text and URLs", () => {
    expect([...sanitizeExcerpt(`<p>${"a".repeat(400)}</p><script>bad()</script>`)]).toHaveLength(300);
    const unsafe = `<?xml version="1.0"?><rss><channel><item><title>Unsafe</title><link>javascript:alert(1)</link><description>Text</description></item></channel></rss>`;
    expect(parseAutoSource(rssSource, { text: unsafe, finalUrl: rssSource.url })).toEqual([]);
  });

  test("skips one malformed HTML card without dropping the source", () => {
    const source = { ...rssSource, type: "html", itemSelector: "article", titleSelector: "h2", linkSelector: "a", excerptSelector: "p" };
    const html = `<article><h2>Bad</h2><a href="javascript:bad()">Bad</a></article><article><h2>Good international student update</h2><a href="/good">Good</a><p>Useful summary.</p></article>`;
    expect(parseAutoSource(source, { text: html, finalUrl: source.url })).toEqual([expect.objectContaining({ title: "Good international student update" })]);
  });

  test("applies configured relevance terms to broad official feeds", () => {
    const source = { ...rssSource, includeKeywords: ["student", "F-1"] };
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Unrelated agency release</title><link>https://agency.gov/a</link></item><item><title>F-1 student filing update</title><link>https://agency.gov/b</link></item></channel></rss>`;
    expect(parseAutoSource(source, { text: xml, finalUrl: source.url }).map((item) => item.title)).toEqual(["F-1 student filing update"]);
  });

  test("requires an explicit student signal when a broad source config asks for one", () => {
    const source = { ...rssSource, includeKeywords: ["employment authorization", "F-1"], studentContextKeywords: ["F-1", "OPT", "international student"] };
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Employment authorization for professional athletes</title><link>https://agency.gov/athletes</link><description>Guidance follows adoption of a new system.</description></item><item><title>F-1 employment authorization update</title><link>https://agency.gov/students</link></item></channel></rss>`;
    expect(parseAutoSource(source, { text: xml, finalUrl: source.url }).map((item) => item.title)).toEqual(["F-1 employment authorization update"]);
  });

  test("drops stories with no international-student topic signal", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>Agency building maintenance</title><link>https://agency.gov/maintenance</link><description>Elevator work begins Monday.</description></item><item><title>F-1 travel reminder</title><link>https://agency.gov/travel</link><description>Students should review re-entry documents.</description></item></channel></rss>`;
    expect(parseAutoSource(rssSource, { text: xml, finalUrl: rssSource.url }).map((item) => item.title)).toEqual(["F-1 travel reminder"]);
  });

  test("deduplicates canonical URLs and normalized titles deterministically", () => {
    const items = [
      { id: "b", sourceId: "b", title: "Visa Update", canonicalUrl: "https://b.gov/2", publishedAt: "2026-10-14" },
      { id: "a", sourceId: "a", title: " visa   update ", canonicalUrl: "https://a.gov/1", publishedAt: "2026-10-15" },
      { id: "c", sourceId: "c", title: "Different", canonicalUrl: "https://a.gov/1", publishedAt: "2026-10-13" },
    ];
    expect(deduplicateAutoStories(items).map((item) => item.id)).toEqual(["a"]);
  });

  test("extracts only an allowlisted HTTPS Open Graph image", () => {
    const html = `<meta property="og:image" content="https://media.agency.gov/lead.jpg"><meta property="og:image:alt" content="Students on campus">`;
    expect(extractLeadImage(rssSource, html, "https://agency.gov/news/one", "Fallback")).toEqual({ url: "https://media.agency.gov/lead.jpg", alt: "Students on campus" });
    expect(extractLeadImage(rssSource, `<meta property="og:image" content="javascript:bad()">`, "https://agency.gov/news/one", "Fallback")).toBeUndefined();
  });
});
