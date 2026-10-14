import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NewsDetailPage from "../pages/NewsDetailPage";

afterEach(cleanup);
const item = { id: "federal-register-2026-14439", title: "Fixed admission periods", publisher: "DHS", publishedAt: "2026-07-17", effectiveAt: "2026-09-15", topics: ["status"], urgency: "urgent", canonicalUrl: "https://www.federalregister.gov/d/1" };
const view = (props = {}) => render(<MemoryRouter><NewsDetailPage item={item} items={[item]} {...props} /></MemoryRouter>);

describe("update detail connections", () => {
  it("shows the illustration with an honest credit", () => {
    view();
    expect(screen.getByAltText("status illustration")).toBeTruthy();
    expect(screen.getByText(/not an official image/u)).toBeTruthy();
  });
  it("shows a timeline with the effective date and the rule change", () => {
    view();
    const list = screen.getByRole("list", { name: /Timeline of this update/u });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText(/Duration-of-status admission/u)).toBeTruthy();
  });
  it("links to the rules library entries that cite this update", () => {
    view();
    const section = screen.getByRole("heading", { name: "Connected in GlobeReady" }).closest("section");
    expect(within(section).getAllByRole("link", { name: /Fixed admission periods|Duration-of-status/u }).length).toBeGreaterThan(0);
  });
  it("shows tasks already connected to this update", () => {
    view({ tasks: [{ id: "t", title: "Talk to my DSO", links: [{ type: "news", id: item.id }], completed: false }, { id: "u", title: "Other", links: [{ type: "news", id: "x" }] }] });
    expect(within(screen.getByRole("list", { name: "Tasks for this update" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("adds a connected, high-priority task for an urgent update", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    view({ onAddTasks });
    fireEvent.click(screen.getByRole("button", { name: /Add a task to review this/u }));
    expect((await screen.findByRole("status")).textContent).toContain("Task added");
    expect(onAddTasks.mock.calls[0][0][0]).toMatchObject({ priority: "high", links: [{ type: "news", id: item.id }] });
  });
  it("explains a failure and offers no task button without sign-in", async () => {
    view({ onAddTasks: vi.fn().mockRejectedValue(new Error("Sign in to add tasks.")) });
    fireEvent.click(screen.getByRole("button", { name: /Add a task to review this/u }));
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in");
    cleanup();
    view();
    expect(screen.queryByRole("button", { name: /Add a task/u })).toBeNull();
  });
});
