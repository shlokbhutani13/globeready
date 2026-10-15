import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, test, vi } from "vitest";
import { registerServiceWorker } from "../lib/register-service-worker";

const source = readFileSync(`${process.cwd()}/public/sw.js`, "utf8");

function load({ online = true } = {}) {
  const stores = new Map();
  const listeners = {};
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      match: async (key) => map.get(typeof key === "string" ? key : new URL(key.url).pathname + new URL(key.url).search)?.clone?.() ?? map.get(typeof key === "string" ? key : new URL(key.url).pathname)?.clone?.(),
      put: async (key, response) => { map.set(typeof key === "string" ? key : new URL(key.url).pathname, response); },
      keys: async () => [...map.keys()].map((url) => ({ url })),
      delete: async (key) => map.delete(typeof key === "string" ? key : key.url),
    };
  };
  const fetchMock = vi.fn(async (request) => {
    if (!online) throw new TypeError("offline");
    return new Response(`body:${new URL(request.url).pathname}`, { status: 200 });
  });
  const context = {
    self: { location: { origin: "https://app.example" }, addEventListener: (type, handler) => { listeners[type] = handler; }, skipWaiting: vi.fn(), clients: { claim: vi.fn() } },
    caches: { open: async (name) => cacheFor(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: fetchMock, Response, URL,
  };
  vm.runInNewContext(source, context);
  const dispatch = async (url, { method = "GET", mode = "cors" } = {}) => {
    let responded;
    listeners.fetch({ request: { url, method, mode }, respondWith: (promise) => { responded = promise; } });
    return responded ? responded : null;
  };
  return { dispatch, stores, fetchMock, context };
}

describe("offline service worker", () => {
  test("ignores Firebase, Google, auth helper, OCR, and non-GET requests so private data is never cached", async () => {
    const { dispatch, stores } = load();
    for (const url of [
      "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen", "https://identitytoolkit.googleapis.com/v1/accounts:lookup",
      "https://app.example/__/auth/handler", "https://app.example/ocr/abc123/eng.traineddata.gz",
    ]) expect(await dispatch(url), url).toBeNull();
    expect(await dispatch("https://app.example/data/news.json", { method: "POST" })).toBeNull();
    expect(stores.size).toBe(0);
  });

  test("keeps the app shell for offline opening of any page, and serves it when the network is down", async () => {
    const online = load();
    await (await online.dispatch("https://app.example/tasks", { mode: "navigate" }));
    expect([...online.stores.get("globeready-shell-v1").keys()]).toEqual(["/index.html"]);
    const offline = load({ online: false });
    offline.stores.set("globeready-shell-v1", online.stores.get("globeready-shell-v1"));
    const response = await offline.dispatch("https://app.example/journey", { mode: "navigate" });
    expect(await response.text()).toBe("body:/tasks");
  });

  test("keeps reviewed news and built code for offline reading, news refreshing network-first", async () => {
    const online = load();
    await online.dispatch("https://app.example/data/news.json");
    await online.dispatch("https://app.example/assets/index-abc.js");
    expect(online.stores.get("globeready-data-v1").has("/data/news.json")).toBe(true);
    expect(online.stores.get("globeready-assets-v1").has("/assets/index-abc.js")).toBe(true);
    const offline = load({ online: false });
    offline.stores.set("globeready-data-v1", online.stores.get("globeready-data-v1"));
    expect(await (await offline.dispatch("https://app.example/data/news.json")).text()).toBe("body:/data/news.json");
  });

  test("does not cache failed responses", async () => {
    const { dispatch, stores, context } = load();
    context.fetch = vi.fn(async () => new Response("nope", { status: 404 }));
    await dispatch("https://app.example/data/coverage.json");
    expect(stores.get("globeready-data-v1")?.size ?? 0).toBe(0);
  });
});

describe("service worker registration", () => {
  test("registers only in the free beta and tolerates failure", () => {
    const addEventListener = vi.fn();
    const register = vi.fn(() => Promise.reject(new Error("blocked")));
    expect(registerServiceWorker({ enabled: false, navigatorImpl: { serviceWorker: { register } }, windowImpl: { addEventListener } })).toBe(false);
    expect(registerServiceWorker({ enabled: true, navigatorImpl: {}, windowImpl: { addEventListener } })).toBe(false);
    expect(registerServiceWorker({ enabled: true, navigatorImpl: { serviceWorker: { register } }, windowImpl: { addEventListener } })).toBe(true);
    addEventListener.mock.calls[0][1]();
    expect(register).toHaveBeenCalledWith("/sw.js");
  });
});
