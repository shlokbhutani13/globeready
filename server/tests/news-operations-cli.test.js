import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

test("CLI help is credential-free and documents safe defaults", () => {
  const output = execFileSync(process.execPath, ["scripts/news-operations.mjs", "--help"], {
    cwd: process.cwd(), encoding: "utf8", env: {},
  });
  expect(output).toMatch(/--dry-run/);
  expect(output).toMatch(/--source/);
  expect(output).toMatch(/--limit/);
  expect(output).toMatch(/dry run by default/i);
  expect(output).toMatch(/--decision=(approve|reject|defer|correct|archive)/i);
  expect(output).toMatch(/--candidate-file/);
});

test("CLI previews an explicit review decision without credentials or writes", () => {
  const directory = mkdtempSync(join(tmpdir(), "globeready-review-cli-"));
  const candidateFile = join(directory, "candidate.json");
  writeFileSync(candidateFile, JSON.stringify({ id: `review-candidate:${"a".repeat(64)}` }));
  const output = execFileSync(process.execPath, ["scripts/news-operations.mjs", `--candidate-file=${candidateFile}`, "--decision=reject"], {
    cwd: process.cwd(), encoding: "utf8", env: {},
  });
  expect(JSON.parse(output)).toMatchObject({ dryRun: true, mode: "credential-free", reviewDecision: { candidateId: `review-candidate:${"a".repeat(64)}`, type: "reject" } });
});
