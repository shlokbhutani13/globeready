import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { newsImageFor, sourceImage } from "../lib/news-images";

describe("source-specific news artwork", () => {
  test("gives every configured source a distinct bundled fallback", () => {
    const registry = JSON.parse(readFileSync(resolve(process.cwd(), "../config/news-sources.json"), "utf8"));
    const ids = registry.sources.map(({ id }) => id);
    const images = ids.map((sourceId) => sourceImage(sourceId));
    expect(images.every(Boolean)).toBe(true);
    expect(new Set(images).size).toBe(ids.length);
  });

  test("prefers the source fallback for automatic stories without an approved remote image", () => {
    const image = newsImageFor({ autoIngested: true, sourceId: "uscis-news", topics: ["employment"] });
    expect(image.url).toBe(sourceImage("uscis-news"));
    expect(image.alt).toMatch(/USCIS source illustration/i);
    expect(image.credit).toMatch(/GlobeReady/i);
  });

  test("keeps reviewed stories on topic artwork and remote source images on their source fallback", () => {
    expect(newsImageFor({ sourceId: "uscis-news", topics: ["employment"] }).url).not.toBe(sourceImage("uscis-news"));
    expect(newsImageFor({ autoIngested: true, sourceId: "mit-iso", topics: ["university"], image: { url: "https://iso.mit.edu/photo.jpg", alt: "Students" } }).fallbackUrl)
      .toBe(sourceImage("mit-iso"));
  });
});
