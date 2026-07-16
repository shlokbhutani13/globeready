import { describe, expect, test } from "vitest";

import { documentStoragePath, sanitizeFilename } from "../lib/student-data";

describe("Firebase document paths", () => {
  test("keeps uploads inside the authenticated user's directory", () => {
    expect(documentStoragePath("user-123", "doc-456", "../../passport copy.pdf"))
      .toBe("users/user-123/documents/doc-456/passport_copy.pdf");
  });

  test("removes unsupported filename characters", () => {
    expect(sanitizeFilename("visa (final)#1.png")).toBe("visa_final_1.png");
  });
});
