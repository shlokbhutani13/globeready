import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "../pages/DashboardPage";
import NextStepsPage from "../pages/NextStepsPage";
import { LIFE_EVENT, lifeSteps, loadLifeSignals } from "../lib/life-signals";
import { buildNextSteps, snoozeItem } from "../lib/next-steps";
import { saveReadiness, setMark } from "../lib/document-readiness";
import { emptyBudget, saveBudget, upsertItem } from "../lib/budget";
import { saveCard, setInclude, setValue, cleanCard } from "../lib/emergency-card";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const blankReadiness = { marks: {}, custom: [] };

describe("life signals", () => {
  it("starts with only two gentle suggestions and nothing marked", () => {
    const signals = loadLifeSignals(memory(), "u", { now });
    expect(signals).toMatchObject({ missing: [], review: [], typedDates: [], budgetEmpty: true, cardStarted: false });
    expect(lifeSteps(signals).map((step) => step.id)).toEqual(["life:budget-empty", "life:card-empty"]);
    expect(lifeSteps(signals).every((step) => step.kind === "suggestion" && /no deadline/u.test(step.reason))).toBe(true);
    expect(lifeSteps(null)).toEqual([]);
  });
  it("summarises missing and review documents in one step each, with only what the student entered", () => {
    const store = memory();
    let state = setMark(blankReadiness, "passport", { status: "missing" });
    for (const id of ["visa", "i20", "i94", "admission"]) state = setMark(state, id, { status: "missing" });
    state = setMark(state, "lease", { status: "review" });
    saveReadiness(store, "u", state);
    const steps = lifeSteps(loadLifeSignals(store, "u", { now }));
    const missing = steps.find((step) => step.id.startsWith("life:docs-missing"));
    expect(missing.title).toBe("Find 5 documents you marked as missing");
    expect(missing.reason).toContain("and 2 more");
    expect(missing.reason).toContain("only reflects what you entered");
    expect(steps.find((step) => step.id.startsWith("life:docs-review")).title).toBe("Look again at 1 document you marked for review");
  });
  it("does not repeat Key dates: dates for passport, visa and I-20 produce no document step", () => {
    const store = memory();
    saveReadiness(store, "u", setMark(blankReadiness, "passport", { status: "have" }));
    const signals = loadLifeSignals(store, "u", { keyDates: [{ kind: "passport", date: "2026-11-01" }], now });
    expect(signals.typedDates).toEqual([]);
    expect(lifeSteps(signals).some((step) => step.kind === "documents")).toBe(false);
  });
  it("adds a step only for a typed expiry that is coming up or has passed", () => {
    const store = memory();
    saveReadiness(store, "u", setMark(setMark(blankReadiness, "work-card", { status: "have", expiry: "2026-11-20" }), "tax-forms", { status: "have" }));
    const steps = lifeSteps(loadLifeSignals(store, "u", { now }));
    const dated = steps.find((step) => step.id.startsWith("life:doc-date"));
    expect(dated.reason).toBe("The date you entered, 2026-11-20, is in 37 days. Check the document itself.");
    expect(dated.rank).toBe(3);
  });
  it("hides the suggestions once the budget has a cost and the card has something chosen", () => {
    const store = memory();
    saveBudget(store, "u", upsertItem(emptyBudget(now), { label: "Rent", category: "housing", kind: "recurring", frequency: "monthly", amount: "1" }, "brent"), now);
    saveCard(store, "u", setInclude(setValue(cleanCard(null), "allergies", "x"), "allergies", true));
    expect(lifeSteps(loadLifeSignals(store, "u", { now }))).toEqual([]);
  });
  it("announces changes so Home and Next steps refresh", () => {
    let fired = 0;
    const listener = () => { fired += 1; };
    window.addEventListener(LIFE_EVENT, listener);
    saveBudget(memory(), "u", emptyBudget(now), now);
    snoozeItem(memory(), "u", "x", 1, now);
    window.removeEventListener(LIFE_EVENT, listener);
    expect(fired).toBe(2);
  });
});

describe("merging into next steps", () => {
  it("puts document steps with the other dated items and caps all suggestions at three", () => {
    const extra = lifeSteps({ missing: ["Passport"], review: [], typedDates: [], budgetEmpty: true, cardStarted: false });
    const steps = buildNextSteps({ tasks: [{ id: "t", title: "Pay fee", dueDate: "2026-10-16" }], now, profile: { visaType: "F-1" }, extra });
    const kinds = steps.map((step) => step.kind);
    expect(kinds.slice(0, 2)).toEqual(["task", "documents"]);
    const suggestions = steps.filter((step) => step.kind === "suggestion");
    expect(suggestions).toHaveLength(3);
    expect(suggestions.slice(0, 2).map((step) => step.id)).toEqual(["life:budget-empty", "life:card-empty"]);
    expect(suggestions[2].id.startsWith("journey:")).toBe(true);
  });
  it("shows a life step on the page with a link to where it can be done", () => {
    const extra = lifeSteps({ missing: ["Passport"], review: [], typedDates: [], budgetEmpty: false, cardStarted: true });
    render(<MemoryRouter><NextStepsPage tasks={[]} dates={[]} profile={{}} now={now} extra={extra} storage={memory()} storageScope="u" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Find 1 document you marked as missing" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open documents checklist: Find 1 document you marked as missing" }).getAttribute("href")).toBe("/life/documents");
  });
});

describe("Home", () => {
  it("shows the number of open next steps and consolidated links, without duplicating Plan pages", () => {
    render(<MemoryRouter><DashboardPage zeroCostMode profile={{}} tasks={[]} keyDates={[]} nextStepCount={3} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Your next steps (3)" }).getAttribute("href")).toBe("/next");
    expect(screen.getByRole("link", { name: "Arrival and daily life" }).getAttribute("href")).toBe("/life");
    expect(screen.getByRole("link", { name: "Documents checklist" }).getAttribute("href")).toBe("/life/documents");
    for (const name of ["Journey planner", "Cases", "Travel readiness", "Contacts"]) expect(screen.queryByRole("link", { name })).toBeNull();
  });
  it("shows a plain link when nothing is waiting", () => {
    render(<MemoryRouter><DashboardPage zeroCostMode profile={{}} tasks={[]} keyDates={[]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Your next steps" })).toBeTruthy();
  });
});
