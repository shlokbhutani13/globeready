import { afterEach, describe, expect, test, vi } from "vitest";
import { contentHashFor, loadStaticCoverage, loadStaticNews, subscribeStaticNews } from "../lib/static-news";

afterEach(() => vi.restoreAllMocks());

async function artifact(overrides = {}) {
  const base = {
    schemaVersion: 1, generatedAt: "2026-10-13T12:00:00.000Z", cadenceHours: 168,
    stories: [
      { id: "a", title: "OPT filing guidance", canonicalUrl: "https://www.uscis.gov/opt", publishedAt: "2026-10-12", topics: ["employment"], visaTypes: ["f-1"] },
      { id: "b", title: "Campus arrival notice", canonicalUrl: "https://example.edu/arrival", publishedAt: "2026-10-01", topics: ["arrival"], visaTypes: [] },
    ],
    ...overrides,
  };
  return { ...base, contentHash: await contentHashFor(base) };
}

describe("static public news", () => {
  test("verifies integrity and filters stories without a demo fallback", async () => {
    const body = await artifact();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => body });
    const result = await loadStaticNews({ topic: "employment", q: "filing" }, { now: new Date("2026-10-14T12:00:00Z") });
    expect(result.items.map((item) => item.id)).toEqual(["a"]);
    expect(result.sourceHealth.state).toBe("current");
  });

  test("rejects tampering and unsupported schema versions", async () => {
    const tampered = { ...(await artifact()), stories: [{ id: "evil" }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, json: async () => tampered });
    await expect(loadStaticNews()).rejects.toThrow(/integrity/i);
    const unknown = await artifact({ schemaVersion: 2 });
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => unknown });
    await expect(loadStaticNews()).rejects.toThrow(/version/i);
  });

  test("marks overdue artifacts delayed and exposes the subscription shape", async () => {
    const body = await artifact({ generatedAt: "2026-09-01T00:00:00.000Z" });
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => body });
    const onData = vi.fn();
    const unsubscribe = subscribeStaticNews({}, onData, vi.fn(), { now: new Date("2026-10-14T00:00:00Z"), intervalMs: 60_000 });
    await vi.waitFor(() => expect(onData).toHaveBeenCalled());
    expect(onData.mock.calls[0][1].sourceHealth.state).toBe("delayed");
    unsubscribe();
  });

  test("verifies the separate public coverage ledger", async () => {
    const base = { schemaVersion: 1, generatedAt: "2026-10-13T12:00:00.000Z", cadenceHours: 168, entries: [{ id: "uscis", status: "active" }] };
    const body = { ...base, contentHash: await contentHashFor(base) };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => body });
    await expect(loadStaticCoverage()).resolves.toEqual(body);
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/coverage.json", expect.any(Object));
  });
});
