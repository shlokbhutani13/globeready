import { describe, expect, test } from "vitest";
import { createReminderReadStore, daysUntil, deriveReminders, dueStatus, localDateKey } from "../lib/reminders";

const now = new Date(2026, 9, 14, 23, 30);

describe("in-app reminders", () => {
  test("use the student's local calendar day", () => {
    expect(localDateKey(now)).toBe("2026-10-14");
    expect(daysUntil("2026-10-14", now)).toBe(0);
    expect(daysUntil("2026-10-15", now)).toBe(1);
    expect(daysUntil("not a date", now)).toBeNull();
  });

  test("describe overdue, today, tomorrow, and later tasks; ignore completed or undated tasks", () => {
    expect(dueStatus({ dueDate: "2026-10-12" }, now)).toMatchObject({ kind: "overdue", label: "Overdue by 2 days" });
    expect(dueStatus({ dueDate: "2026-10-13" }, now).label).toBe("Overdue by 1 day");
    expect(dueStatus({ dueDate: "2026-10-14" }, now).label).toBe("Due today");
    expect(dueStatus({ dueDate: "2026-10-15" }, now).label).toBe("Due tomorrow");
    expect(dueStatus({ dueDate: "2026-10-20" }, now).label).toBe("Due in 6 days");
    expect(dueStatus({ dueDate: "2026-10-14", completed: true }, now)).toBeNull();
    expect(dueStatus({ dueDate: "" }, now)).toBeNull();
  });

  test("remind about overdue tasks and tasks due within three days, most urgent first", () => {
    const reminders = deriveReminders([
      { id: "a", title: "Renew passport", dueDate: "2026-10-16" },
      { id: "b", title: "Pay SEVIS fee", dueDate: "2026-10-10" },
      { id: "c", title: "Far away", dueDate: "2026-12-01" },
      { id: "d", title: "Done", dueDate: "2026-10-14", completed: true },
    ], now);
    expect(reminders.map((reminder) => reminder.taskId)).toEqual(["b", "a"]);
    expect(reminders[0]).toMatchObject({ id: "b:2026-10-10", kind: "overdue" });
  });

  test("remember read reminders per account on this device, and treat a new due date as unread", () => {
    const values = new Map();
    const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const store = createReminderReadStore("maya", storage);
    store.markRead(["a:2026-10-16"]);
    expect(store.read().has("a:2026-10-16")).toBe(true);
    expect(store.read().has("a:2026-10-17")).toBe(false);
    expect(createReminderReadStore("other", storage).read().size).toBe(0);
  });
});
