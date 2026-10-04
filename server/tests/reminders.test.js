import { describe, expect, test } from "vitest";

import { createReminderService } from "../src/reminders.js";
import { createDemoStore } from "../src/store.js";

const clockAt = (iso) => () => new Date(iso);

describe("createReminderService", () => {
  test("creates one UID-scoped notification for a task due today or earlier", async () => {
    const store = createDemoStore();
    const task = await store.tasks.create("student-a", {
      title: "Pay the SEVIS fee",
      dueDate: "2026-08-01",
      completed: false,
    });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-01T12:00:00Z") });

    const created = await reminders.sync("student-a");

    expect(created).toHaveLength(1);
    expect(created[0].taskId).toBe(task.id);
    expect(created[0].type).toBe("task-reminder");
    expect(created[0].read).toBe(false);

    const stored = await store.notifications.list("student-a");
    expect(stored).toHaveLength(1);
  });

  test("does not create a reminder before the due date", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", {
      title: "Renew passport",
      dueDate: "2026-09-01",
      completed: false,
    });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-01T12:00:00Z") });

    const created = await reminders.sync("student-a");

    expect(created).toHaveLength(0);
  });

  test("never reminds for a completed task", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", {
      title: "Upload health insurance waiver",
      dueDate: "2026-08-01",
      completed: true,
    });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-05T12:00:00Z") });

    const created = await reminders.sync("student-a");

    expect(created).toHaveLength(0);
  });

  test("is due-once: never creates a second reminder for the same task", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", {
      title: "Review airport transportation",
      dueDate: "2026-08-01",
      completed: false,
    });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-02T12:00:00Z") });

    const first = await reminders.sync("student-a");
    const second = await reminders.sync("student-a");

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(await store.notifications.list("student-a")).toHaveLength(1);
  });

  test("keeps reminders isolated between users", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", { title: "A's task", dueDate: "2026-08-01", completed: false });
    await store.tasks.create("student-b", { title: "B's task", dueDate: "2026-08-01", completed: false });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-01T12:00:00Z") });

    await reminders.sync("student-a");

    expect(await store.notifications.list("student-a")).toHaveLength(1);
    expect(await store.notifications.list("student-b")).toHaveLength(0);
  });

  test("is timezone-safe: a task due 'today' in the student's timezone is not reminded a day early in UTC", async () => {
    const store = createDemoStore();
    await store.profiles.set("student-a", { timeZone: "Pacific/Kiritimati" });
    await store.tasks.create("student-a", { title: "Submit CPT request", dueDate: "2026-08-02", completed: false });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-01T23:00:00Z") });

    const created = await reminders.sync("student-a");

    expect(created).toHaveLength(1);
  });

  test("falls back to UTC when no timezone is stored", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", { title: "Check visa status", dueDate: "2026-08-01", completed: false });
    const reminders = createReminderService({ store, clock: clockAt("2026-08-01T00:30:00Z") });

    const created = await reminders.sync("student-a");

    expect(created).toHaveLength(1);
  });
});
