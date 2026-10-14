import { describe, expect, test, vi } from "vitest";
import { installStaleBuildRecovery } from "../lib/stale-build";

function fakeWindow() {
  const target = new EventTarget();
  target.location = { reload: vi.fn() };
  return target;
}
const memoryStorage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

describe("stale deployment recovery", () => {
  test("reloads once when an old tab cannot load a removed code file", () => {
    const target = fakeWindow();
    let time = 1_000_000;
    installStaleBuildRecovery(target, { storage: memoryStorage(), now: () => time });
    const event = new Event("vite:preloadError", { cancelable: true });
    target.dispatchEvent(event);
    expect(target.location.reload).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    time += 5_000;
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    expect(target.location.reload).toHaveBeenCalledOnce();
  });
});
