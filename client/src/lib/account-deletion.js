export async function deleteAccountWithReauth({ removeAccount, hasGoogleProvider, reauthenticateGoogle }) {
  try {
    return await removeAccount();
  } catch (error) {
    if (error?.code !== "recent_login_required" || !hasGoogleProvider()) throw error;
    try {
      await reauthenticateGoogle();
    } catch {
      throw new Error("Confirm your Google sign-in in the pop-up window, then try deleting your account again.");
    }
    return removeAccount();
  }
}
