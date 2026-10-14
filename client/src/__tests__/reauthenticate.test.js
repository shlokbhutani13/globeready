import { describe, expect, test, vi } from "vitest";
import { reauthenticateForDeletion } from "../lib/reauthenticate";

function sdk() {
  return {
    EmailAuthProvider: { credential: vi.fn((email, password) => ({ email, password })) },
    GoogleAuthProvider: vi.fn(function GoogleAuthProvider() { this.id = "google"; }),
    reauthenticateWithCredential: vi.fn(async () => "password-ok"),
    reauthenticateWithPopup: vi.fn(async () => "google-ok"),
  };
}
const user = (...providers) => ({ email: "maya@example.edu", providerData: providers.map((providerId) => ({ providerId })) });

describe("identity confirmation before deletion", () => {
  test("password accounts confirm with the typed password", async () => {
    const auth = sdk();
    await expect(reauthenticateForDeletion({ user: user("password"), password: "secret-pass", sdk: auth })).resolves.toBe("password-ok");
    expect(auth.EmailAuthProvider.credential).toHaveBeenCalledWith("maya@example.edu", "secret-pass");
    expect(auth.reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  test("password accounts must type a password", async () => {
    await expect(reauthenticateForDeletion({ user: user("password"), sdk: sdk() })).rejects.toThrow(/enter your current password/i);
  });

  test("Google accounts confirm with a Google pop-up", async () => {
    const auth = sdk();
    await expect(reauthenticateForDeletion({ user: user("google.com"), sdk: auth })).resolves.toBe("google-ok");
  });

  test("explains wrong passwords and blocked pop-ups, and says nothing was deleted", async () => {
    const wrong = sdk();
    wrong.reauthenticateWithCredential.mockRejectedValue(Object.assign(new Error("bad"), { code: "auth/invalid-credential" }));
    await expect(reauthenticateForDeletion({ user: user("password"), password: "x", sdk: wrong })).rejects.toThrow(/incorrect.*nothing was deleted/i);
    const blocked = sdk();
    blocked.reauthenticateWithPopup.mockRejectedValue(Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }));
    await expect(reauthenticateForDeletion({ user: user("google.com"), sdk: blocked })).rejects.toThrow(/allow pop-ups/i);
  });
});
