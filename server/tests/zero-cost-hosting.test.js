import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import Ajv from "ajv";
import { describe, expect, test } from "vitest";

const root = new URL("../../", import.meta.url);
const require = createRequire(import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));

function cspDirectives(config) {
  const rule = config.hosting.headers.find((entry) => entry.headers.some(({ key }) => key === "Content-Security-Policy"));
  const value = rule.headers.find(({ key }) => key === "Content-Security-Policy").value;
  return Object.fromEntries(value.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...sources] = part.split(/\s+/u);
    return [name, sources];
  }));
}

// Firebase Hosting header and rewrite rules use RE2; the patterns here use only syntax JavaScript shares with RE2.
function headersFor(config, path) {
  const matches = (rule) => rule.regex ? new RegExp(rule.regex, "u").test(path)
    : rule.source === "**" ? true
      : rule.source.endsWith("/**") ? path.startsWith(rule.source.slice(0, -2))
        : rule.source === path;
  return Object.fromEntries(config.hosting.headers.filter(matches).flatMap((rule) => rule.headers.map(({ key, value }) => [key.toLowerCase(), value])));
}

describe("Firebase Hosting configuration", () => {
  test("keeps the full-production firebase.json free of the zero-cost policy", async () => {
    const production = await readJson("firebase.json");
    expect(production.firestore.rules).toBe("firestore.rules");
    expect(production.storage.rules).toBe("storage.rules");
    // The production client calls its own API origin, so the static zero-cost CSP must never be applied to it.
    expect(JSON.stringify(production)).not.toMatch(/Content-Security-Policy/u);
  });

  test("zero-cost configuration is valid for the pinned Firebase CLI and has no Storage", async () => {
    const config = await readJson("firebase.zero-cost.json");
    const schema = require("firebase-tools/schema/firebase-config.json");
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
    expect(config.firestore.rules).toBe("firestore.zero-cost.rules");
    expect(config.storage).toBeUndefined();
    expect(config.hosting.public).toBe("client/dist");
  });

  test("the CSP allows Google sign-in, local PDF/OCR code, and HTTPS source-owned news images", async () => {
    const csp = cspDirectives(await readJson("firebase.zero-cost.json"));
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(expect.arrayContaining(["'self'", "'wasm-unsafe-eval'", "https://apis.google.com"]));
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(csp["script-src"]).not.toContain("'unsafe-inline'");
    expect(csp["worker-src"]).toEqual(["'self'"]);
    expect(csp["frame-src"]).toEqual(expect.arrayContaining(["https://*.firebaseapp.com", "https://accounts.google.com"]));
    expect(csp["connect-src"]).toEqual(expect.arrayContaining(["https://*.googleapis.com"]));
    expect(csp["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "https:"]));
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    const all = Object.values(csp).flat().join(" ");
    expect(all).not.toMatch(/jsdelivr|projectnaptha|unpkg/u);
  });

  test("HTML revalidates, hashed and OCR assets are immutable, and missing files are real 404s", async () => {
    const config = await readJson("firebase.zero-cost.json");
    for (const path of ["/", "/news", "/news/federal-register-2026-14439", "/index.html"]) {
      expect(headersFor(config, path)["cache-control"], path).toBe("no-cache");
    }
    expect(headersFor(config, "/assets/index-abc123.js")["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(headersFor(config, "/ocr/v7.0.0/worker.min.js")["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(headersFor(config, "/data/news.json")["cache-control"]).toBe("no-cache");
    for (const path of ["/", "/news", "/assets/index.js"]) {
      expect(headersFor(config, path)["x-content-type-options"]).toBe("nosniff");
      expect(headersFor(config, path)["content-security-policy"]).toBeTruthy();
    }
    const [rewrite] = config.hosting.rewrites;
    expect(rewrite.destination).toBe("/index.html");
    expect(new RegExp(rewrite.regex, "u").test("/news/federal-register-2026-14439")).toBe(true);
    expect(new RegExp(rewrite.regex, "u").test("/assets/missing-chunk.js")).toBe(false);
  });

  test("deployment is manual, preview-first, uses the zero-cost config, and never provisions or bills", async () => {
    const workflow = await readFile(new URL(".github/workflows/deploy-zero-cost.yml", root), "utf8");
    expect(workflow).toMatch(/workflow_dispatch:/u);
    expect(workflow).toMatch(/globeready-live/u);
    expect(workflow).toMatch(/action-hosting-deploy/u);
    expect(workflow.match(/cp firebase\.zero-cost\.json firebase\.json/gu)).toHaveLength(2);
    expect(workflow).not.toMatch(/firebase\s+(projects:create|use --add)|billing|gcloud\s+projects\s+create/iu);
    expect(workflow).not.toMatch(/^\s+push:/mu);
  });

  test("the service worker and manifest are always revalidated and never rewritten to the app shell", async () => {
    const config = await readJson("firebase.zero-cost.json");
    expect(headersFor(config, "/sw.js")["cache-control"]).toBe("no-cache");
    expect(headersFor(config, "/manifest.webmanifest")["cache-control"]).toBe("no-cache");
    expect(new RegExp(config.hosting.rewrites[0].regex, "u").test("/sw.js")).toBe(false);
    const csp = cspDirectives(config);
    expect(csp["worker-src"]).toEqual(["'self'"]);
    expect(csp["manifest-src"]).toEqual(["'self'"]);
  });
});
