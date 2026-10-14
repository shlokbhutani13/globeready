import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

const root = new URL("../../", import.meta.url);

describe("zero-cost static hosting contract", () => {
  test("uses an SPA rewrite and hardened browser headers", async () => {
    const config = JSON.parse(await readFile(new URL("firebase.json", root), "utf8"));
    expect(config.hosting.public).toBe("client/dist");
    expect(config.hosting.rewrites).toContainEqual({ source: "**", destination: "/index.html" });
    const headers = Object.fromEntries(config.hosting.headers.flatMap((rule) => rule.headers.map(({ key, value }) => [key.toLowerCase(), value])));
    expect(headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(headers["content-security-policy"]).toMatch(/frame-ancestors 'none'/);
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBeTruthy();
    expect(headers["permissions-policy"]).toMatch(/camera=\(\)/);
  });

  test("deployment is manual, preview-first, and contains no provisioning or billing commands", async () => {
    const workflow = await readFile(new URL(".github/workflows/deploy-zero-cost.yml", root), "utf8");
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/globeready-live/);
    expect(workflow).toMatch(/hosting:channel:deploy|action-hosting-deploy/);
    expect(workflow).toMatch(/VITE_FIREBASE_PROJECT_ID/);
    expect(workflow).not.toMatch(/firebase\s+(projects:create|use --add)|billing|gcloud\s+projects\s+create/i);
    expect(workflow).not.toMatch(/^\s+push:/m);
  });
});
