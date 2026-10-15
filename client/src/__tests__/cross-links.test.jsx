import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import KeyDatesPage from "../pages/KeyDatesPage";
import RulesPage from "../pages/RulesPage";

afterEach(cleanup);
const dates = [{ id: "d1", label: "Passport expires", kind: "passport", date: "2028-01-01", remindDays: 60 }];

describe("connections from key dates and rules back to tasks", () => {
  it("adds a task for a key date, due on that date and linked to it", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    render(<MemoryRouter><KeyDatesPage dates={dates} onAddTasks={onAddTasks} onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Add a task for Passport expires" }));
    await screen.findByText(/Task added/u);
    expect(onAddTasks).toHaveBeenCalledWith([expect.objectContaining({ links: [{ type: "date", id: "d1" }] })], { dueDate: "2028-01-01" });
  });
  it("lists tasks that point at a key date", () => {
    render(<MemoryRouter><KeyDatesPage dates={dates} tasks={[{ id: "t", title: "Renew", links: [{ type: "date", id: "d1" }] }, { id: "u", title: "Elsewhere", links: [{ type: "date", id: "zzz" }] }]} onCreate={vi.fn()} onUpdate={vi.fn()} onRemove={vi.fn()} /></MemoryRouter>);
    expect(within(screen.getByRole("list", { name: "Tasks for Passport expires" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("lists tasks that point at a rule or form", () => {
    render(<MemoryRouter><RulesPage tasks={[{ id: "t", title: "Review: Form I-765", links: [{ type: "rule", id: "form-i-765" }], completed: true }]} /></MemoryRouter>);
    const list = screen.getByRole("list", { name: "Tasks for Form I-765: Application for Employment Authorization" });
    expect(within(list).getByText(/Done: Review: Form I-765/u)).toBeTruthy();
  });
});
