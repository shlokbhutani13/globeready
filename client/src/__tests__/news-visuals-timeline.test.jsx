import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { imageCredit, newsImageFor, topicImage } from "../lib/news-images";
import { relatedUpdates, updateTimeline } from "../lib/news-timeline";
import UpdateTimeline from "../components/UpdateTimeline";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

afterEach(cleanup);

describe("news illustrations", () => {
  it("picks a specific illustration for every topic the profile and feed use, and the general one otherwise", () => {
    const topics = ["status", "employment", "travel-entry", "forms-fees", "taxes-social-security", "campus-life", "emergency", "university"];
    const urls = topics.map((topic) => topicImage(topic));
    expect(urls.every(Boolean)).toBe(true);
    expect(new Set(urls).size).toBe(topics.length);
    expect(topicImage("travel")).toBe(topicImage("travel-entry"));
    expect(topicImage("taxes")).toBe(topicImage("taxes-social-security"));
    expect(topicImage("nothing")).toBeNull();
    const general = newsImageFor({}).url;
    expect(newsImageFor({ topics: ["unknown"] }).url).toBe(general);
  });
  it("uses the first topic that has an illustration, and says it is not an official image", () => {
    const image = newsImageFor({ topics: ["unknown", "status", "travel"] });
    expect(image.url).toBe(topicImage("status"));
    expect(image.alt).toBe("status illustration");
    expect(image.credit).toBe(imageCredit);
    expect(imageCredit).toMatch(/not an official image/u);
  });
  it("accepts a story's own picture only when it is served from this site", () => {
    expect(newsImageFor({ image: { url: "/images/story.png", alt: "A map" }, topics: ["status"] }).url).toBe("/images/story.png");
    expect(newsImageFor({ image: { url: "https://cdn.example.com/x.jpg", alt: "x" }, topics: ["status"] }).url).toBe(topicImage("status"));
    expect(newsImageFor({ image: { url: "//cdn.example.com/x.jpg", alt: "x" }, topics: ["status"] }).url).toBe(topicImage("status"));
    expect(newsImageFor({ image: { url: "/images/story.png" }, topics: ["status"] }).url).toBe(topicImage("status"));
  });
  it("uses safe source images only for automatically ingested stories and supplies a local fallback", () => {
    const automatic = newsImageFor({ autoIngested: true, image: { url: "https://www.uscis.gov/story.jpg", alt: "Official story" }, topics: ["status"] });
    expect(automatic).toMatchObject({ url: "https://www.uscis.gov/story.jpg", alt: "Official story", remote: true, fallbackUrl: topicImage("status") });
    expect(newsImageFor({ autoIngested: true, image: { url: "javascript:alert(1)", alt: "Bad" }, topics: ["status"] }).url).toBe(topicImage("status"));
  });
  it("ships only original, self-contained SVG drawings with no outside references or embedded photos", () => {
    const dir = join(process.cwd(), "src", "assets", "news");
    const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
    expect(files.length).toBeGreaterThanOrEqual(9);
    for (const file of files) {
      const svg = readFileSync(join(dir, file), "utf8").replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, "");
      expect(svg, file).toMatch(/aria-label="[^"]+"/u);
      expect(svg, file).not.toMatch(/https?:|<image|<script|xlink:href|<foreignObject|data:/iu);
    }
  });
});

const story = { id: "a", title: "Final rule", publishedAt: "2026-07-17", effectiveAt: "2026-09-15", docketNumber: "D-1", topics: ["status", "travel"], visaTypes: ["f-1"] };
describe("related updates and timelines", () => {
  const items = [
    story,
    { id: "b", title: "Correction notice", publishedAt: "2026-08-01", docketNumber: "D-1", topics: [] },
    { id: "c", title: "Guidance", publishedAt: "2026-08-20", topics: ["status", "travel"], visaTypes: ["f-1"] },
    { id: "d", title: "Unrelated", publishedAt: "2026-08-21", topics: ["status"], visaTypes: ["f-1"] },
    { id: "e", title: "Wrong visa", publishedAt: "2026-08-22", topics: ["status", "travel"], visaTypes: ["j-1"] },
    { id: "f", title: "Linked by feed", publishedAt: "2026-09-02", relatedIds: ["a"], topics: [] },
  ];
  it("relates by docket, explicit link, or two shared topics with a shared visa type, newest first", () => {
    expect(relatedUpdates(story, items).map((item) => item.id)).toEqual(["f", "c", "b"]);
    expect(relatedUpdates(null, items)).toEqual([]);
  });
  it("orders published and effective dates of this and related updates, current one marked", () => {
    const events = updateTimeline(story, items, []);
    expect(events.map((event) => `${event.date} ${event.kind}`)).toEqual([
      "2026-07-17 published", "2026-08-01 published", "2026-08-20 published", "2026-09-02 published", "2026-09-15 effective",
    ]);
    expect(events[0]).toMatchObject({ current: true, to: "" });
    expect(events[1].to).toBe("/news/b");
  });
  it("adds the rule change the library records for this update", () => {
    const events = updateTimeline({ id: "federal-register-2026-14439", title: "Fixed periods", publishedAt: "2026-07-17", effectiveAt: "2026-09-15" }, []);
    expect(events.map((event) => event.kind)).toEqual(["published", "effective", "rule"]);
    expect(events[2].label).toContain("Duration-of-status admission");
    expect(events[2].to).toBe("/rules");
  });
  it("renders nothing for a single event, and an ordered named list otherwise", () => {
    const { container, rerender } = render(<MemoryRouter><UpdateTimeline events={[{ date: "2026-07-17", kind: "published", label: "Published", current: true }]} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
    rerender(<MemoryRouter><UpdateTimeline events={updateTimeline(story, items, [])} /></MemoryRouter>);
    const list = screen.getByRole("list", { name: /Timeline of this update/u });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    expect(within(rows[0]).getByText("Published")).toBeTruthy();
    expect(within(rows[4]).getByText("Effective date")).toBeTruthy();
    expect(within(rows[1]).getByRole("link", { name: "Correction notice" }).getAttribute("href")).toBe("/news/b");
  });
});
