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

async function liveArtifact(overrides = {}) {
  const base = {
    schemaVersion: 1, generatedAt: "2026-10-14T06:00:00.000Z", cadenceHours: 4,
    stories: [
      { id: "auto-a", title: "Official automatic update", canonicalUrl: "https://www.uscis.gov/update", publishedAt: "2026-10-14", publisher: "USCIS", sourceId: "uscis-news", autoIngested: true, sourceVerified: false, trustLabel: "From official source — not yet reviewed by GlobeReady" },
      { id: "auto-duplicate", title: "OPT filing guidance", canonicalUrl: "https://www.uscis.gov/opt", publishedAt: "2026-10-13", autoIngested: true, sourceVerified: false },
    ],
    sourceReports: [{ sourceId: "uscis-news", name: "USCIS", state: "current", fetched: 2 }],
    ...overrides,
  };
  return { ...base, contentHash: await contentHashFor(base) };
}

function mockFeeds(reviewed, live) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
    ok: true,
    json: async () => String(url).includes("live-news") ? live : reviewed,
  }));
}

describe("static public news", () => {
  test("verifies integrity and filters stories without a demo fallback", async () => {
    const body = await artifact();
    mockFeeds(body, await liveArtifact());
    const result = await loadStaticNews({ topic: "employment", q: "filing" }, { now: new Date("2026-10-14T12:00:00Z") });
    expect(result.items.map((item) => item.id)).toEqual(["a"]);
    expect(result.sourceHealth.state).toBe("current");
  });

  test("merges live official items while reviewed records win duplicates", async () => {
    mockFeeds(await artifact(), await liveArtifact());
    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });
    expect(result.items.map((item) => item.id)).toEqual(["auto-a", "a", "b"]);
    expect(result.items.find((item) => item.canonicalUrl.endsWith("/opt"))).toMatchObject({ id: "a" });
    expect(result.items[0]).toMatchObject({ autoIngested: true, sourceVerified: false, trustLabel: expect.stringMatching(/not yet reviewed/i) });
    expect(result.sourceHealth).toMatchObject({ generatedAt: "2026-10-14T06:00:00.000Z", sourceReports: expect.any(Array) });
  });

  test("keeps reviewed news available when the automatic feed fails", async () => {
    const reviewed = await artifact();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => String(url).includes("live-news")
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, json: async () => reviewed });
    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });
    expect(result.items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(result.sourceHealth.state).toBe("degraded");
    expect(result.sourceHealth.message).toMatch(/automatic/i);
  });

  test("rejects tampering and unsupported schema versions", async () => {
    const tampered = { ...(await artifact()), stories: [{ id: "evil" }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => tampered });
    await expect(loadStaticNews()).rejects.toThrow(/integrity/i);
    const unknown = await artifact({ schemaVersion: 2 });
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => unknown });
    await expect(loadStaticNews()).rejects.toThrow(/version/i);
  });

  test("marks overdue artifacts delayed and exposes the subscription shape", async () => {
    const body = await artifact({ generatedAt: "2026-09-01T00:00:00.000Z" });
    mockFeeds(body, await liveArtifact({ generatedAt: "2026-09-01T00:00:00.000Z" }));
    const onData = vi.fn();
    const unsubscribe = subscribeStaticNews({}, onData, vi.fn(), { now: new Date("2026-10-14T00:00:00Z"), intervalMs: 60_000 });
    await vi.waitFor(() => expect(onData).toHaveBeenCalled());
    expect(onData.mock.calls[0][1].sourceHealth.state).toBe("delayed");
    unsubscribe();
  });

  test("derives an all-healthy coverage ledger from automatic source reports", async () => {
    mockFeeds(await artifact(), await liveArtifact({ sourceReports: [
      { sourceId: "uscis-news", name: "USCIS", state: "current", fetched: 2 },
      { sourceId: "ice-sevp", name: "SEVP", state: "current", fetched: 4 },
    ] }));

    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });

    expect(result.sourceHealth.state).toBe("current");
    expect(result.sourceHealth.coverageLedger).toMatchObject({
      summary: { active: 2, reachable: 2, withRelevantStories: 2, total: 2, failing: 0, disabled: 0 },
      entries: [
        { id: "uscis-news", status: "active", fetched: 2, lastSuccessAt: "2026-10-14T06:00:00.000Z" },
        { id: "ice-sevp", status: "active", fetched: 4, lastSuccessAt: "2026-10-14T06:00:00.000Z" },
      ],
    });
  });

  test("counts a reachable source with zero relevant stories without calling it failed", async () => {
    mockFeeds(await artifact(), await liveArtifact({ sourceReports: [
      { sourceId: "uscis-news", name: "USCIS", state: "current", fetched: 0 },
      { sourceId: "ice-sevp", name: "SEVP", state: "current", fetched: 4 },
    ] }));
    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });
    expect(result.sourceHealth.coverageLedger.summary).toMatchObject({ reachable: 2, withRelevantStories: 1, total: 2, failing: 0 });
    expect(result.sourceHealth.coverageLedger.entries[0]).toMatchObject({ status: "active", fetched: 0, lastSuccessAt: "2026-10-14T06:00:00.000Z" });
  });

  test("reports one failing automatic source without calling a fresh feed delayed", async () => {
    mockFeeds(await artifact(), await liveArtifact({ sourceReports: [
      { sourceId: "uscis-news", name: "USCIS", state: "current", fetched: 2 },
      { sourceId: "ice-sevp", name: "SEVP", state: "failed", fetched: 0, retained: 3, error: "HTTP 503" },
    ] }));

    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });

    expect(result.sourceHealth.state).toBe("current");
    expect(result.sourceHealth.coverageLedger.summary).toMatchObject({ active: 1, total: 2, failing: 1 });
    expect(result.sourceHealth.coverageLedger.entries[1]).toMatchObject({ id: "ice-sevp", status: "failing", safeReason: "HTTP 503", retained: 3 });
  });

  test("marks an otherwise healthy automatic feed delayed only after twelve hours", async () => {
    mockFeeds(await artifact(), await liveArtifact({ generatedAt: "2026-10-14T00:00:00.000Z" }));

    const fresh = await loadStaticNews({}, { now: new Date("2026-10-14T11:59:59Z") });
    const stale = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:01Z") });

    expect(fresh.sourceHealth.state).toBe("current");
    expect(stale.sourceHealth.state).toBe("delayed");
  });

  test("lists a disabled automatic source honestly without counting it as a failure", async () => {
    mockFeeds(await artifact(), await liveArtifact({ sourceReports: [
      { sourceId: "uscis-news", name: "USCIS", state: "current", fetched: 2 },
      { sourceId: "state-visa-news", name: "State Department", state: "disabled", fetched: 0, reason: "HTTP 403" },
    ] }));

    const result = await loadStaticNews({}, { now: new Date("2026-10-14T12:00:00Z") });

    expect(result.sourceHealth.state).toBe("current");
    expect(result.sourceHealth.coverageLedger.summary).toMatchObject({ active: 1, total: 1, failing: 0, disabled: 1 });
    expect(result.sourceHealth.coverageLedger.entries[1]).toMatchObject({ id: "state-visa-news", status: "disabled", safeReason: "HTTP 403" });
  });

  test("verifies the separate public coverage ledger", async () => {
    const base = { schemaVersion: 1, generatedAt: "2026-10-13T12:00:00.000Z", cadenceHours: 168, entries: [{ id: "uscis", status: "active" }] };
    const body = { ...base, contentHash: await contentHashFor(base) };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => body });
    await expect(loadStaticCoverage()).resolves.toEqual(body);
    expect(globalThis.fetch).toHaveBeenCalledWith("/data/coverage.json", expect.any(Object));
  });
});
