import { describe, expect, test } from "vitest";
import { deriveDateReminders, keyDateStatus, upcomingDates } from "../lib/key-dates";

const now = new Date(2026, 9, 14);
const dates = [
  { id: "p", label: "Passport", kind: "passport", date: "2026-12-01", remindDays: 90 },
  { id: "v", label: "Visa", kind: "visa", date: "2028-01-01", remindDays: 30 },
  { id: "l", label: "Lease", kind: "lease", date: "2026-10-10", remindDays: 14 },
  { id: "o", label: "Old", kind: "other", date: "2026-01-01", remindDays: 30 },
];

describe("key dates", () => {
  test("statuses use the date typed in and the student's own reminder window", () => {
    expect(keyDateStatus(dates[0], now)).toMatchObject({ days: 48, kind: "soon", label: "In 48 days" });
    expect(keyDateStatus(dates[1], now).kind).toBe("later");
    expect(keyDateStatus(dates[2], now)).toMatchObject({ kind: "passed", label: "Passed 4 days ago" });
    expect(keyDateStatus({ date: "bad" }, now)).toBeNull();
  });

  test("reminders cover dates inside their window and recent misses, not far-future or long-passed ones", () => {
    const reminders = deriveDateReminders(dates, now);
    expect(reminders.map((r) => r.id)).toEqual(["date:l:2026-10-10", "date:p:2026-12-01"]);
    expect(reminders[1].body).toMatch(/date you entered/);
  });

  test("home shows the nearest dates first, capped", () => {
    expect(upcomingDates(dates, now, { limit: 2 }).map(({ entry }) => entry.id)).toEqual(["l", "p"]);
  });
});
