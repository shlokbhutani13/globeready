import { describe, expect, test } from "vitest";

import { validateNewsImage } from "../src/news/image-policy.js";

const source = {
  allowedHosts: ["www.uscis.gov", "media.uscis.gov"],
};

describe("news image policy", () => {
  test("accepts bounded image metadata from an allowlisted official host", () => {
    expect(validateNewsImage({
      url: "https://media.uscis.gov/news/update.jpg",
      alt: "USCIS press briefing",
      sourceUrl: "https://www.uscis.gov/news/update",
      attribution: "USCIS",
      contentType: "image/jpeg",
    }, source)).toEqual({
      url: "https://media.uscis.gov/news/update.jpg",
      alt: "USCIS press briefing",
      sourceUrl: "https://www.uscis.gov/news/update",
      attribution: "USCIS",
    });
  });

  test.each([
    ["HTTP", { url: "http://media.uscis.gov/a.jpg", alt: "a" }],
    ["credentials", { url: "https://user@media.uscis.gov/a.jpg", alt: "a" }],
    ["fragment", { url: "https://media.uscis.gov/a.jpg#x", alt: "a" }],
    ["private host", { url: "https://127.0.0.1/a.jpg", alt: "a" }],
    ["unapproved host", { url: "https://attacker.example/a.jpg", alt: "a" }],
    ["unsupported type", { url: "https://media.uscis.gov/a.svg", alt: "a", contentType: "text/html" }],
    ["missing alt", { url: "https://media.uscis.gov/a.jpg", alt: "" }],
    ["oversized field", { url: "https://media.uscis.gov/a.jpg", alt: "a".repeat(301) }],
  ])("rejects %s image metadata", (_label, candidate) => {
    expect(validateNewsImage(candidate, source)).toBeNull();
  });
});
