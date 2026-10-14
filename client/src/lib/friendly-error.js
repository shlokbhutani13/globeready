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
  "too-many-requests": "Too many attempts. Wait a few minutes and try again.",
};

export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  const code = String(error?.code || "").replace(/^(auth|firestore)\//, "");
  if (byCode[code]) return byCode[code];
  if (typeof navigator !== "undefined" && navigator.onLine === false) return byCode.unavailable;
  return error?.message || fallback;
}
