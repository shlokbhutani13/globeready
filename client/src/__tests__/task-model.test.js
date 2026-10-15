import { describe, expect, test, vi } from "vitest";
import { nextOccurrence, nextTaskFrom, recurrenceLabels } from "../lib/recurrence";
import { createZeroCostDataStore, validTask } from "../lib/zero-cost-data";
import { deriveReminders } from "../lib/reminders";

describe("recurrence", () => {
  test("weekly adds seven days, across months and years", () => {
    expect(nextOccurrence("2026-10-14", "weekly")).toBe("2026-10-21");
    expect(nextOccurrence("2026-12-28", "weekly")).toBe("2027-01-04");
  });
  test("monthly keeps the day, or the last day of a shorter month", () => {
    expect(nextOccurrence("2026-10-14", "monthly")).toBe("2026-11-14");
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextOccurrence("2028-01-31", "monthly")).toBe("2028-02-29");
    expect(nextOccurrence("2026-12-15", "monthly")).toBe("2027-01-15");
  });
  test("yearly keeps the day, and moves Feb 29 to Feb 28 in other years", () => {
    expect(nextOccurrence("2026-10-14", "yearly")).toBe("2027-10-14");
    expect(nextOccurrence("2028-02-29", "yearly")).toBe("2029-02-28");
  });
  test("refuses missing or invalid input", () => {
    expect(nextOccurrence("", "weekly")).toBe("");
    expect(nextOccurrence("2026-02-31", "weekly")).toBe("");
    expect(nextOccurrence("2026-10-14", "daily")).toBe("");
    expect(nextOccurrence("2026-10-14", undefined)).toBe("");
  });
  test("labels each repeat option in words", () => {
    expect(Object.keys(recurrenceLabels)).toEqual(["none", "weekly", "monthly", "yearly"]);
  });
  test("builds the next task keeping details, links and the reminder offset, but not completion", () => {
    const next = nextTaskFrom({ title: "File tax form", category: "Tax", priority: "high", dueDate: "2026-10-14", remindOn: "2026-10-10", recurrence: "weekly", notes: "n", links: [{ type: "rule", id: "form-8843" }], completed: true, id: "x" });
    expect(next).toEqual({ title: "File tax form", category: "Tax", priority: "high", dueDate: "2026-10-21", remindOn: "2026-10-17", recurrence: "weekly", notes: "n", links: [{ type: "rule", id: "form-8843" }] });
    expect(nextTaskFrom({ title: "x", dueDate: "", recurrence: "weekly" })).toBeNull();
    expect(nextTaskFrom({ title: "x", dueDate: "2026-10-14" })).toBeNull();
  });
});

describe("task model", () => {
  test("keeps the old shape when no new fields are used", () => {
    expect(validTask({ title: " Pay fee ", dueDate: "2026-11-01", priority: "high" })).toEqual({ title: "Pay fee", category: "General", priority: "high", dueDate: "2026-11-01" });
  });
  test("accepts notes, recurrence, a manual reminder date and links", () => {
    const task = validTask({ title: "Renew", dueDate: "2026-11-01", notes: " bring passport ", recurrence: "yearly", remindOn: "2026-10-25", links: [{ type: "news", id: "federal-register-2026-14439" }, { type: "news", id: "federal-register-2026-14439" }, { type: "case", id: "abc" }] });
    expect(task).toMatchObject({ notes: "bring passport", recurrence: "yearly", remindOn: "2026-10-25" });
    expect(task.links).toEqual([{ type: "news", id: "federal-register-2026-14439" }, { type: "case", id: "abc" }]);
  });
  test("treats a repeat of none as no repeat", () => {
    expect("recurrence" in validTask({ title: "x", recurrence: "none" })).toBe(false);
  });
  test("rejects what the rules would refuse, in plain words", () => {
    expect(() => validTask({ title: "x", notes: "n".repeat(1001) })).toThrow(/notes must be 1000/iu);
    expect(() => validTask({ title: "x", recurrence: "weekly" })).toThrow(/repeating task needs a due date/iu);
    expect(() => validTask({ title: "x", recurrence: "daily", dueDate: "2026-11-01" })).toThrow(/repeat/iu);
    expect(() => validTask({ title: "x", remindOn: "2026-02-31" })).toThrow(/reminder date/iu);
    expect(() => validTask({ title: "x", links: Array.from({ length: 6 }, (_, index) => ({ type: "news", id: `n${index}` })) })).toThrow(/up to 5/iu);
    expect(() => validTask({ title: "x", links: [{ type: "web", id: "a" }] })).toThrow(/link/iu);
    expect(() => validTask({ title: "x", links: [{ type: "news", id: "bad id!" }] })).toThrow(/link/iu);
  });
});

function harness() {
  const calls = [];
  const sdk = {
    doc: (...parts) => parts.slice(1).join("/"), collection: (...parts) => parts.slice(1).join("/"),
    addDoc: vi.fn(async (reference, value) => { calls.push(["add", reference, value]); return { id: "next-id" }; }),
    setDoc: vi.fn(async (reference, value) => { calls.push(["set", reference, value]); }),
    updateDoc: vi.fn(async (reference, value) => { calls.push(["update", reference, value]); }),
    deleteDoc: vi.fn(), serverTimestamp: () => "SERVER_TIME", query: (r) => r, limit: () => null, getDocs: vi.fn(), onSnapshot: vi.fn(), writeBatch: vi.fn(),
  };
  return { calls, store: createZeroCostDataStore({ firestore: "db", uid: "student-1", sdk }) };
}

describe("task store", () => {
  test("edits a task by rewriting it with its original creation time, source and completion", async () => {
    const { calls, store } = harness();
    await store.updateTask({ id: "t1", completed: true, createdAt: "CREATED" }, { title: "New title", dueDate: "2026-11-02", notes: "x" });
    expect(calls[0][0]).toBe("set");
    expect(calls[0][1]).toBe("users/student-1/tasks/t1");
    expect(calls[0][2]).toEqual({ title: "New title", category: "General", priority: "medium", dueDate: "2026-11-02", notes: "x", completed: true, source: "user", createdAt: "CREATED", updatedAt: "SERVER_TIME" });
  });
  test("clearing optional fields removes them from the stored task", async () => {
    const { calls, store } = harness();
    await store.updateTask({ id: "t1", completed: false, createdAt: "C" }, { title: "Only title" });
    expect(Object.keys(calls[0][2]).sort()).toEqual(["category", "completed", "createdAt", "dueDate", "priority", "source", "title", "updatedAt"]);
  });
  test("refuses to edit without a task id or with invalid input", async () => {
    const { store } = harness();
    await expect(store.updateTask({ completed: false }, { title: "x" })).rejects.toThrow(/task/iu);
    await expect(store.updateTask({ id: "t1" }, { title: "" })).rejects.toThrow(/title/iu);
  });
  test("completing a repeating task marks it done and creates the next one", async () => {
    const { calls, store } = harness();
    const result = await store.completeTask({ id: "t1", title: "Monthly rent", category: "Housing", priority: "medium", dueDate: "2026-10-31", recurrence: "monthly", completed: false });
    expect(calls[0]).toEqual(["update", "users/student-1/tasks/t1", { completed: true, updatedAt: "SERVER_TIME" }]);
    expect(calls[1][0]).toBe("add");
    expect(calls[1][2]).toMatchObject({ title: "Monthly rent", dueDate: "2026-11-30", recurrence: "monthly", completed: false, source: "user" });
    expect(result.nextId).toBe("next-id");
  });
  test("completing a plain task or reopening a task never creates another", async () => {
    const { calls, store } = harness();
    await store.completeTask({ id: "a", title: "Plain", dueDate: "2026-10-31", completed: false });
    await store.completeTask({ id: "b", title: "Reopen", dueDate: "2026-10-31", recurrence: "weekly", completed: true });
    expect(calls.filter((call) => call[0] === "add")).toHaveLength(0);
    expect(calls[1][2]).toEqual({ completed: false, updatedAt: "SERVER_TIME" });
  });
});

describe("manual task reminders", () => {
  const now = new Date(2026, 9, 14, 9, 0);
  test("a task reminds from its own reminder date, even when it is due much later", () => {
    const reminders = deriveReminders([{ id: "a", title: "Book flight", dueDate: "2026-12-01", remindOn: "2026-10-14" }], now);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ id: "a:remind:2026-10-14", kind: "soon", taskId: "a" });
    expect(reminders[0].title).toMatch(/Reminder/u);
  });
  test("a reminder date in the future, or for a finished task, does nothing", () => {
    expect(deriveReminders([{ id: "a", title: "x", dueDate: "2026-12-01", remindOn: "2026-10-20" }], now)).toEqual([]);
    expect(deriveReminders([{ id: "a", title: "x", remindOn: "2026-10-10", completed: true }], now)).toEqual([]);
  });
  test("a reminder date from long ago is ignored, so old data does not nag", () => {
    expect(deriveReminders([{ id: "a", title: "x", remindOn: "2026-08-01" }], now)).toEqual([]);
  });
  test("a task with both a reminder and an upcoming due date gives two distinct reminders", () => {
    const reminders = deriveReminders([{ id: "a", title: "x", dueDate: "2026-10-15", remindOn: "2026-10-13" }], now);
    expect(new Set(reminders.map((reminder) => reminder.id)).size).toBe(2);
  });
});
