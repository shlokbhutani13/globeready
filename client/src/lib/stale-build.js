// After a new deployment, a tab opened before it may ask for code files that no longer exist. Vite reports that as
// "vite:preloadError"; reloading once fetches the current page. A short guard prevents a reload loop.
export function installStaleBuildRecovery(target = window, { storage = window.sessionStorage, now = () => Date.now() } = {}) {
  const key = "globeready:stale-build-reload";
  const handler = (event) => {
    let last = 0;
    try { last = Number(storage.getItem(key)) || 0; } catch { /* storage may be unavailable */ }
    if (now() - last < 60_000) return;
    try { storage.setItem(key, String(now())); } catch { /* reload anyway */ }
    event.preventDefault();
    target.location.reload();
  };
  target.addEventListener("vite:preloadError", handler);
  return () => target.removeEventListener("vite:preloadError", handler);
}
