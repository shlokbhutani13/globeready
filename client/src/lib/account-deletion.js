export async function deleteAccountWithReauth({ removeAccount, hasGoogleProvider, reauthenticateGoogle }) {
  try {
    return await removeAccount();
  } catch (error) {
    if (error?.code !== "recent_login_required" || !hasGoogleProvider()) throw error;
    await reauthenticateGoogle();
    return removeAccount();
  }
}
