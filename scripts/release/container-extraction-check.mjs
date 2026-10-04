// Runs inside the production image, with the network disabled and the fixtures mounted read-only. It exercises the
// same extraction code the API uses (real PDF parsing and local OCR, with no injected parser or recognizer) and
// fails if any expected outcome differs.
//
// node container-extraction-check.mjs <srcDir> <fixtureDir>
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [srcDir, fixtureDir] = process.argv.slice(2);
if (!srcDir || !fixtureDir) {
  console.error("usage: container-extraction-check.mjs <srcDir> <fixtureDir>");
  process.exit(2);
}

const extraction = await import(pathToFileURL(join(srcDir, "document-extraction.js")).href);
const ocrModule = await import(pathToFileURL(join(srcDir, "ocr.js")).href);
const ocr = ocrModule.createLocalOcr();

const cases = [
  { file: "multipage.pdf", mime: "application/pdf", expect: "ok", check: (r) => r.pages.length >= 1 && r.pages.every((p) => Number.isInteger(p.page)) },
  { file: "malformed.pdf", mime: "application/pdf", expect: "pdf_unreadable" },
  { file: "blank.pdf", mime: "application/pdf", expect: "no_readable_text" },
  { file: "scanned.pdf", mime: "application/pdf", expect: "no_readable_text" },
  { file: "passport.png", mime: "image/png", expect: "ok", useOcr: true, check: (r) => /PASSPORT|X1234567/i.test(r.text) },
  { file: "passport.jpg", mime: "image/jpeg", expect: "ok", useOcr: true, check: (r) => /PASSPORT|X1234567/i.test(r.text) },
  { file: "passport.png", mime: "application/pdf", expect: "file_type_mismatch" },
];

const report = [];
let failed = 0;
for (const testCase of cases) {
  const bytes = new Uint8Array(await readFile(join(fixtureDir, testCase.file)));
  const started = Date.now();
  let outcome;
  try {
    const result = await extraction.extractDocument({ bytes, mimeType: testCase.mime, ocr: testCase.useOcr ? ocr : null });
    outcome = { code: "ok", pages: result.pages.length, check: testCase.check ? testCase.check(result) : true };
    outcome.ok = testCase.expect === "ok" && outcome.check;
  } catch (error) {
    outcome = { code: error.code || "error", message: error.safeMessage ? undefined : "unexpected", ok: error.code === testCase.expect };
  }
  const ms = Date.now() - started;
  if (!outcome.ok) failed += 1;
  report.push({ file: testCase.file, mime: testCase.mime, expected: testCase.expect, got: outcome.code, pages: outcome.pages, ms, ok: outcome.ok });
}
await ocr.shutdown?.();
console.log(JSON.stringify({ results: report, failed }, null, 2));
process.exit(failed ? 1 : 0);
