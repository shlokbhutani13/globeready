// Turns Firebase and network failures into messages a student can act on. Unknown errors keep their own message.
const byCode = {
  "permission-denied": "GlobeReady could not save this. Verify your email address, check that document reading is on if you are saving document text, then try again. If it keeps failing, sign out and back in.",
  "resource-exhausted": "The free beta has reached its daily usage limit. Your saved data is safe. Please try again tomorrow.",
  "quota-exceeded": "The free beta has reached its daily usage limit. Your saved data is safe. Please try again tomorrow.",
  unavailable: "GlobeReady could not reach its servers. Check your internet connection and try again.",
  "deadline-exceeded": "The request took too long. Check your internet connection and try again.",
  "network-request-failed": "GlobeReady could not reach its servers. Check your internet connection and try again.",
  unauthenticated: "Your sign-in has expired. Sign in again to continue.",
  "requires-recent-login": "For your security, sign in again and retry.",
  "invalid-credential": "That email and password do not match. Check them, or use Reset password.",
  "wrong-password": "That email and password do not match. Check them, or use Reset password.",
  "user-not-found": "That email and password do not match. Check them, or use Reset password.",
  "email-already-in-use": "An account with this email already exists. Sign in instead, or use Reset password.",
  "weak-password": "Choose a password with at least 6 characters.",
  "invalid-email": "Enter a valid email address.",
  "user-disabled": "This account has been disabled.",
  "popup-closed-by-user": "The Google sign-in window was closed before finishing. Try again.",
  "cancelled-popup-request": "The Google sign-in window was closed before finishing. Try again.",
  "popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "unauthorized-domain": "Sign-in is not enabled for this web address yet.",
  "too-many-requests": "Too many attempts. Wait a few minutes and try again.",
};

export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  const code = String(error?.code || "").replace(/^(auth|firestore)\//, "");
  if (byCode[code]) return byCode[code];
  if (typeof navigator !== "undefined" && navigator.onLine === false) return byCode.unavailable;
  return error?.message || fallback;
}
