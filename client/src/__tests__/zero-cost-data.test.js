import { describe, expect, test, vi } from "vitest";
import { createZeroCostDataStore, maxLocalDocuments, nextDocumentSlot, validProfileFields } from "../lib/zero-cost-data";

function harness({ fail = false, collections = {} } = {}) {
  const calls = [];
  const sdk = {
    doc: (...parts) => parts.slice(1).join("/"),
    collection: (...parts) => parts.slice(1).join("/"),
    query: (reference) => reference,
    limit: () => null,
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
    getDocs: vi.fn(async (reference) => ({ docs: (collections[reference] || []).slice(0, 400).map((id) => ({ id })) })),
    writeBatch: () => {
      const pending = [];
      return {
        delete: (reference) => pending.push(reference),
        commit: async () => {
          for (const reference of pending) {
            const [, , name, id] = reference.split("/");
            const key = `users/student-1/${name}`;
            collections[key] = collections[key].filter((value) => value !== id);
            calls.push(["batch-delete", reference]);
          }
        },
      };
    },
    onSnapshot: vi.fn((reference, onNext) => { onNext({ docs: [{ id: "news-1" }] }); return () => {}; }),
    serverTimestamp: () => "SERVER_TIME",
  };
  return { calls, collections, store: createZeroCostDataStore({ firestore: {}, uid: "student-1", sdk }) };
}

const localDocument = (extra = {}) => ({
  id: "doc-00", metadata: { name: "i20.pdf", contentType: "application/pdf", size: 200 },
  chunks: [{ page: 1, text: "Student and Exchange Visitor Program" }], pageCount: 2, pagesWithText: 1, ...extra,
});

describe("zero-cost Firestore data adapter", () => {
  test("requires an authenticated uid", () => {
    expect(() => createZeroCostDataStore({ firestore: {}, uid: "", sdk: {} })).toThrow(/authenticated/i);
  });

  test("writes bounded profile and consent records without an API fallback", async () => {
    const { calls, store } = harness();
    await store.saveProfile({ fullName: " Maya Singh ", visaType: "F-1", startDate: "2026-08-20", ignored: "no" });
    await store.saveConsent({ documents: true, aiGeneration: true });
    expect(calls[0]).toEqual(["set", "users/student-1", { fullName: "Maya Singh", visaType: "F-1", startDate: "2026-08-20", updatedAt: "SERVER_TIME" }, { merge: true }]);
    expect(calls[1][2].consent).toMatchObject({ version: expect.any(String), documents: true, aiGeneration: false });
  });

  test("explains profile values the rules would refuse", () => {
    expect(() => validProfileFields({ fullName: "x".repeat(201) })).toThrow(/Full name must be 200 characters/i);
    expect(() => validProfileFields({ startDate: "next week" })).toThrow(/Start date must be a date/i);
    expect(validProfileFields({ graduationDate: "" })).toEqual({ graduationDate: "" });
  });

  test("creates tasks and https saved resources with the rules' shapes", async () => {
    const { calls, store } = harness();
    await store.createTask({ title: "File form", dueDate: "2026-11-01", priority: "high" });
    await store.saveResource({ title: "USCIS", url: "https://www.uscis.gov", category: "status", source: "USCIS" });
    expect(calls[0][1]).toBe("users/student-1/tasks");
    expect(calls[0][2]).toMatchObject({ title: "File form", source: "user", completed: false });
    expect(calls[1][1]).toBe("users/student-1/savedResources");
    await expect(store.createTask({ title: "x", dueDate: "soon" })).rejects.toThrow(/due date/i);
    await store.removeResource("r1");
    expect(calls.at(-1)).toEqual(expect.arrayContaining(["delete"]));
  });

  test("stores a complete local document index with page counts in one write to a bounded slot", async () => {
    const { calls, store } = harness();
    await store.saveLocalDocument(localDocument());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["set", "users/student-1/documents/doc-00", expect.objectContaining({
      storageMode: "browser-local", analysisStatus: "indexed", pageCount: 2, pagesWithText: 1,
      chunks: [{ page: 1, text: "Student and Exchange Visitor Program" }],
    }), undefined]);
    await expect(store.saveLocalDocument(localDocument({ id: "random-id" }))).rejects.toThrow(/slot/i);
    await expect(store.saveLocalDocument(localDocument({ pagesWithText: 3 }))).rejects.toThrow(/page count/i);
  });

  test("assigns the lowest free document slot and explains the account cap", () => {
    expect(nextDocumentSlot([])).toBe("doc-00");
    expect(nextDocumentSlot(["doc-00", "doc-02"])).toBe("doc-01");
    const full = Array.from({ length: maxLocalDocuments }, (_, slot) => `doc-${String(slot).padStart(2, "0")}`);
    expect(() => nextDocumentSlot(full)).toThrow(/up to 50 documents/i);
  });

  test("deletes all stored document text in repeated batches", async () => {
    const ids = Array.from({ length: 50 }, (_, slot) => `doc-${String(slot).padStart(2, "0")}`);
    const { collections, store } = harness({ collections: { "users/student-1/documents": [...ids] } });
    await expect(store.removeAllLocalDocuments()).resolves.toBe(50);
    expect(collections["users/student-1/documents"]).toEqual([]);
  });

  test("saves and removes updates by their public news ID", async () => {
    const { calls, store } = harness();
    await store.saveNews("federal-register-2026-14439");
    await store.unsaveNews("federal-register-2026-14439");
    const ids = [];
    store.subscribeSavedNewsIds((value) => ids.push(...value));
    expect(calls[0]).toEqual(["set", "users/student-1/savedNews/federal-register-2026-14439", { newsItemId: "federal-register-2026-14439", createdAt: "SERVER_TIME" }, undefined]);
    expect(calls[1]).toEqual(["delete", "users/student-1/savedNews/federal-register-2026-14439"]);
    expect(ids).toEqual(["news-1"]);
  });

  test("surfaces Firestore failures instead of returning demo success", async () => {
    const { store } = harness({ fail: true });
    await expect(store.saveProfile({ fullName: "Maya" })).rejects.toThrow("quota exceeded");
  });

  test("tracked dates accept only hand-entered, bounded values and can be edited or removed", async () => {
    const { calls, store } = harness();
    await store.createTrackedDate({ label: " Passport expires ", kind: "passport", date: "2028-03-01", remindDays: 90 });
    expect(calls[0][1]).toBe("users/student-1/trackedDates");
    expect(calls[0][2]).toMatchObject({ label: "Passport expires", kind: "passport", date: "2028-03-01", remindDays: 90, notes: "" });
    await expect(store.createTrackedDate({ label: "x", kind: "passport", date: "03/01/2028" })).rejects.toThrow(/date/i);
    await expect(store.createTrackedDate({ label: "x", kind: "bogus", date: "2028-03-01" })).rejects.toThrow(/type/i);
    await expect(store.createTrackedDate({ label: "x", kind: "visa", date: "2028-03-01", remindDays: 400 })).rejects.toThrow(/remind/i);
    await store.updateTrackedDate("d1", { label: "Visa", kind: "visa", date: "2027-01-01", remindDays: 30, createdAt: "KEEP" });
    expect(calls.at(-1)[1]).toBe("users/student-1/trackedDates/d1");
    expect(calls.at(-1)[2].createdAt).toBe("KEEP");
    await store.removeTrackedDate("d1");
    expect(calls.at(-1)).toEqual(["delete", "users/student-1/trackedDates/d1"]);
  });

  test("contacts need a name and a known role, and cap at 50 per account", async () => {
    const { calls, store } = harness();
    await store.createContact({ name: "Dr. Rao", role: "dso", phone: "+1 555 0100", email: "dso@school.edu" }, 3);
    expect(calls[0][1]).toBe("users/student-1/contacts");
    await expect(store.createContact({ name: "", role: "dso" }, 0)).rejects.toThrow(/name/i);
    await expect(store.createContact({ name: "A", role: "boss" }, 0)).rejects.toThrow(/role/i);
    await expect(store.createContact({ name: "A", role: "dso", email: "no-at-sign" }, 0)).rejects.toThrow(/email/i);
    await expect(store.createContact({ name: "A", role: "dso" }, 50)).rejects.toThrow(/50 contacts/i);
  });

  test("planner progress stores bounded ids and custom items for journey and travel only", async () => {
    const { calls, store } = harness();
    await store.savePlanner("travel", { have: ["passport"], custom: [{ id: "c1", label: "Charger" }] });
    expect(calls[0][1]).toBe("users/student-1/planner/travel");
    expect(calls[0][2]).toMatchObject({ have: ["passport"], custom: [{ id: "c1", label: "Charger" }], updatedAt: "SERVER_TIME" });
    await expect(store.savePlanner("other", { have: [], custom: [] })).rejects.toThrow(/planner/i);
    await expect(store.savePlanner("travel", { have: Array.from({ length: 201 }, (_, i) => `i${i}`), custom: [] })).rejects.toThrow(/200/);
    await expect(store.savePlanner("travel", { have: [], custom: new Array(41).fill({ id: "a", label: "b" }) })).rejects.toThrow(/40/);
  });

  test("interest topics are limited to known topics", () => {
    expect(validProfileFields({ topics: ["employment", "employment", "travel-entry"] }).topics).toEqual(["employment", "travel-entry"]);
    expect(() => validProfileFields({ topics: ["made-up"] })).toThrow(/topic/i);
    expect(() => validProfileFields({ topics: "employment" })).toThrow(/topics/i);
  });
});
