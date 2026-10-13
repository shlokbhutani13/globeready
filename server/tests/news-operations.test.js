import { expect, test, vi } from "vitest";

import { createNewsOperations } from "../src/jobs/news-operations.js";
import { createDemoStore } from "../src/store.js";

test("defaults to dry run, bounds sources, and returns the saved summary on replay", async () => {
  const store = createDemoStore();
  const syncSource = vi.fn(async (id, options) => ({ sourceId: id, dryRun: options.dryRun, status: "success" }));
  const operations = createNewsOperations({ sync: { syncSource }, store, clock: () => new Date("2026-10-13T12:00:00Z") });

  const first = await operations.run({ operationId: "operation-1", sourceIds: ["one", "two"], limit: 1 });
  const replay = await operations.run({ operationId: "operation-1", sourceIds: ["different"] });

  expect(first).toEqual({
    operationId: "operation-1", dryRun: true, replayed: false, startedAt: "2026-10-13T12:00:00.000Z",
    sources: [{ sourceId: "one", status: "success" }], cleanup: { deleted: 0 },
  });
  expect(replay).toEqual({ ...first, replayed: true });
  expect(syncSource).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(first)).not.toMatch(/snapshot|token|secret|content/i);
});

test("refuses writes without explicit enablement and validates inputs", async () => {
  const operations = createNewsOperations({ sync: { syncSource: vi.fn() }, store: createDemoStore() });
  await expect(operations.run({ operationId: "write-1", dryRun: false, sourceIds: ["one"] }))
    .rejects.toThrow(/disabled/i);
  await expect(operations.run({ operationId: "bad", sourceIds: [], limit: 0 })).rejects.toThrow(/limit/i);
  await expect(operations.run({ operationId: "bad", sourceIds: ["bad source"] })).rejects.toThrow(/source/i);
});

test("deletes only the bounded expired snapshot batch", async () => {
  const store = createDemoStore();
  store.snapshots = {
    listExpired: vi.fn(async () => [{ path: "one" }, { path: "two" }]),
    deleteExpired: vi.fn(async () => true),
  };
  const operations = createNewsOperations({ sync: { syncSource: vi.fn() }, store });
  const result = await operations.run({ operationId: "cleanup-1", sourceIds: [], cleanup: true, limit: 1 });
  expect(store.snapshots.listExpired).toHaveBeenCalledWith(expect.any(String), 1);
  expect(store.snapshots.deleteExpired).toHaveBeenCalledTimes(1);
  expect(result.cleanup).toEqual({ deleted: 1 });
});

test("coalesces concurrent calls with the same operation ID", async () => {
  const store = createDemoStore();
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const syncSource = vi.fn(async () => { await blocked; return { status: "success" }; });
  const operations = createNewsOperations({ sync: { syncSource }, store });
  const first = operations.run({ operationId: "same", sourceIds: ["one"] });
  const second = operations.run({ operationId: "same", sourceIds: ["one"] });
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  expect(syncSource).toHaveBeenCalledTimes(1);
  expect(secondResult).toEqual({ ...firstResult, replayed: true });
});
