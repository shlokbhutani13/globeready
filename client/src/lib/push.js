// Opt-in web push for the free beta. A reminder can only arrive while the app is closed if this device's push address
// (an FCM token) is saved in the student's own account, so enabling saves one small record and disabling deletes it.
// Nothing is saved unless the student turns this on, and the notification text never contains document contents.
import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";

export const vapidKey = () => String(import.meta.env.VITE_FCM_VAPID_KEY || "").trim();
export const pushConfigured = () => /^[A-Za-z0-9_-]{60,120}$/.test(vapidKey());

// Stable, URL-safe document id for a token, so enabling twice on one device does not create two records.
export async function tokenId(token, subtle = globalThis.crypto?.subtle) {
  const bytes = new TextEncoder().encode(String(token));
  const digest = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

export function pushState({ configured = pushConfigured(), notificationImpl = globalThis.Notification, serviceWorker = globalThis.navigator?.serviceWorker, standaloneRequired = false } = {}) {
  if (!configured) return { status: "unconfigured", message: "Push reminders are not set up for this site yet." };
  if (!notificationImpl || !serviceWorker) return { status: "unsupported", message: "This browser cannot receive push reminders." };
  if (standaloneRequired) return { status: "install", message: "On iPhone and iPad, add GlobeReady to your Home Screen first, then open it from there to turn on push reminders." };
  if (notificationImpl.permission === "denied") return { status: "blocked", message: "Notifications are blocked for this site in your browser settings. Allow them there, then come back." };
  return { status: "ready", message: "" };
}

// iOS only delivers web push to an installed app.
export function needsHomeScreen({ userAgent = globalThis.navigator?.userAgent || "", standalone = globalThis.navigator?.standalone === true || globalThis.matchMedia?.("(display-mode: standalone)")?.matches === true } = {}) {
  return /iPad|iPhone|iPod/.test(userAgent) && !standalone;
}

export async function enablePush({ firestore, uid, app, sdk = {}, notificationImpl = globalThis.Notification, serviceWorker = globalThis.navigator?.serviceWorker, userAgentLabel = "browser" } = {}) {
  const key = vapidKey();
  if (!pushConfigured()) throw new Error("Push reminders are not set up for this site yet.");
  if (!firestore || !uid) throw new Error("Sign in first.");
  const supported = sdk.isSupported ? await sdk.isSupported() : await isSupported();
  if (!supported) throw new Error("This browser cannot receive push reminders.");
  const permission = await notificationImpl.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed, so push reminders stay off.");
  const registration = await serviceWorker.ready;
  const messaging = (sdk.getMessaging || getMessaging)(app);
  const token = await (sdk.getToken || getToken)(messaging, { vapidKey: key, serviceWorkerRegistration: registration });
  if (!token) throw new Error("The browser did not give GlobeReady a push address. Try again.");
  const id = await tokenId(token);
  await (sdk.setDoc || setDoc)((sdk.doc || doc)(firestore, "users", uid, "pushTokens", id), {
    token, device: String(userAgentLabel).slice(0, 60), createdAt: (sdk.serverTimestamp || serverTimestamp)(),
  });
  return { id, token };
}

export async function disablePush({ firestore, uid, app, sdk = {}, token = "" } = {}) {
  if (!firestore || !uid) throw new Error("Sign in first.");
  if (token) {
    const id = await tokenId(token);
    await (sdk.deleteDoc || deleteDoc)((sdk.doc || doc)(firestore, "users", uid, "pushTokens", id));
  }
  try { await (sdk.deleteToken || deleteToken)((sdk.getMessaging || getMessaging)(app)); } catch { /* already gone */ }
  return true;
}
