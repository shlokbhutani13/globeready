import { describe, expect, test, vi } from "vitest";
import { createZeroCostDataStore } from "../lib/zero-cost-data";

function harness({ fail = false } = {}) {
  const calls = [];
  const sdk = {
    doc: (...parts) => parts.slice(1).join("/"),
    collection: (...parts) => parts.slice(1).join("/"),
    addDoc: vi.fn(async (reference, value) => {
      calls.push(["add", reference, value]);
      if (fail) throw new Error("quota exceeded");
      return { id: "created-id" };
    }),
    setDoc: vi.fn(async (reference, value, options) => {
      calls.push(["set", reference, value, options]);
      if (fail) throw new Error("quota exceeded");
    }),
    updateDoc: vi.fn(async (reference, value) => calls.push(["update", reference, value])),
    deleteDoc: vi.fn(async (reference) => calls.push(["delete", reference])),
    serverTimestamp: () => "SERVER_TIME",
  };
  return { calls, store: createZeroCostDataStore({ firestore: {}, uid: "student-1", sdk }) };
}

describe("zero-cost Firestore data adapter", () => {
  test("requires an authenticated uid", () => {
    expect(() => createZeroCostDataStore({ firestore: {}, uid: "", sdk: {} })).toThrow(/authenticated/i);
  });

  test("writes bounded profile and consent records without an API fallback", async () => {
    const { calls, store } = harness();
    await store.saveProfile({ fullName: "Maya Singh", visaType: "F-1", ignored: "no" });
    await store.saveConsent({ documents: true, aiGeneration: true });
    expect(calls[0]).toEqual(["set", "users/student-1", expect.objectContaining({ fullName: "Maya Singh", visaType: "F-1", updatedAt: "SERVER_TIME" }), { merge: true }]);
    expect(calls[0][2]).not.toHaveProperty("ignored");
    expect(calls[1][2].consent).toMatchObject({ version: expect.any(String), documents: true, aiGeneration: false });
  });

  test("creates tasks and https saved resources with the existing public shapes", async () => {
    const { calls, store } = harness();
    await store.createTask({ title: "File form", dueDate: "2026-11-01", priority: "high" });
    await store.saveResource({ title: "USCIS", url: "https://www.uscis.gov", category: "status", source: "USCIS" });
    expect(calls[0][1]).toBe("users/student-1/tasks");
    expect(calls[0][2]).toMatchObject({ title: "File form", source: "user", completed: false });
    expect(calls[1][1]).toBe("users/student-1/savedResources");
  });

  test("stores a complete local document index in one atomic document write", async () => {
    const { calls, store } = harness();
    await store.replaceDocumentIndex({
      id: "doc-1",
      metadata: { name: "i20.pdf", contentType: "application/pdf", size: 200 },
      chunks: [{ page: 1, text: "Student and Exchange Visitor Program" }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["set", "users/student-1/documents/doc-1", expect.objectContaining({
      storageMode: "browser-local", analysisStatus: "indexed", chunks: [{ page: 1, text: "Student and Exchange Visitor Program" }],
    }), undefined]);
  });

  test("surfaces Firestore failures instead of returning demo success", async () => {
    const { store } = harness({ fail: true });
    await expect(store.saveProfile({ fullName: "Maya" })).rejects.toThrow("quota exceeded");
  });
});
