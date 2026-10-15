import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NextStepsPage from "../pages/NextStepsPage";
import { buildNextSteps, clearNextStepsDeviceData, loadSnoozes, snoozeItem, splitSnoozed, unsnoozeItem, weeklySummary, weeklyText } from "../lib/next-steps";

afterEach(cleanup);
const now = new Date(2026, 9, 14, 12); // 2026-10-14 local
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const tasks = [
  { id: "t1", title: "Renew passport photo", dueDate: "2026-10-10" },
  { id: "t2", title: "Buy insurance", dueDate: "2026-10-16" },
  { id: "t3", title: "Far future", dueDate: "2027-05-01" },
  { id: "t4", title: "Done already", dueDate: "2026-10-12", completed: true },
  { id: "t5", title: "Call bank", dueDate: "2026-12-01", remindOn: "2026-10-13" },
];
const dates = [
  { id: "d1", label: "Passport expires", date: "2026-11-01", remindDays: 30, kind: "passport" },
  { id: "c1", caseId: "k", label: "OPT: appointment", date: "2026-10-20", remindDays: 14, kind: "other" },
  { id: "d2", label: "Lease ends", date: "2027-08-01", remindDays: 30, kind: "lease" },
];

describe("buildNextSteps", () => {
  const steps = buildNextSteps({ tasks, dates, profile: { visaType: "F-1" }, now });
  it("ranks past-date items first, then soon, then later, then suggestions", () => {
    const kinds = steps.map((step) => step.kind);
    expect(kinds[0]).toBe("overdue");
    expect(steps[0].title).toBe("Renew passport photo");
    expect(kinds.lastIndexOf("case")).toBeLessThan(kinds.indexOf("suggestion"));
    expect(kinds.slice(kinds.indexOf("suggestion")).every((kind) => kind === "suggestion")).toBe(true);
  });
  it("leaves out completed tasks and far-off items", () => {
    const titles = steps.map((step) => step.title);
    expect(titles).not.toContain("Done already");
    expect(titles).not.toContain("Far future");
    expect(titles).not.toContain("Lease ends");
  });
  it("gives a plain reason for each item and never calls anything a legal deadline", () => {
    for (const step of steps) expect(step.reason.length, step.id).toBeGreaterThan(20);
    expect(JSON.stringify(steps.map((step) => step.reason))).not.toMatch(/legal deadline|you must|required by law/iu);
    expect(steps.find((step) => step.kind === "date").reason).toContain("Confirm it against your official document");
    expect(steps.find((step) => step.kind === "suggestion").reason).toContain("no deadline");
  });
  it("includes reminder-date tasks and case dates", () => {
    expect(steps.find((step) => step.kind === "reminder").title).toBe("Call bank");
    expect(steps.find((step) => step.kind === "case").reason).toContain("for this case");
  });
  it("suggests at most three journey steps and skips ones already planned", () => {
    const suggestions = steps.filter((step) => step.kind === "suggestion");
    expect(suggestions).toHaveLength(3);
    const first = suggestions[0].item;
    const again = buildNextSteps({ tasks: [{ id: "x", title: first.title }], journeyHave: [suggestions[1].item.id], now, profile: { visaType: "F-1" } }).filter((step) => step.kind === "suggestion").map((step) => step.item.id);
    expect(again).not.toContain(first.id);
    expect(again).not.toContain(suggestions[1].item.id);
  });
  it("makes a rescheduled task a new item", () => {
    const a = buildNextSteps({ tasks: [{ id: "t", title: "X", dueDate: "2026-10-15" }], now, suggestionLimit: 0 })[0].id;
    const b = buildNextSteps({ tasks: [{ id: "t", title: "X", dueDate: "2026-10-16" }], now, suggestionLimit: 0 })[0].id;
    expect(a).not.toBe(b);
  });
});

describe("snoozing", () => {
  it("hides until the date, expires, restores, and ignores bad storage", () => {
    const store = memory();
    let snoozes = snoozeItem(store, "u", "task:a", 3, now);
    expect(snoozes["task:a"]).toBe("2026-10-17");
    expect(Object.keys(loadSnoozes(store, "u", now))).toEqual(["task:a"]);
    expect(loadSnoozes(store, "u", new Date(2026, 9, 17, 9))).toEqual({});
    const { active, snoozed } = splitSnoozed([{ id: "task:a" }, { id: "task:b" }], snoozes);
    expect(active.map((s) => s.id)).toEqual(["task:b"]);
    expect(snoozed[0].until).toBe("2026-10-17");
    snoozes = unsnoozeItem(store, "u", "task:a", now);
    expect(snoozes).toEqual({});
    snoozeItem(store, "u", "task:z", 1, now);
    clearNextStepsDeviceData(store, "u");
    expect(loadSnoozes(store, "u", now)).toEqual({});
    const bad = { getItem: () => "[1,2", setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(loadSnoozes(bad, "u", now)).toEqual({});
    expect(() => snoozeItem(bad, "u", "a", 1, now)).not.toThrow();
  });
});

describe("weekly summary", () => {
  it("groups the next seven days and lists past items separately", () => {
    const week = weeklySummary({ tasks, dates, now });
    expect(week.days).toHaveLength(7);
    expect(week.days[0].label).toBe("Today (2026-10-14)");
    expect(week.days[2].items.map((i) => i.title)).toEqual(["Buy insurance"]);
    expect(week.days[6].items.map((i) => i.title)).toEqual(["OPT: appointment"]);
    expect(week.overdue.map((i) => i.title)).toContain("Renew passport photo");
    expect(week.total).toBe(2);
    const text = weeklyText(week);
    expect(text).toContain("not official deadlines");
    expect(text).toContain("- Buy insurance");
  });
  it("says so when nothing is scheduled", () => {
    expect(weeklyText(weeklySummary({ now }))).toContain("Nothing is scheduled this week.");
  });
});

describe("NextStepsPage", () => {
  const renderPage = (props = {}) => render(<MemoryRouter><NextStepsPage tasks={tasks} dates={dates} profile={{ visaType: "F-1" }} now={now} storage={memory()} storageScope="u" {...props} /></MemoryRouter>);
  it("lists numbered steps with a reason, an action and an informational notice", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Your next steps" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Next steps in order" });
    expect(within(list).getAllByRole("listitem")[0].textContent).toContain("Renew passport photo");
    expect(screen.getByText(/Neither is a legal deadline/u)).toBeTruthy();
  });
  it("marks a task done with one tap and reports it", async () => {
    const onToggleTask = vi.fn().mockResolvedValue();
    renderPage({ onToggleTask });
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Renew passport photo" }));
    await screen.findByText(/Marked “Renew passport photo” done/u);
    expect(onToggleTask).toHaveBeenCalledWith("t1");
  });
  it("shows failures in plain words", async () => {
    renderPage({ onToggleTask: vi.fn().mockRejectedValue(new Error("Sign in to add tasks.")) });
    fireEvent.click(screen.getByRole("button", { name: "Mark done: Renew passport photo" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in");
  });
  it("adds a suggestion as a task", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    renderPage({ onAddTasks });
    fireEvent.click(screen.getAllByRole("button", { name: /^Add as task:/u })[0]);
    await screen.findByText(/to your tasks/u);
    expect(onAddTasks.mock.calls[0][0][0].id).toMatch(/^(gen|f1)-/u);
  });
  it("snoozes an item, lists it as snoozed, and shows it again", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Snooze: Renew passport photo"), { target: { value: "3" } });
    expect(screen.getByRole("heading", { name: /Snoozed \(1\)/u })).toBeTruthy();
    expect(screen.getByText(/Hidden until 2026-10-17/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show again: Renew passport photo" }));
    expect(screen.queryByRole("heading", { name: /Snoozed/u })).toBeNull();
  });
  it("switches to the weekly view with a copyable summary", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "This week" }));
    expect(screen.getByRole("heading", { level: 2, name: "This week" })).toBeTruthy();
    expect(screen.getByText("Today (2026-10-14)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Copy this week/u })).toBeTruthy();
  });
  it("explains an empty list", () => {
    renderPage({ tasks: [], dates: [], profile: {}, now, storage: memory() });
    expect(screen.queryByText("Nothing needs your attention right now")).toBeNull(); // suggestions still appear
  });
  it("explains when nothing at all is due and suggestions are used up", () => {
    const all = buildNextSteps({ now, profile: {}, suggestionLimit: 99 }).map((s) => s.item.id);
    renderPage({ tasks: [], dates: [], profile: {}, journeyHave: all });
    expect(screen.getByText("Nothing needs your attention right now")).toBeTruthy();
  });
});
