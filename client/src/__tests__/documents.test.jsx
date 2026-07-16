import { describe, expect, test } from "vitest";

import { validateDocument } from "../pages/DocumentsPage";

describe("document validation", () => {
  test("rejects unsupported file types", () => {
    const file = new File(["bad"], "script.exe", { type: "application/octet-stream" });
    expect(validateDocument(file)).toMatch(/PDF, PNG, or JPEG/i);
  });

  test("accepts a small PDF", () => {
    const file = new File(["passport"], "passport.pdf", { type: "application/pdf" });
    expect(validateDocument(file)).toBe("");
  });
});
