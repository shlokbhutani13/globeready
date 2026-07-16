import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(process.cwd(), "..");

describe("Firebase ownership rules", () => {
  test("Firestore rules require the authenticated uid", async () => {
    const rules = await readFile(resolve(root, "firestore.rules"), "utf8");
    expect(rules).toContain("request.auth.uid == uid");
  });

  test("Storage rules require the authenticated uid", async () => {
    const rules = await readFile(resolve(root, "storage.rules"), "utf8");
    expect(rules).toContain("request.auth.uid == uid");
    expect(rules).toContain("10 * 1024 * 1024");
  });
});
