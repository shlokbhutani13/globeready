import { describe, expect, test, vi } from "vitest";
import { deleteZeroCostAccount, downloadZeroCostExport, exportZeroCostAccount } from "../lib/zero-cost-account";

// An in-memory Firestore stand-in that honours limit/startAfter paging and batch deletes.
function sdkHarness({ failCommit = false, collections = {} } = {}) {
  const store = Object.fromEntries(Object.entries(collections).map(([key, records]) => [key, [...records]]));
  const events = [];
  const sdk = {
    collection: (_db, ...parts) => parts.join("/"),
    doc: (_db, ...parts) => parts.join("/"),
    documentId: () => "__id__",
    orderBy: () => ({ type: "orderBy" }),
    limit: (count) => ({ type: "limit", count }),
    startAfter: (cursor) => ({ type: "startAfter", cursor }),
    query: (reference, ...constraints) => ({ reference, constraints }),
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ fullName: "Maya" }) })),
    getDocs: vi.fn(async ({ reference, constraints }) => {
      const sorted = [...(store[reference] || [])].sort((a, b) => a.id.localeCompare(b.id));
      const after = constraints.find((item) => item.type === "startAfter")?.cursor?.id;
      const count = constraints.find((item) => item.type === "limit")?.count ?? sorted.length;
      const page = sorted.filter((record) => !after || record.id > after).slice(0, count);
      return { docs: page.map((value) => ({ id: value.id, data: () => value })) };
    }),
    writeBatch: () => {
      const pending = [];
      return {
        delete: (reference) => pending.push(reference),
        commit: vi.fn(async () => {
          if (failCommit) throw new Error("quota exceeded");
          for (const reference of pending) {
            const parts = reference.split("/");
            const key = parts.slice(0, 3).join("/");
            store[key] = store[key].filter((record) => record.id !== parts[3]);
          }
          events.push(`batch:${pending.length}`);
        }),
      };
    },
    deleteDoc: vi.fn(async (reference) => events.push(`delete:${reference}`)),
  };
  return { sdk, store, events };
}

const many = (count, prefix) => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${String(index).padStart(4, "0")}`, title: "x" }));

describe("zero-cost account portability and deletion", () => {
  test("exports every supported collection, paging past 500 records", async () => {
    const { sdk } = sdkHarness({ collections: {
      "users/student/tasks": many(1_234, "t"),
      "users/student/documents": [{ id: "doc-00", name: "I-20.pdf", chunks: [{ page: 1, text: "status" }] }],
      "users/student/savedNews": [{ id: "federal-register-2026-14439", newsItemId: "federal-register-2026-14439" }],
    } });
    const result = await exportZeroCostAccount({ firestore: {}, uid: "student", sdk, now: () => new Date("2026-10-14T12:00:00Z") });
    expect(result).toMatchObject({ uid: "student", profile: { fullName: "Maya" }, documents: [{ id: "doc-00" }], savedResources: [] });
    expect(result.tasks).toHaveLength(1_234);
    expect(result.savedNews).toHaveLength(1);
  });

  test("explains when the export is larger than the browser limit", async () => {
    const big = Array.from({ length: 12 }, (_, index) => ({ id: `doc-${index}`, chunks: [{ text: "x".repeat(1_000_000) }] }));
    const { sdk } = sdkHarness({ collections: { "users/student/documents": big } });
    await expect(exportZeroCostAccount({ firestore: {}, uid: "student", sdk })).rejects.toThrow(/10 MB/);
  });

  test("downloads JSON with a safe content type and filename", () => {
    const click = vi.fn();
    const documentImpl = { createElement: () => ({ click, remove: vi.fn(), set href(value) { this._href = value; }, set download(value) { this._download = value; } }), body: { append: vi.fn() } };
    const urlImpl = { createObjectURL: vi.fn(() => "blob:safe"), revokeObjectURL: vi.fn() };
    const blob = downloadZeroCostExport({ schemaVersion: 2 }, { documentImpl, urlImpl });
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(click).toHaveBeenCalledOnce();
  });

  test("confirms identity before deleting anything", async () => {
    const { sdk, events } = sdkHarness({ collections: { "users/student/tasks": many(3, "t") } });
    const identity = vi.fn();
    const reauthenticate = vi.fn(async () => { throw Object.assign(new Error("Wrong password"), { code: "auth/wrong-password" }); });
    await expect(deleteZeroCostAccount({ firestore: {}, uid: "student", reauthenticate, deleteIdentity: identity, sdk })).rejects.toThrow(/wrong password/i);
    expect(events).toEqual([]);
    expect(sdk.getDocs).not.toHaveBeenCalled();
    expect(identity).not.toHaveBeenCalled();
  });

  test("deletes more than 500 records in repeated batches, then the profile, then the identity", async () => {
    const order = [];
    const { sdk, store, events } = sdkHarness({ collections: {
      "users/student/tasks": many(1_050, "t"), "users/student/documents": many(50, "doc-"), "users/student/savedNews": many(2, "n"),
    } });
    await deleteZeroCostAccount({
      firestore: {}, uid: "student", sdk,
      reauthenticate: async () => order.push("reauth"),
      deleteIdentity: async () => order.push("identity"),
    });
    expect(store["users/student/tasks"]).toEqual([]);
    expect(store["users/student/documents"]).toEqual([]);
    expect(events.filter((event) => event.startsWith("batch")).length).toBeGreaterThanOrEqual(4);
    expect(events.at(-1)).toBe("delete:users/student");
    expect(order).toEqual(["reauth", "identity"]);
  });

  test("keeps the identity and reports a retryable state after a partial failure", async () => {
    const identity = vi.fn();
    const { sdk } = sdkHarness({ failCommit: true, collections: { "users/student/tasks": many(1, "t") } });
    await expect(deleteZeroCostAccount({ firestore: {}, uid: "student", reauthenticate: async () => {}, deleteIdentity: identity, sdk }))
      .rejects.toMatchObject({ retryable: true, message: expect.stringMatching(/try again/i) });
    expect(identity).not.toHaveBeenCalled();
  });
});
