import { describe, expect, test } from "vitest";
import { caseDates, caseKinds, caseStatuses, caseSummary, entryTypes, validCase, validEntry, validTimeline, withEntry, withoutEntry, maxTimeline } from "../lib/cases";
import { deriveDateReminders, upcomingDates } from "../lib/key-dates";
import { buildIcs } from "../lib/ics";

const base = { title: "OPT application", kind: "opt-ead" };

describe("case validation", () => {
  test("keeps only what was entered and defaults to preparing", () => {
    expect(validCase(base)).toEqual({ title: "OPT application", kind: "opt-ead", status: "preparing", timeline: [] });
    expect(validCase({ ...base, formNumber: " I-765 ", receiptNumber: "ioe 123 456 7890", filedOn: "2026-10-01", notes: " n " }))
      .toMatchObject({ formNumber: "I-765", receiptNumber: "IOE1234567890", filedOn: "2026-10-01", notes: "n" });
  });
  test("explains each refusal in plain words", () => {
    expect(() => validCase({ ...base, title: " " })).toThrow(/name/iu);
    expect(() => validCase({ ...base, title: "x".repeat(121) })).toThrow(/name/iu);
    expect(() => validCase({ ...base, kind: "visa-lottery" })).toThrow(/kind of case/iu);
    expect(() => validCase({ ...base, status: "approved" })).toThrow(/status/iu);
    expect(() => validCase({ ...base, filedOn: "2026-02-31" })).toThrow(/real date/iu);
    expect(() => validCase({ ...base, receiptNumber: "12 34!" })).toThrow(/receipt number/iu);
    expect(() => validCase({ ...base, notes: "n".repeat(1001) })).toThrow(/1000/u);
  });
  test("offers every kind, status and entry type", () => {
    expect(caseKinds.length).toBeGreaterThanOrEqual(6);
    expect(caseStatuses.map((status) => status.id)).toEqual(["preparing", "filed", "receipt-received", "biometrics", "evidence-requested", "interview", "decision-received", "closed"]);
    expect(entryTypes.map((type) => type.id)).toEqual(["status", "receipt", "appointment", "rfe-received", "rfe-due", "note"]);
  });
});

describe("history entries", () => {
  test("need a real date and a known type; status entries need a status; notes need text", () => {
    expect(validEntry({ date: "2026-10-05", type: "appointment", text: " biometrics at 9am " })).toEqual({ date: "2026-10-05", type: "appointment", text: "biometrics at 9am" });
    expect(() => validEntry({ date: "soon", type: "note", text: "x" })).toThrow(/date/iu);
    expect(() => validEntry({ date: "2026-10-05", type: "magic" })).toThrow(/kind of entry/iu);
    expect(() => validEntry({ date: "2026-10-05", type: "status" })).toThrow(/new status/iu);
    expect(() => validEntry({ date: "2026-10-05", type: "note" })).toThrow(/short note/iu);
    expect(() => validEntry({ date: "2026-10-05", type: "note", text: "x".repeat(301) })).toThrow(/300/u);
  });
  test("are kept in date order and bounded", () => {
    const timeline = validTimeline([{ date: "2026-10-09", type: "note", text: "b" }, { date: "2026-10-01", type: "note", text: "a" }]);
    expect(timeline.map((entry) => entry.text)).toEqual(["a", "b"]);
    expect(() => validTimeline(Array.from({ length: maxTimeline + 1 }, () => ({ date: "2026-10-01", type: "note", text: "x" })))).toThrow(/up to 40/u);
    expect(() => validTimeline("nope")).toThrow(/list/iu);
  });
  test("a status entry becomes the current status; receipts and evidence notices move it along", () => {
    const record = validCase(base);
    expect(withEntry(record, { date: "2026-10-02", type: "status", status: "filed" }).status).toBe("filed");
    expect(withEntry({ ...record, status: "filed" }, { date: "2026-10-09", type: "receipt" }).status).toBe("receipt-received");
    expect(withEntry({ ...record, status: "interview" }, { date: "2026-10-09", type: "receipt" }).status).toBe("interview");
    expect(withEntry({ ...record, status: "filed" }, { date: "2026-10-12", type: "rfe-received" }).status).toBe("evidence-requested");
    expect(withEntry({ ...record, status: "closed" }, { date: "2026-10-12", type: "rfe-received" }).status).toBe("closed");
    expect(withEntry(record, { date: "2026-10-12", type: "appointment" }).status).toBe("preparing");
  });
  test("can drop an entry by position and refuses a missing one", () => {
    const record = withEntry(validCase(base), { date: "2026-10-02", type: "note", text: "a" });
    expect(withoutEntry(record, 0).timeline).toEqual([]);
    expect(() => withoutEntry(record, 3)).toThrow(/no longer exists/iu);
  });
});

describe("dates that come from cases", () => {
  const now = new Date(2026, 9, 14);
  const record = { id: "c1", ...validCase({ ...base, status: "evidence-requested", timeline: [
    { date: "2026-10-20", type: "appointment", text: "Biometrics, bring ID" },
    { date: "2026-11-30", type: "rfe-due" },
    { date: "2026-10-01", type: "note", text: "n" },
    { date: "2026-10-10", type: "rfe-received" },
  ] }) };
  test("appointments and evidence deadlines become key-date style entries; notes do not", () => {
    const dates = caseDates([record]);
    expect(dates.map((entry) => entry.date)).toEqual(["2026-10-20", "2026-11-30"]);
    expect(dates[0]).toMatchObject({ caseId: "c1", remindDays: 14, label: "OPT application: appointment" });
    expect(dates[1].label).toBe("OPT application: evidence response due");
  });
  test("closed cases and decided cases stop reminding", () => {
    expect(caseDates([{ ...record, status: "closed" }])).toEqual([]);
    expect(caseDates([{ ...record, status: "decision-received" }])).toEqual([]);
  });
  test("work with reminders, the Home list and the calendar file", () => {
    const dates = caseDates([record]);
    expect(deriveDateReminders(dates, now).map((reminder) => reminder.title)).toEqual(["OPT application: appointment: in 6 days"]);
    expect(upcomingDates(dates, now)[0].entry.caseId).toBe("c1");
    const { text, count } = buildIcs({ dates, now: new Date("2026-10-14T00:00:00Z") });
    expect(count).toBe(2);
    expect(text).toContain("SUMMARY:OPT application: appointment");
  });
  test("summarises the last entry and the next dated event, and says if the case is open", () => {
    const summary = caseSummary(record, now);
    expect(summary.lastEntry.date).toBe("2026-11-30");
    expect(summary.next.entry.date).toBe("2026-10-20");
    expect(summary.next.days).toBe(6);
    expect(summary.open).toBe(true);
    expect(caseSummary({ id: "x", timeline: [], status: "closed" }, now)).toMatchObject({ lastEntry: null, next: null, open: false });
  });
});
