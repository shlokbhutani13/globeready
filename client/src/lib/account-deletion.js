export async function deleteAccountWithReauth({ removeAccount, hasGoogleProvider, reauthenticateGoogle }) {
  try {
    return await removeAccount();
  } catch (error) {
    const recentLoginRequired = error?.code === "recent_login_required" || error?.code === "auth/requires-recent-login";
    if (!recentLoginRequired) throw error;
    if (!hasGoogleProvider()) {
      if (error?.code === "recent_login_required") throw error;
      throw Object.assign(new Error("Sign out, sign back in, and try deleting your account again."), { code: "recent_login_required" });
    }
    try {
      await reauthenticateGoogle();
    } catch {
      throw new Error("Confirm your Google sign-in in the pop-up window, then try deleting your account again.");
    }
    return removeAccount();
  }
}
