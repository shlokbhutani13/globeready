import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DocumentChecklistPage from "../pages/DocumentChecklistPage";
import { loadReadiness } from "../lib/document-readiness";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const renderPage = (store = memory(), keyDates = []) => render(<MemoryRouter><DocumentChecklistPage storage={store} storageScope="u" now={now} keyDates={keyDates} /></MemoryRouter>);

describe("DocumentChecklistPage", () => {
  it("says it records only what you say and never checks documents", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Documents checklist" })).toBeTruthy();
    expect(screen.getAllByText(/does not read, upload or check your documents/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Saved in this browser only/u).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Documents" }).getAttribute("href")).toBe("/documents");
  });
  it("marks a document and saves it on this device", () => {
    const store = memory();
    renderPage(store);
    const passport = screen.getByRole("group", { name: "Status of Passport" });
    fireEvent.click(within(passport).getByLabelText("Have it"));
    expect(within(screen.getByRole("group", { name: "Status of Passport" })).getByLabelText("Have it").checked).toBe(true);
    expect(loadReadiness(store, "u").marks.passport.status).toBe("have");
    expect(document.querySelector(".progress-line").textContent).toContain("1 of");
    fireEvent.click(screen.getByRole("button", { name: "Clear status of Passport" }));
    expect(loadReadiness(store, "u").marks.passport.status).toBe("");
  });
  it("shows the Key dates date once, labelled as the student's own entry, and links to add one when missing", () => {
    renderPage(memory(), [{ id: "d", kind: "passport", date: "2026-12-01" }]);
    expect(screen.getByText(/Date you entered: 2026-12-01 \(in 48 days\), from your Key dates\. Check the document itself\. It is coming up\./u)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Add one in Key dates" }).length).toBeGreaterThan(0);
    const passportRow = screen.getByRole("heading", { name: "Passport" }).closest("li");
    expect(within(passportRow).queryByLabelText("Expiry date (optional)")).toBeNull();
  });
  it("offers a typed expiry only where Key dates does not apply", () => {
    const store = memory();
    renderPage(store);
    const row = screen.getByRole("heading", { name: /Work authorization card/u }).closest("li");
    fireEvent.change(within(row).getByLabelText("Expiry date (optional)"), { target: { value: "2027-02-01" } });
    expect(loadReadiness(store, "u").marks["work-card"].expiry).toBe("2027-02-01");
    expect(within(row).getByText(/typed by you/u)).toBeTruthy();
  });
  it("saves a note when leaving the field, and adds and removes your own document", () => {
    const store = memory();
    renderPage(store);
    const note = screen.getByLabelText("Note for Passport");
    fireEvent.change(note, { target: { value: "Blue folder" } });
    fireEvent.blur(note);
    expect(loadReadiness(store, "u").marks.passport.note).toBe("Blue folder");
    fireEvent.change(screen.getByLabelText("Add a document of your own"), { target: { value: "Vaccination card" } });
    fireEvent.submit(screen.getByRole("form", { name: "Add a document" }));
    expect(screen.getByRole("heading", { name: "Vaccination card" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Vaccination card" }));
    expect(screen.queryByRole("heading", { name: "Vaccination card" })).toBeNull();
  });
  it("explains errors in plain words", () => {
    renderPage();
    fireEvent.submit(screen.getByRole("form", { name: "Add a document" }));
    expect(screen.getByRole("alert").textContent).toContain("Type the name");
  });
});
