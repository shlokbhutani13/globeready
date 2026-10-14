import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

let output;
let files;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);
}

describe("zero-cost production artifact", () => {
  beforeAll(() => {
    output = mkdtempSync(join(tmpdir(), "globeready-zero-cost-"));
    execFileSync(process.execPath, [resolve("node_modules/vite/bin/vite.js"), "build", "--mode", "zero-cost-public", "--outDir", output], { cwd: resolve("."), stdio: "pipe" });
    files = walk(output);
  }, 30_000);
  afterAll(() => rmSync(output, { recursive: true, force: true }));

  test("contains no secrets, source maps, API origins, or GlobeReady emulator endpoints", () => {
    const text = files.filter((file) => /\.(?:html|js|mjs|css|json)$/u.test(file)).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(files.map((file) => relative(output, file)).some((file) => file.endsWith(".map"))).toBe(false);
    expect(text).not.toMatch(/-----BEGIN (?:RSA |EC |)PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,}/u);
    expect(text).not.toMatch(/127\.0\.0\.1:(?:5051|8089|9099|9199)|localhost:(?:5051|8089|9099|9199)/u);
  });

  test("keeps the app within five megabytes and publishes only the expected self-hosted OCR files", () => {
    const app = files.filter((file) => !relative(output, file).startsWith("ocr/"));
    const ocr = files.filter((file) => relative(output, file).startsWith("ocr/"));
    expect(app.reduce((total, file) => total + statSync(file).size, 0)).toBeLessThan(5 * 1024 * 1024);
    expect(ocr.map((file) => relative(output, file).replace(/^ocr\/[a-f0-9]{16}\//u, "")).sort()).toEqual([
      "eng.traineddata.gz", "tesseract-core-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js",
      "tesseract-core-simd-lstm.wasm.js", "worker.min.js",
    ]);
    expect(ocr.reduce((total, file) => total + statSync(file).size, 0)).toBeLessThan(16 * 1024 * 1024);
  });

  test("the app's OCR configuration points at the published folder, not a CDN", () => {
    const folder = new Set(files.map((file) => relative(output, file)).filter((file) => file.startsWith("ocr/")).map((file) => file.split("/")[1]));
    expect(folder.size).toBe(1);
    const app = files.filter((file) => /assets\/.*\.js$/u.test(relative(output, file))).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(app).toContain(`/ocr/${[...folder][0]}`);
  });

  test("real environment files are ignored and the example says where to copy it", () => {
    const ignore = readFileSync(resolve("../.gitignore"), "utf8").split("\n");
    expect(ignore).toEqual(expect.arrayContaining([".env.*.local", ".env.zero-cost-public", ".env.production"]));
    expect(readFileSync(resolve(".env.zero-cost-public.example"), "utf8")).toMatch(/\.env\.zero-cost-public\.local, which Git ignores/u);
  });
});
