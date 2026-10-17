import { describe, expect, test, vi } from "vitest";
import { buildReminder, daysBetween, localToday, sendReminders } from "../scripts/send-push-reminders.mjs";

describe("push reminder content", () => {
  test("counts calendar days and respects a student's time zone", () => {
    expect(daysBetween("2026-10-17", "2026-10-18")).toBe(1);
    expect(daysBetween("2026-10-17", "nope")).toBeNull();
    expect(localToday("Asia/Tokyo", new Date("2026-10-17T20:00:00Z"))).toBe("2026-10-18");
    expect(localToday("Not/AZone", new Date("2026-10-17T20:00:00Z"))).toBe("2026-10-17");
  });

  test("fires on remindDays, tomorrow and today, never for the past or far future", () => {
    const todayKey = "2026-10-17";
    const reminder = buildReminder({ todayKey, keyDates: [
      { label: "Passport", date: "2026-10-27", remindDays: 30 },
      { label: "I-20 signature", date: "2026-11-16", remindDays: 30 },
      { label: "Lease", date: "2026-10-18", remindDays: 0 },
      { label: "Expired", date: "2026-10-01", remindDays: 7 },
      { label: "Later", date: "2026-12-30", remindDays: 7 },
    ], tasks: [{ title: "Pay fee", dueDate: "2026-10-17", completed: false }, { title: "Done", dueDate: "2026-10-17", completed: true }] });
    expect(reminder.body).toBe("Pay fee today. Lease tomorrow. I-20 signature in 30 days.");
    expect(reminder.title).toBe("GlobeReady: 3 things coming up");
    expect(buildReminder({ todayKey, keyDates: [], tasks: [] })).toBeNull();
  });

  test("caps the list and never includes anything but the student's own titles", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => ({ title: `Task ${i}`, dueDate: "2026-10-17", completed: false }));
    const reminder = buildReminder({ todayKey: "2026-10-17", tasks });
    expect(reminder.body).toMatch(/And 3 more\.$/);
    expect(reminder.body.length).toBeLessThanOrEqual(240);
  });
});

function fake({ tokens, dates = [], tasks = [], timeZone = "UTC", responses }) {
  const deleted = [];
  const doc = (data) => ({ data: () => data });
  const tokenDocs = tokens.map((token, index) => ({ data: () => ({ token }), ref: { parent: { parent: { id: "u1" } }, delete: async () => deleted.push(index) } }));
  const user = { get: async () => doc({ timeZone }), collection: (name) => ({ get: async () => ({ docs: (name === "trackedDates" ? dates : tasks).map(doc) }) }) };
  const firestore = { collectionGroup: () => ({ get: async () => ({ docs: tokenDocs }) }), collection: () => ({ doc: () => user }) };
  const messaging = { sendEach: vi.fn(async (messages) => ({ responses: responses || messages.map(() => ({ success: true })) })) };
  return { firestore, messaging, deleted };
}

describe("sendReminders", () => {
  const now = new Date("2026-10-17T15:00:00Z");
  test("sends data-only messages to every device of a student with something due", async () => {
    const { firestore, messaging } = fake({ tokens: ["a".repeat(30), "b".repeat(30)], tasks: [{ title: "Pay fee", dueDate: "2026-10-17", completed: false }] });
    const result = await sendReminders({ firestore, messaging, now, log: () => {} });
    expect(result).toEqual({ students: 1, sent: 2, removed: 0 });
    const [messages] = messaging.sendEach.mock.calls[0];
    expect(messages).toHaveLength(2);
    expect(messages[0].data).toEqual({ title: "GlobeReady reminder", body: "Pay fee today.", tag: "globeready-2026-10-17" });
    expect(messages[0].notification).toBeUndefined();
  });

  test("sends nothing when nothing is due, and removes dead addresses", async () => {
    const quiet = fake({ tokens: ["a".repeat(30)] });
    expect(await sendReminders({ ...quiet, now, log: () => {} })).toEqual({ students: 0, sent: 0, removed: 0 });
    expect(quiet.messaging.sendEach).not.toHaveBeenCalled();
    const dead = fake({ tokens: ["a".repeat(30), "b".repeat(30)], tasks: [{ title: "Pay fee", dueDate: "2026-10-17", completed: false }], responses: [{ success: true }, { success: false, error: { code: "messaging/registration-token-not-registered" } }] });
    expect(await sendReminders({ ...dead, now, log: () => {} })).toEqual({ students: 1, sent: 1, removed: 1 });
    expect(dead.deleted).toEqual([1]);
  });
});
