import { describe, expect, test } from "vitest";

import { buildStorageCorsConfig, CorsRefusal } from "../../scripts/release/storage-cors.mjs";

describe("storage CORS policy for browser uploads", () => {
  test("allows the client origin with the methods and headers resumable uploads need", () => {
    const [rule] = buildStorageCorsConfig(["https://app.globeready-prod.test"]);
    expect(rule.origin).toEqual(["https://app.globeready-prod.test"]);
    expect(rule.method).toEqual(expect.arrayContaining(["PUT", "POST"]));
    expect(rule.responseHeader).toEqual(expect.arrayContaining(["Content-Type", "x-goog-resumable"]));
    expect(rule.maxAgeSeconds).toBe(3600);
  });

  test("refuses wildcards, plain http, paths, credentials, and too many origins", () => {
    expect(() => buildStorageCorsConfig(["*"])).toThrow(CorsRefusal);
    expect(() => buildStorageCorsConfig(["http://app.globeready-prod.test"])).toThrow(/https/);
    expect(() => buildStorageCorsConfig(["https://app.globeready-prod.test/path"])).toThrow(/no path/);
    expect(() => buildStorageCorsConfig(["https://u:p@app.globeready-prod.test"])).toThrow(/credentials/);
    expect(() => buildStorageCorsConfig([])).toThrow(/one to five/);
    expect(() => buildStorageCorsConfig(Array.from({ length: 6 }, (_, i) => `https://a${i}.globeready-prod.test`))).toThrow(/one to five/);
  });

  test("duplicate origins collapse to one entry", () => {
    const [rule] = buildStorageCorsConfig(["https://app.globeready-prod.test", "https://app.globeready-prod.test/"]);
    expect(rule.origin).toEqual(["https://app.globeready-prod.test"]);
  });
});
