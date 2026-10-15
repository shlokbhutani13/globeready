import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EmergencyCardPage from "../pages/EmergencyCardPage";
import { buildCard, cardText, cleanCard, clearCard, loadCard, saveCard, setInclude, setOption, setValue, toggleContact } from "../lib/emergency-card";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m }; };
const contacts = [{ id: "c1", name: "Dr. Rao", role: "dso", phone: "555-0100", email: "rao@x.edu", notes: "private note" }, { id: "c2", name: "Campus Safety", role: "campus-safety", phone: "555-0111" }, { id: "c3", name: "Mom", role: "personal", phone: "555-0199" }];
const empty = cleanCard(null);
const filled = () => {
  let c = empty;
  c = setValue(c, "fullName", "Maya Singh"); c = setValue(c, "allergies", "Penicillin"); c = setValue(c, "insuranceMemberId", "ABC123456"); c = setValue(c, "embassyPhone", "555-0300");
  return c;
};

describe("emergency card logic", () => {
  it("puts nothing on the card until it is ticked", () => {
    const built = buildCard({ card: filled(), profile: { university: "X University" }, contacts, now });
    expect(built.empty).toBe(true);
    expect(cardText(built)).not.toContain("Penicillin");
  });
  it("includes only ticked fields, contacts and options", () => {
    let c = setInclude(filled(), "allergies", true);
    c = setInclude(c, "embassyPhone", true);
    c = setOption(c, "university", true); c = setOption(c, "usNumber", true);
    c = toggleContact(c, "c1");
    const text = cardText(buildCard({ card: c, profile: { university: "X University" }, contacts, now }));
    expect(text).toContain("Allergies: Penicillin");
    expect(text).toContain("Embassy or consulate phone: 555-0300");
    expect(text).toContain("University: X University");
    expect(text).toContain("call 911");
    expect(text).toContain("Dr. Rao (Designated school official (DSO)); 555-0100; rao@x.edu");
    expect(text).not.toContain("private note");
    expect(text).not.toContain("Maya Singh");
    expect(text).not.toContain("ABC123456");
    expect(text).not.toContain("Mom");
  });
  it("ignores a tick when the field is empty and a contact that no longer exists", () => {
    const c = toggleContact(setInclude(empty, "allergies", true), "gone");
    expect(buildCard({ card: c, contacts, now }).empty).toBe(true);
  });
  it("limits listed contacts", () => {
    let c = empty;
    for (let i = 0; i < 8; i += 1) c = toggleContact(c, `id${i}`);
    expect(() => toggleContact(c, "one-more")).toThrow(/up to 8/u);
    expect(toggleContact(c, "id0").contactIds).toHaveLength(7);
  });
  it("round-trips per account, trims and validates, survives blocked storage, and can be erased", () => {
    const store = memory();
    saveCard(store, "u", setValue(setInclude(empty, "allergies", true), "allergies", `  ${"x".repeat(900)} `));
    expect(loadCard(store, "u").values.allergies).toHaveLength(300);
    expect(loadCard(store, "other")).toEqual(empty);
    expect(cleanCard({ values: { bogus: "x" }, include: { bogus: true }, options: { x: true }, contactIds: [1, "a", "a"] })).toEqual({ ...empty, contactIds: ["a"] });
    clearCard(store, "u");
    expect(store._m.size).toBe(0);
    const blocked = { getItem: () => "{oops", setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(loadCard(blocked, "u")).toEqual(empty);
    expect(() => saveCard(blocked, "u", empty)).toThrow(/would not save/u);
    expect(() => clearCard(blocked, "u")).not.toThrow();
  });
});

describe("EmergencyCardPage", () => {
  const renderPage = (extra = {}) => render(<MemoryRouter><EmergencyCardPage profile={{ university: "X University" }} contacts={contacts} storage={extra.storage || memory()} storageScope="u" now={now} {...extra} /></MemoryRouter>);
  const type = (label, value) => { const input = screen.getByLabelText(label, { selector: "input,textarea" }); fireEvent.change(input, { target: { value } }); fireEvent.blur(input); };
  it("is private by default and explains the risk of sharing a card", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Emergency card" })).toBeTruthy();
    expect(screen.getByText(/saved in this browser only/iu)).toBeTruthy();
    expect(screen.getByText(/Anyone who sees a printed or downloaded card/u)).toBeTruthy();
    expect(screen.getByText("Fill in and tick something above to see it here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download as text/u }).disabled).toBe(true);
    for (const box of screen.getAllByRole("checkbox")) expect(box.checked).toBe(false);
  });
  it("only enables a tick once there is something to put on the card, then shows it in the preview", () => {
    renderPage();
    const tick = screen.getByRole("checkbox", { name: "Put “Allergies” on the card" });
    expect(tick.disabled).toBe(true);
    type("Allergies", "Penicillin");
    expect(screen.getByRole("checkbox", { name: "Put “Allergies” on the card" }).disabled).toBe(false);
    expect(screen.getByLabelText("Card preview").textContent).not.toContain("Penicillin");
    fireEvent.click(screen.getByRole("checkbox", { name: "Put “Allergies” on the card" }));
    expect(screen.getByLabelText("Card preview").textContent).toContain("Allergies: Penicillin");
  });
  it("marks the insurance number as sensitive", () => {
    renderPage();
    expect(screen.getByRole("checkbox", { name: "Put “Insurance member or policy number” on the card" }).closest("label").textContent).toContain("this is sensitive");
  });
  it("picks contacts and downloads, prints or copies only on request", () => {
    const download = vi.fn(); const print = vi.fn();
    renderPage({ download, print });
    fireEvent.click(screen.getByLabelText(/Campus Safety/u));
    expect(download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Download as text/u }));
    expect(download.mock.calls[0][0]).toBe("emergency-card-2026-10-14.txt");
    expect(download.mock.calls[0][1]).toContain("Campus Safety (Campus safety); 555-0111");
    fireEvent.click(screen.getByRole("button", { name: /Print/u }));
    expect(print).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copy the emergency card" })).toBeTruthy();
  });
  it("erases everything after confirmation", () => {
    const store = memory();
    renderPage({ storage: store });
    type("Allergies", "Penicillin");
    fireEvent.click(screen.getByRole("button", { name: /Erase this card/u }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, erase it" }));
    expect(store._m.size).toBe(0);
    expect(screen.getByRole("checkbox", { name: "Put “Allergies” on the card" }).disabled).toBe(true);
  });
  it("tells you when the browser will not save", () => {
    renderPage({ storage: { getItem: () => null, setItem: () => { throw new Error("x"); }, removeItem: () => {} } });
    type("Allergies", "Penicillin");
    expect(screen.getByRole("alert").textContent).toContain("would not save");
  });
});
