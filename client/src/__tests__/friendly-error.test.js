import { expect, test } from "vitest";
import { friendlyError } from "../lib/friendly-error";

test("maps quota, permission and network failures to actionable text", () => {
  expect(friendlyError({ code: "resource-exhausted" })).toMatch(/daily usage limit/);
  expect(friendlyError({ code: "permission-denied", message: "Missing or insufficient permissions." })).toMatch(/Verify your email/);
  expect(friendlyError({ code: "auth/network-request-failed" })).toMatch(/internet connection/);
  expect(friendlyError({ code: "auth/requires-recent-login" })).toMatch(/sign in again/i);
});

test("keeps unknown messages and supplies a fallback", () => {
  expect(friendlyError(new Error("Pick a smaller file."))).toBe("Pick a smaller file.");
  expect(friendlyError({}, "Fallback")).toBe("Fallback");
});
