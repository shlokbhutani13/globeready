import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from "firebase/auth";

const defaultSdk = { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup };

export function signInProviders(user) {
  return (user?.providerData || []).map((provider) => provider.providerId);
}

function friendly(error) {
  const messages = {
    "auth/wrong-password": "That password is incorrect. Nothing was deleted.",
    "auth/invalid-credential": "That password is incorrect. Nothing was deleted.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again. Nothing was deleted.",
    "auth/popup-blocked": "Your browser blocked the Google confirmation window. Allow pop-ups for this site and try again. Nothing was deleted.",
    "auth/popup-closed-by-user": "Google confirmation was closed before it finished. Nothing was deleted.",
    "auth/cancelled-popup-request": "Google confirmation was closed before it finished. Nothing was deleted.",
    "auth/user-mismatch": "Confirm with the same Google account you are signed in with. Nothing was deleted.",
  };
  return Object.assign(new Error(messages[error?.code] || `Your identity could not be confirmed (${error?.message || "unknown error"}). Nothing was deleted.`), { code: error?.code, cause: error });
}

// Confirms the signed-in student's identity immediately before account deletion. Password accounts use the password
// typed into the deletion form; Google accounts use a Google pop-up, opened directly from the click.
export async function reauthenticateForDeletion({ user, password = "", sdk = defaultSdk }) {
  if (!user) throw new Error("Sign in again to delete your account.");
  const providers = signInProviders(user);
  try {
    if (providers.includes("password") && password) {
      return await sdk.reauthenticateWithCredential(user, sdk.EmailAuthProvider.credential(user.email, password));
    }
    if (providers.includes("google.com")) return await sdk.reauthenticateWithPopup(user, new sdk.GoogleAuthProvider());
  } catch (error) {
    throw friendly(error);
  }
  if (providers.includes("password")) throw new Error("Enter your current password to confirm. Nothing was deleted.");
  throw new Error("This sign-in method cannot be confirmed here. Sign out, sign back in, and try again.");
}
