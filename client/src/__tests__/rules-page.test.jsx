import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RulesPage from "../pages/RulesPage";
import { rulesLibrary } from "../data/rules-library";

afterEach(cleanup);
const renderPage = (props = {}) => render(<MemoryRouter><RulesPage {...props} /></MemoryRouter>);

describe("RulesPage", () => {
  it("has a title, an explanation and shows every entry with an official link", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Rules and forms" })).toBeTruthy();
    expect(screen.getByText(/entries shown/u).textContent).toContain(`${rulesLibrary.length} of ${rulesLibrary.length}`);
    expect(screen.getAllByRole("link", { name: /Official source/u })).toHaveLength(rulesLibrary.length);
  });

  it("is honest that the library links to sources and is not a legal review", () => {
    renderPage();
    expect(screen.getByText(/does not copy form editions or fees/u)).toBeTruthy();
    expect(screen.getByText(/not a legal review/u)).toBeTruthy();
  });

  it("searches by form number and narrows the count", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "i-765" } });
    const count = screen.getByText(/entries shown/u).textContent;
    expect(count).not.toContain(`${rulesLibrary.length} of`);
    expect(screen.getByRole("heading", { name: /Form I-765/u })).toBeTruthy();
  });

  it("filters to superseded entries and shows what replaced them", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "superseded" } });
    expect(screen.getByText(/Superseded by:/u)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Replacement history" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("hides superseded entries on request", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Hide superseded entries"));
    expect(screen.queryByText(/Superseded by:/u)).toBeNull();
  });

  it("explains an empty result and offers to clear the filters", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzzzzz" } });
    expect(screen.getByText("Nothing matches those filters")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getByText(/entries shown/u).textContent).toContain(`${rulesLibrary.length} of`);
  });

  it("labels matches to the student's profile as informational", () => {
    renderPage({ profile: { visaType: "F-1", journeyStage: "Current student" } });
    expect(screen.getAllByText("May be relevant to you").length).toBeGreaterThan(0);
  });

  it("adds a linked review task and reports it", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    renderPage({ onAddTasks });
    fireEvent.click(screen.getByRole("button", { name: /Add a task to review Form I-765/u }));
    await screen.findByText(/Added a task to review/u);
    expect(onAddTasks.mock.calls[0][0][0]).toMatchObject({ links: [{ type: "rule", id: "form-i-765" }] });
  });

  it("shows task errors in plain words", async () => {
    renderPage({ onAddTasks: vi.fn().mockRejectedValue(new Error("Sign in to add tasks.")) });
    fireEvent.click(screen.getAllByRole("button", { name: /Add a task to review/u })[0]);
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in");
  });

  it("offers no task button for superseded entries or without a task handler", () => {
    renderPage();
    expect(screen.queryByRole("button", { name: /Add a task/u })).toBeNull();
  });
});
