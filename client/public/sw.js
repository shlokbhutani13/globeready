/* GlobeReady service worker (free public beta).
   It keeps public, non-personal files so the app can open offline: the app shell, built code, the reviewed news and
   coverage files, and icons. It never stores anything from Firebase, Google sign-in, or the student's account, and it
   never caches document text or OCR files. Saving changes always needs a connection; nothing is queued offline. */
const VERSION = "v1";
const SHELL = `globeready-shell-${VERSION}`;
const ASSETS = `globeready-assets-${VERSION}`;
const DATA = `globeready-data-${VERSION}`;
const KNOWN = [SHELL, ASSETS, DATA];
const MAX_ASSETS = 120;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("globeready-") && !KNOWN.includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackKey || request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackKey || request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) { await cache.put(request, response.clone()); if (max) trim(cacheName, max); }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Only this site's own public files. Firebase, Firestore and Google sign-in are other origins, and /__/ is the auth helper.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/__/") || url.pathname.startsWith("/ocr/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL, "/index.html"));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS, MAX_ASSETS));
  } else if (url.pathname.startsWith("/data/")) {
    event.respondWith(networkFirst(request, DATA));
  } else if (url.pathname.startsWith("/icons/") || url.pathname === "/favicon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request, SHELL));
  }
});

// Push reminders (opt-in). The payload is a short title and body written by GlobeReady's reminder job; it never
// contains document text. Tapping a notification opens the app.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const data = payload.data || payload;
  const title = String(data.title || "GlobeReady reminder").slice(0, 120);
  const body = String(data.body || "Open GlobeReady to see what is coming up.").slice(0, 240);
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", tag: String(data.tag || "globeready-reminder"), data: { path: "/" } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (open) return open.focus();
    return self.clients.openWindow("/");
  })());
});
