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
