import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CasesPage from "../pages/CasesPage";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const record = { id: "c1", title: "Post-completion OPT", kind: "opt-ead", formNumber: "I-765", receiptNumber: "IOE1234567890", filedOn: "2026-10-01", status: "receipt-received", notes: "Mailed with tracking", createdAt: "x",
  timeline: [{ date: "2026-10-01", type: "status", status: "filed" }, { date: "2026-10-20", type: "appointment", text: "Biometrics 9am" }] };
const handlers = () => ({ onCreate: vi.fn().mockResolvedValue({}), onUpdate: vi.fn().mockResolvedValue({}), onAddEntry: vi.fn().mockResolvedValue({}), onRemoveEntry: vi.fn().mockResolvedValue({}), onRemove: vi.fn().mockResolvedValue({}), onAddTasks: vi.fn().mockResolvedValue(1) });
const renderPage = (props = {}) => render(<MemoryRouter><CasesPage cases={[record]} now={now} {...handlers()} {...props} /></MemoryRouter>);

describe("CasesPage", () => {
  it("is honest that nothing is checked with any agency", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Application and case tracker" })).toBeTruthy();
    expect(screen.getByText(/does not contact USCIS or any agency/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Check your official case status/u }).getAttribute("href")).toBe("https://egov.uscis.gov/casestatus/landing.do");
  });
  it("summarises the case: status, receipt, last entered update and the next dated event", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Post-completion OPT" })).toBeTruthy();
    expect(screen.getByText("Receipt received")).toBeTruthy();
    expect(screen.getByText(/Receipt IOE1234567890/u)).toBeTruthy();
    expect(screen.getByText(/Last update you entered: appointment on 2026-10-20/u)).toBeTruthy();
    expect(screen.getByText(/appointment on 2026-10-20 \(in 6 days\)/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: /receipt number/u })).toBeTruthy();
  });
  it("shows an empty state with a way to add the first case", () => {
    renderPage({ cases: [] });
    expect(screen.getByText("No cases yet")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Add a case" })[1]);
    expect(screen.getByRole("form", { name: "Add case" })).toBeTruthy();
  });
  it("adds a case with the entered values and confirms it", async () => {
    const props = handlers();
    renderPage({ cases: [], ...props });
    fireEvent.click(screen.getAllByRole("button", { name: "Add a case" })[0]);
    const form = screen.getByRole("form", { name: "Add case" });
    fireEvent.change(within(form).getByLabelText("Case name"), { target: { value: "STEM OPT" } });
    fireEvent.change(within(form).getByLabelText("Kind of case"), { target: { value: "stem-opt" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add case" }));
    await screen.findByText(/Case added/u);
    expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "STEM OPT", kind: "stem-opt", status: "preparing" }), 0);
  });
  it("keeps the form and explains a rejected save", async () => {
    renderPage({ cases: [], onCreate: vi.fn().mockRejectedValue(new Error("A receipt number uses letters, numbers and hyphens only.")) });
    fireEvent.click(screen.getAllByRole("button", { name: "Add a case" })[0]);
    const form = screen.getByRole("form", { name: "Add case" });
    fireEvent.change(within(form).getByLabelText("Case name"), { target: { value: "X" } });
    fireEvent.click(within(form).getByRole("button", { name: "Add case" }));
    expect((await within(form).findByRole("alert")).textContent).toContain("receipt number");
    expect(within(form).getByLabelText("Case name").value).toBe("X");
  });
  it("adds a manual status update, defaulting to today", async () => {
    const props = handlers();
    renderPage(props);
    fireEvent.click(screen.getByRole("button", { name: "Add an update" }));
    const form = screen.getByRole("form", { name: "Add an update to Post-completion OPT" });
    expect(within(form).getByLabelText(/^Date/u).value).toBe("2026-10-14");
    fireEvent.change(within(form).getByLabelText("New status"), { target: { value: "evidence-requested" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save update" }));
    await screen.findByText("Update saved.");
    expect(props.onAddEntry).toHaveBeenCalledWith(record, expect.objectContaining({ date: "2026-10-14", type: "status", status: "evidence-requested" }));
  });
  it("lists history and removes an entry", async () => {
    const props = handlers();
    renderPage(props);
    fireEvent.click(screen.getByText(/History \(2\)/u));
    const list = screen.getByRole("list", { name: "History of Post-completion OPT" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove the appointment entry from 2026-10-20" }));
    await waitFor(() => expect(props.onRemoveEntry).toHaveBeenCalledWith(record, 1));
  });
  it("edits a case without losing its history", async () => {
    const props = handlers();
    renderPage(props);
    fireEvent.click(screen.getByRole("button", { name: "Edit Post-completion OPT" }));
    const form = screen.getByRole("form", { name: "Save changes" });
    fireEvent.change(within(form).getByLabelText("Case name"), { target: { value: "OPT (renamed)" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await screen.findByText("Case updated.");
    expect(props.onUpdate).toHaveBeenCalledWith(record, expect.objectContaining({ title: "OPT (renamed)", timeline: record.timeline }));
  });
  it("adds a follow-up task connected to the case and shows linked tasks", async () => {
    const props = handlers();
    renderPage({ ...props, tasks: [{ id: "t1", title: "Mail copies", links: [{ type: "case", id: "c1" }], completed: false }] });
    expect(within(screen.getByRole("list", { name: "Tasks for Post-completion OPT" })).getByText(/Task: Mail copies/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a follow-up task for Post-completion OPT" }));
    await screen.findByText("Follow-up task added.");
    expect(props.onAddTasks.mock.calls[0][0][0]).toMatchObject({ links: [{ type: "case", id: "c1" }] });
  });
  it("deletes a case and reports a failure in words", async () => {
    renderPage({ onRemove: vi.fn().mockRejectedValue(new Error("offline")) });
    fireEvent.click(screen.getByRole("button", { name: "Delete Post-completion OPT" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/./u);
  });
});
