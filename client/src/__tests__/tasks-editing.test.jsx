import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TasksPage from "../pages/TasksPage";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const task = { id: "t1", title: "File I-765", category: "Employment", priority: "high", dueDate: "2026-11-03", notes: "Bring receipt", recurrence: "monthly", remindOn: "2026-10-30", links: [{ type: "rule", id: "form-i-765" }, { type: "case", id: "gone" }], completed: false };
const renderPage = (props = {}) => render(<MemoryRouter><TasksPage zeroCostMode tasks={[task]} now={now} onAdd={() => {}} onToggle={vi.fn()} onDelete={() => {}} onUpdate={vi.fn().mockResolvedValue({})} {...props} /></MemoryRouter>);

describe("task details", () => {
  it("shows notes, repeat, reminder date and connected items with links", () => {
    renderPage();
    expect(screen.getByText("Bring receipt")).toBeTruthy();
    expect(screen.getByText("Every month")).toBeTruthy();
    expect(screen.getByText("Remind 2026-10-30")).toBeTruthy();
    const links = within(screen.getByRole("list", { name: "Connected to File I-765" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/rules", "/cases"]);
    expect(links[0].textContent).toContain("Form I-765");
  });
  it("offers no edit button when editing is not available", () => {
    renderPage({ onUpdate: undefined });
    expect(screen.queryByRole("button", { name: "Edit File I-765" })).toBeNull();
  });
});

describe("editing a task", () => {
  it("opens an editor with the current values and saves changes", async () => {
    const onUpdate = vi.fn().mockResolvedValue({});
    renderPage({ onUpdate });
    fireEvent.click(screen.getByRole("button", { name: "Edit File I-765" }));
    const form = screen.getByRole("form", { name: "Edit File I-765" });
    expect(within(form).getByLabelText("Task").value).toBe("File I-765");
    expect(within(form).getByLabelText(/^Repeat/u).value).toBe("monthly");
    fireEvent.change(within(form).getByLabelText("Task"), { target: { value: "File I-765 online" } });
    fireEvent.change(within(form).getByLabelText(/Notes/u), { target: { value: "New note" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][0].id).toBe("t1");
    expect(onUpdate.mock.calls[0][1]).toMatchObject({ title: "File I-765 online", notes: "New note", recurrence: "monthly", remindOn: "2026-10-30", dueDate: "2026-11-03", category: "Employment" });
    await waitFor(() => expect(screen.queryByRole("form", { name: "Edit File I-765" })).toBeNull());
  });
  it("keeps what was typed and explains the problem when saving fails", async () => {
    renderPage({ onUpdate: vi.fn().mockRejectedValue(new Error("A repeating task needs a due date.")) });
    fireEvent.click(screen.getByRole("button", { name: "Edit File I-765" }));
    const form = screen.getByRole("form", { name: "Edit File I-765" });
    fireEvent.change(within(form).getByLabelText("Due date"), { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    expect((await within(form).findByRole("alert")).textContent).toContain("needs a due date");
    expect(within(form).getByLabelText("Task").value).toBe("File I-765");
    expect(within(form).getByRole("button", { name: "Save changes" }).disabled).toBe(false);
  });
  it("can remove a connection and cancel without saving", async () => {
    const onUpdate = vi.fn().mockResolvedValue({});
    renderPage({ onUpdate });
    fireEvent.click(screen.getByRole("button", { name: "Edit File I-765" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove connection to Case/u }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0][1].links).toEqual([{ type: "rule", id: "form-i-765" }]);
    fireEvent.click(screen.getByRole("button", { name: "Edit File I-765" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Edit File I-765" })).toBeNull();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("finishing a repeating task", () => {
  it("tells the student when the next repeat was added", async () => {
    renderPage({ onToggle: vi.fn().mockResolvedValue({ nextId: "n", next: { dueDate: "2026-12-03" } }) });
    fireEvent.click(screen.getByRole("button", { name: "Complete File I-765" }));
    expect((await screen.findByRole("status")).textContent).toContain("next repeat of “File I-765” is due 2026-12-03");
  });
  it("explains a failure to create the next repeat", async () => {
    renderPage({ onToggle: vi.fn().mockRejectedValue(new Error("Marked done, but the next repeat could not be created: quota")) });
    fireEvent.click(screen.getByRole("button", { name: "Complete File I-765" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Marked done");
  });
});
