import { describe, expect, test, vi } from "vitest";
import { deleteZeroCostAccount, downloadZeroCostExport, exportZeroCostAccount } from "../lib/zero-cost-account";

function sdkHarness({ failCommit = false, collections = {} } = {}) {
  const deleted = [];
  const sdk = {
    collection: (_db, ...parts) => parts.join("/"),
    doc: (_db, ...parts) => parts.join("/"),
    limit: (count) => count,
    query: (reference) => reference,
    getDoc: vi.fn(async () => ({ exists: () => true, data: () => ({ fullName: "Maya", private: undefined }) })),
    getDocs: vi.fn(async (reference) => ({ docs: (collections[reference] || []).map((value) => ({ id: value.id, data: () => value })) })),
    writeBatch: () => ({
      delete: (reference) => deleted.push(reference),
      commit: vi.fn(async () => { if (failCommit) throw new Error("quota exceeded"); }),
    }),
    deleteDoc: vi.fn(async (reference) => deleted.push(reference)),
  };
  return { sdk, deleted };
}

describe("zero-cost account portability and deletion", () => {
  test("exports only the bounded supported inventory", async () => {
    const { sdk } = sdkHarness({ collections: {
      "users/student/tasks": [{ id: "t1", title: "File form" }],
      "users/student/documents": [{ id: "d1", name: "I-20.pdf", chunks: [{ page: 1, text: "status" }] }],
      "users/student/savedResources": [],
    } });
    const result = await exportZeroCostAccount({ firestore: {}, uid: "student", sdk, now: () => new Date("2026-10-13T12:00:00Z") });
    expect(result).toMatchObject({ schemaVersion: 1, uid: "student", profile: { fullName: "Maya" }, tasks: [{ id: "t1" }], documents: [{ id: "d1" }] });
    expect(JSON.stringify(result)).not.toContain("originalFile");
  });

  test("refuses an unbounded collection instead of silently truncating it", async () => {
    const { sdk } = sdkHarness({ collections: { "users/student/tasks": Array.from({ length: 501 }, (_, id) => ({ id: String(id) })) } });
    await expect(exportZeroCostAccount({ firestore: {}, uid: "student", sdk })).rejects.toThrow(/500/);
  });

  test("downloads JSON with a safe content type and filename", () => {
    const click = vi.fn();
    const documentImpl = { createElement: () => ({ click, remove: vi.fn(), set href(value) { this._href = value; }, set download(value) { this._download = value; } }), body: { append: vi.fn() } };
    const urlImpl = { createObjectURL: vi.fn(() => "blob:safe"), revokeObjectURL: vi.fn() };
    const blob = downloadZeroCostExport({ schemaVersion: 1 }, { documentImpl, urlImpl });
    expect(blob.type).toBe("application/json;charset=utf-8");
    expect(click).toHaveBeenCalledOnce();
  });

  test("deletes data before identity and preserves identity after partial cleanup failure", async () => {
    const identity = vi.fn();
    const failing = sdkHarness({ failCommit: true, collections: { "users/student/tasks": [{ id: "t1" }] } });
    await expect(deleteZeroCostAccount({ firestore: {}, uid: "student", deleteIdentity: identity, sdk: failing.sdk })).rejects.toThrow(/quota exceeded/);
    expect(identity).not.toHaveBeenCalled();

    const passing = sdkHarness({ collections: { "users/student/tasks": [{ id: "t1" }], "users/student/documents": [{ id: "d1" }] } });
    await deleteZeroCostAccount({ firestore: {}, uid: "student", deleteIdentity: identity, sdk: passing.sdk });
    expect(passing.deleted.at(-1)).toBe("users/student");
    expect(identity).toHaveBeenCalledOnce();
  });
});
