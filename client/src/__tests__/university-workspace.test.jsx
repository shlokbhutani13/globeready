import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdvisingPrepPage from "../pages/AdvisingPrepPage";
import UniversityPage from "../pages/UniversityPage";
import { addCustomQuestion, addTermNote, cleanWorkspace, clearWorkspace, limits, loadWorkspace, officeDirectory, removeCustomQuestion, saveWorkspace, setQuestion } from "../lib/university-workspace";
import { buildSummary, maskReceipt, summaryText } from "../lib/appointment-summary";
import { officeQuestions } from "../data/office-questions";

afterEach(cleanup);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m }; };
const now = new Date(2026, 9, 14, 12);
const kase = { id: "k1", title: "OPT application", kind: "opt-ead", status: "filed", formNumber: "I-765", receiptNumber: "IOE0912345678", filedOn: "2026-09-01", notes: "Private worry about my employer", timeline: [{ date: "2026-10-20", type: "appointment", text: "Biometrics at the center" }, { date: "2026-09-02", type: "receipt", text: "Got the notice" }] };
const contacts = [{ id: "c1", name: "Dr. Rao", role: "dso", phone: "555-0100", email: "rao@x.edu", notes: "home number is secret" }, { id: "c2", name: "Mom", role: "personal" }];
const dates = [{ id: "d1", label: "Passport expires", date: "2027-03-01", kind: "passport" }];

describe("question bank", () => {
  it("is general: unique ids, no legal conclusions, no numbers of days", () => {
    expect(new Set(officeQuestions.map((q) => q.id)).size).toBe(officeQuestions.length);
    for (const question of officeQuestions) {
      expect(question.text.endsWith("?"), question.id).toBe(true);
      expect(question.text, question.id).not.toMatch(/\b\d+\s*days?\b|must|required to|illegal/iu);
    }
  });
});

describe("workspace storage", () => {
  it("round-trips, validates, and is scoped per account", () => {
    const store = memory();
    let w = loadWorkspace(store, "u");
    w = setQuestion(w, "rec-dates", { ask: true });
    w = addCustomQuestion(w, "  Is my insurance valid?  ", "cabc1");
    w = addTermNote(w, { label: "Orientation", date: "2026-08-20", note: "Bring ID" }, "tabc1");
    saveWorkspace(store, "u", w);
    const again = loadWorkspace(store, "u");
    expect(again.questions["rec-dates"].ask).toBe(true);
    expect(again.custom[0].text).toBe("Is my insurance valid?");
    expect(again.terms[0]).toMatchObject({ label: "Orientation", date: "2026-08-20" });
    expect(loadWorkspace(store, "other").terms).toEqual([]);
    expect(removeCustomQuestion(again, "cabc1").questions.cabc1).toBeUndefined();
    clearWorkspace(store, "u");
    expect(loadWorkspace(store, "u").terms).toEqual([]);
  });
  it("rejects bad input in plain words and survives damaged storage", () => {
    const w = loadWorkspace(memory(), "u");
    expect(() => addCustomQuestion(w, "  ")).toThrow(/Type your question/u);
    expect(() => addTermNote(w, { label: "" })).toThrow(/short name/u);
    expect(() => addTermNote(w, { label: "x", date: "2026-02-31" })).toThrow(/real date/u);
    let full = w;
    for (let i = 0; i < limits.custom; i += 1) full = addCustomQuestion(full, `q${i}`, `cq${i}aa`);
    expect(() => addCustomQuestion(full, "one more")).toThrow(/up to 10/u);
    expect(cleanWorkspace({ questions: { __proto__: 1, bogus: { ask: true }, "rec-dates": { ask: true, answer: "x".repeat(900) } }, terms: [{ id: "t!", label: "bad" }] })).toEqual({ questions: { "rec-dates": { ask: true, answer: "x".repeat(limits.answer) } }, custom: [], terms: [] });
    const broken = { getItem: () => "{oops", setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("full"); } };
    expect(loadWorkspace(broken, "u").terms).toEqual([]);
    expect(() => saveWorkspace(broken, "u", w)).toThrow(/would not save/u);
    expect(() => clearWorkspace(broken, "u")).not.toThrow();
  });
});

describe("office directory", () => {
  it("shows what is filled in and what is missing, leaving personal contacts out", () => {
    const directory = officeDirectory(contacts);
    expect(directory.slots.find((s) => s.id === "dso").contacts).toHaveLength(1);
    expect(directory.missing.map((s) => s.id)).toEqual(["international-office", "campus-safety", "insurance"]);
    expect(directory.others).toEqual([]);
  });
});

describe("appointment summary", () => {
  const data = { questions: [{ id: "rec-dates", text: "Check my dates?" }], cases: [kase], dates, terms: [{ id: "t1", label: "Orientation", date: "2026-08-20", note: "Bring ID" }], contacts };
  it("is empty until the student picks something", () => {
    expect(buildSummary({ data, now, coverage: { name: "X University" }, profile: { visaType: "F-1" } })).toMatchObject({ empty: true, sections: [] });
  });
  it("uses the student's local calendar date rather than UTC", () => {
    const lateEvening = new Date(2026, 9, 14, 23, 30);
    expect(buildSummary({ data, now: lateEvening }).header.prepared).toBe("2026-10-14");
  });
  it("masks receipt numbers and leaves case notes out by default", () => {
    const text = summaryText(buildSummary({ data, now, selection: { caseIds: ["k1"] } }));
    expect(text).not.toContain("IOE0912345678");
    expect(text).toContain(maskReceipt("IOE0912345678"));
    expect(maskReceipt("IOE0912345678")).toMatch(/^•+5678$/u);
    expect(text).not.toContain("Private worry");
    expect(text).not.toContain("Biometrics at the center");
    expect(text).toContain("Appointment: 2026-10-20");
    expect(text).not.toContain("Receipt notice: 2026-09-02");
  });
  it("shows full receipts and notes only when chosen", () => {
    const text = summaryText(buildSummary({ data, now, selection: { caseIds: ["k1"] }, options: { revealReceipts: true, includeCaseNotes: true } }));
    expect(text).toContain("IOE0912345678");
    expect(text).toContain("Private worry about my employer");
  });
  it("includes only the ticked items, with contact details but not contact notes", () => {
    const text = summaryText(buildSummary({ data, now, selection: { contactIds: ["c1"], dateIds: ["d1"], questionIds: ["rec-dates"], termIds: ["t1"] }, options: { includeProfile: true }, profile: { visaType: "F-1" }, coverage: { name: "X University" } }));
    expect(text).toContain("Dr. Rao (Designated school official (DSO)); 555-0100; rao@x.edu");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("Mom");
    expect(text).toContain("Visa type: F-1");
    expect(text).toContain("Passport expires: 2027-03-01");
    expect(text).toContain("Check my dates?");
    expect(text).toContain("has not been checked");
    expect(text).toContain("not an official record or legal advice");
  });
  it("never has a place for document contents or legal conclusions", () => {
    const text = summaryText(buildSummary({ data: { ...data, documents: [{ text: "PASSPORT NUMBER 123" }] }, now, selection: { caseIds: ["k1"], contactIds: ["c1"] } }));
    expect(text).not.toContain("PASSPORT NUMBER");
    expect(text).not.toMatch(/you (are|will be) eligible|you qualify|your deadline is/iu);
  });
});

describe("AdvisingPrepPage", () => {
  const renderPage = (extra = {}) => render(<MemoryRouter><AdvisingPrepPage profile={{ university: "X University", visaType: "F-1" }} contacts={contacts} cases={[kase]} dates={dates} now={now} storage={memory()} storageScope="u" {...extra} /></MemoryRouter>);
  it("says notes stay on this device and starts with nothing selected", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Prepare for an advising appointment" })).toBeTruthy();
    expect(screen.getByText(/saved on this device only/u)).toBeTruthy();
    expect(screen.getByText("Tick something above to see it here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download as text/u }).disabled).toBe(true);
    for (const box of within(screen.getByRole("group", { name: /More options/u })).getAllByRole("checkbox")) expect(box.checked).toBe(false);
  });
  it("walks from a question to a downloadable summary without uploading anything", () => {
    const download = vi.fn();
    renderPage({ download });
    fireEvent.click(screen.getByLabelText(/Can we check that the dates and program details/u));
    const summaryQ = within(screen.getByRole("group", { name: "Questions" })).getByRole("checkbox");
    fireEvent.click(summaryQ);
    fireEvent.click(screen.getByLabelText(/OPT application/u));
    const preview = screen.getByLabelText("Summary preview");
    expect(preview.textContent).toContain("Can we check that the dates");
    expect(preview.textContent).not.toContain("IOE0912345678");
    fireEvent.click(screen.getByLabelText(/Show full receipt numbers/u));
    expect(preview.textContent).toContain("IOE0912345678");
    fireEvent.click(screen.getByRole("button", { name: /Download as text/u }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toBe("advising-summary-2026-10-14.txt");
    expect(download.mock.calls[0][1]).toContain("QUESTIONS I WANT TO ASK");
  });
  it("adds and removes a term note and explains errors", () => {
    renderPage();
    const form = screen.getByRole("form", { name: "Add a term note" });
    fireEvent.submit(form);
    expect(screen.getByRole("alert").textContent).toContain("short name");
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Orientation" } });
    fireEvent.submit(form);
    expect(within(screen.getByRole("list", { name: "Your term notes" })).getByText("Entered by you")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove note Orientation" }));
    expect(screen.getByText("No term notes yet.")).toBeTruthy();
  });
  it("adds and removes a question of your own", () => {
    renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Add your own question" }), { target: { value: "Can I switch housing?" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add your own question" }));
    expect(screen.getAllByText("Can I switch housing?").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Remove my question: Can I switch housing?" }));
    expect(screen.queryByText("Can I switch housing?")).toBeNull();
  });
  it("prints through the browser only", () => {
    const print = vi.fn();
    renderPage({ print });
    fireEvent.click(screen.getByLabelText(/OPT application/u));
    fireEvent.click(screen.getByRole("button", { name: /Print/u }));
    expect(print).toHaveBeenCalled();
  });
});

describe("UniversityPage distinctions", () => {
  const wrap = (props) => render(<MemoryRouter><UniversityPage profile={{ university: "X University", officialUniversityDomain: "x.edu" }} {...props} /></MemoryRouter>);
  it("explains reviewed versus entered, and labels generated searches and saved links", () => {
    wrap({ savedResources: [{ id: "r", title: "My link", url: "https://x.edu/a", category: "University" }] });
    expect(screen.getByText(/Two kinds of information appear here/u)).toBeTruthy();
    expect(screen.getAllByText("Search generated by GlobeReady, not reviewed").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("list", { name: "Saved university links" })).getByText("Entered by you")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Prepare for an advising appointment" }).getAttribute("href")).toBe("/prepare");
  });
  it("shows a directory with empty slots that can be filled in", () => {
    wrap({ contacts });
    const directory = screen.getByRole("list", { name: "Office directory" });
    expect(within(directory).getByText("Dr. Rao")).toBeTruthy();
    expect(within(directory).getAllByText("Not filled in yet.")).toHaveLength(3);
    expect(within(directory).getByRole("link", { name: "Fill in Campus safety" }).getAttribute("href")).toBe("/contacts");
  });
});
