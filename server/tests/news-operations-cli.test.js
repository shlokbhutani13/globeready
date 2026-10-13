import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";

test("CLI help is credential-free and documents safe defaults", () => {
  const output = execFileSync(process.execPath, ["scripts/news-operations.mjs", "--help"], {
    cwd: process.cwd(), encoding: "utf8", env: {},
  });
  expect(output).toMatch(/--dry-run/);
  expect(output).toMatch(/--source/);
  expect(output).toMatch(/--limit/);
  expect(output).toMatch(/dry run by default/i);
});
