import { expect, test } from "vitest";
import { renderDigestEmail } from "../src/email/render-digest.js";

test("renders escaped text, safe official links, and no tracking content", () => {
  const rendered = renderDigestEmail({
    frequency: "weekly", unsubscribeUrl: "https://globeready.example/unsubscribe",
    sections: [{ title: "Urgent <updates>", items: [
      { title: "Visa & status", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/1" },
      { title: "Unsafe", publisher: "Unknown", canonicalUrl: "http://example.com/a" },
    ] }],
  });
  expect(rendered.subject).toMatch(/weekly/i);
  expect(rendered.html).toContain("Urgent &lt;updates&gt;");
  expect(rendered.html).toContain("https://www.uscis.gov/news/1");
  expect(rendered.html).not.toContain("http://example.com/a");
  expect(rendered.html).not.toMatch(/<img|tracking/i);
  expect(rendered.text).toMatch(/unsubscribe/i);
});
