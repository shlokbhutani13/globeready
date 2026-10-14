// Registers the offline shell (free public beta only). Failure is harmless: the app works the same without it.
export function registerServiceWorker({ enabled, navigatorImpl = globalThis.navigator, windowImpl = globalThis.window } = {}) {
  if (!enabled || !navigatorImpl?.serviceWorker || !windowImpl) return false;
  windowImpl.addEventListener("load", () => {
    navigatorImpl.serviceWorker.register("/sw.js").catch(() => {});
  });
  return true;
}
