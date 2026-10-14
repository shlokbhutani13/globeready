import { describe, expect, test, vi } from "vitest";
import { buildIcs, downloadIcs, escapeText, foldLine } from "../lib/ics";

const now = new Date("2026-10-14T12:00:00Z");

describe("calendar export", () => {
  test("skips impossible calendar dates instead of rolling them into another month", () => {
    const result = buildIcs({
      tasks: [{ id: "invalid", title: "Impossible", dueDate: "2026-02-31" }],
      dates: [{ id: "leap", label: "Valid leap day", date: "2028-02-29", remindDays: 30 }],
      now: new Date("2026-10-14T12:00:00Z"),
    });

    expect(result.count).toBe(1);
    expect(result.text).not.toContain("Impossible");
    expect(result.text).toContain("DTSTART;VALUE=DATE:20280229");
  });

  test("builds an all-day event per open task and per key date, with CRLF endings", () => {
    const { text, count } = buildIcs({
      now,
      tasks: [
        { id: "t1", title: "Pay SEVIS fee, then upload receipt", dueDate: "2026-11-01", category: "Immigration", priority: "high" },
        { id: "t2", title: "Done already", dueDate: "2026-11-02", completed: true },
        { id: "t3", title: "No date" },
      ],
      dates: [{ id: "d1", label: "Passport expires", date: "2028-03-01", remindDays: 90, notes: "renew early" }],
    });
    expect(count).toBe(2);
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("UID:task-t1@globeready");
    expect(text).toContain("DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102");
    expect(text).toContain("SUMMARY:Pay SEVIS fee\\, then upload receipt");
    expect(text).toContain("TRIGGER:-P90D");
    expect(text).not.toContain("Done already");
    expect(text).not.toContain("No date");
    expect(text.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  test("escapes special characters and folds long lines at 75 octets", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe(String.raw`a\;b\,c\\d\ne`);
    const folded = foldLine(`SUMMARY:${"é".repeat(80)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((line, index) => (index ? line.slice(1) : line)).join("")).toBe(`SUMMARY:${"é".repeat(80)}`);
  });

  test("skips invalid dates and can include completed tasks on request", () => {
    const tasks = [{ id: "a", title: "Bad", dueDate: "2026-13-45" }, { id: "b", title: "Done", dueDate: "2026-11-02", completed: true }];
    expect(buildIcs({ now, tasks }).count).toBe(0);
    expect(buildIcs({ now, tasks, includeCompleted: true }).count).toBe(1);
  });

  test("downloads without any network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const click = vi.fn();
    const anchor = { click, remove: vi.fn() };
    const documentImpl = { createElement: () => anchor, body: { append: vi.fn() } };
    const urlImpl = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() };
    downloadIcs(buildIcs({ now, tasks: [] }), { documentImpl, urlImpl });
    expect(anchor.download).toBe("globeready-deadlines.ics");
    expect(click).toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
