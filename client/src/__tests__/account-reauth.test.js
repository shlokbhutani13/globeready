import { describe, expect, test, vi } from "vitest";
import { deleteAccountWithReauth } from "../lib/account-deletion";

const recentLogin = () => Object.assign(new Error("Sign out, sign back in, and try again."), { code: "recent_login_required" });

describe("account deletion reauthentication", () => {
  test("removes the account directly when the sign-in is recent", async () => {
    const removeAccount = vi.fn(async () => ({ deleted: true }));
    const reauthenticateGoogle = vi.fn();
    await deleteAccountWithReauth({ removeAccount, hasGoogleProvider: () => true, reauthenticateGoogle });
    expect(removeAccount).toHaveBeenCalledTimes(1);
    expect(reauthenticateGoogle).not.toHaveBeenCalled();
  });

  test("refreshes a Google sign-in and then retries the deletion once", async () => {
    const removeAccount = vi.fn().mockRejectedValueOnce(recentLogin()).mockResolvedValueOnce({ deleted: true });
    const reauthenticateGoogle = vi.fn(async () => {});
    await deleteAccountWithReauth({ removeAccount, hasGoogleProvider: () => true, reauthenticateGoogle });
    expect(reauthenticateGoogle).toHaveBeenCalledTimes(1);
    expect(removeAccount).toHaveBeenCalledTimes(2);
  });

  test("does not try a Google popup for an email-only account; the student is told to sign in again", async () => {
    const removeAccount = vi.fn().mockRejectedValue(recentLogin());
    const reauthenticateGoogle = vi.fn();
    await expect(deleteAccountWithReauth({ removeAccount, hasGoogleProvider: () => false, reauthenticateGoogle }))
      .rejects.toThrow(/sign back in/);
    expect(reauthenticateGoogle).not.toHaveBeenCalled();
    expect(removeAccount).toHaveBeenCalledTimes(1);
  });

  test("passes other failures through without reauthenticating", async () => {
    const removeAccount = vi.fn().mockRejectedValue(Object.assign(new Error("Server error"), { code: "internal_error" }));
    const reauthenticateGoogle = vi.fn();
    await expect(deleteAccountWithReauth({ removeAccount, hasGoogleProvider: () => true, reauthenticateGoogle }))
      .rejects.toThrow("Server error");
    expect(reauthenticateGoogle).not.toHaveBeenCalled();
  });
});
