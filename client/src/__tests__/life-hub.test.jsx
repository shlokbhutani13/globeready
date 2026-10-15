import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LifeHubPage from "../pages/LifeHubPage";
import { allLifeItems, lifeCategory, lifeTopics, resolveLifeLink, topicSteps } from "../data/life-hub";
import { journeyItemsFor } from "../data/journey-templates";
import { isPlanned, tasksFromItems } from "../lib/planner";

afterEach(cleanup);
const renderPage = (props = {}) => render(<MemoryRouter><LifeHubPage profile={{ visaType: "F-1" }} onAddTasks={vi.fn().mockResolvedValue(1)} {...props} /></MemoryRouter>);

describe("life hub data", () => {
  it("covers every requested topic", () => {
    expect(lifeTopics.map((topic) => topic.id)).toEqual(["housing", "banking", "phone", "transport", "health", "insurance", "tax", "campus", "emergency"]);
  });
  it("reuses Journey steps by id instead of copying them, and every id exists", () => {
    const journeyIds = new Set([...journeyItemsFor("F-1"), ...journeyItemsFor("J-1"), ...journeyItemsFor("")].map((item) => item.id));
    const own = new Set(allLifeItems().map((item) => item.id));
    for (const topic of lifeTopics) for (const id of topic.journeyIds) { expect(journeyIds.has(id), id).toBe(true); expect(own.has(id), id).toBe(false); }
    const titles = [...journeyIds].length ? journeyItemsFor("F-1").map((item) => item.title.toLowerCase()) : [];
    for (const item of allLifeItems()) expect(titles).not.toContain(item.title.toLowerCase());
    expect(new Set(allLifeItems().map((item) => item.id)).size).toBe(allLifeItems().length);
  });
  it("links only to guides and resources that exist and have a destination", () => {
    for (const topic of lifeTopics) for (const link of topic.links || []) {
      const resolved = resolveLifeLink(link);
      expect(resolved, link.join(":")).toBeTruthy();
      expect(Boolean(resolved.url || resolved.to || resolved.phone)).toBe(true);
      if (resolved.url) expect(resolved.url.startsWith("https://")).toBe(true);
    }
  });
  it("is honest where no vetted source exists and invents no dates or deadlines", () => {
    expect(lifeTopics.find((topic) => topic.id === "phone").note).toMatch(/does not compare or rate/u);
    expect(JSON.stringify(allLifeItems())).not.toMatch(/\b\d+\s*days?\b|must|required|deadline/iu);
    expect(tasksFromItems(allLifeItems(), [], { startDate: "2026-08-20" }).every((task) => task.dueDate === "")).toBe(true);
  });
  it("marks a step planned by id or by an existing task with the same title", () => {
    const step = topicSteps(lifeTopics[0], "F-1").at(-1);
    expect(isPlanned(step, [], [])).toBe(false);
    expect(isPlanned(step, [], [step.id])).toBe(true);
    expect(isPlanned(step, [{ title: `  ${step.title.toUpperCase()} ` }], [])).toBe(true);
  });
});

describe("LifeHubPage", () => {
  it("has a heading, a topic list and no deadlines", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Arrival and daily life" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Topics" });
    for (const topic of lifeTopics) expect(within(nav).getByRole("link", { name: topic.label })).toBeTruthy();
    expect(screen.getAllByText(/no deadlines/u).length).toBeGreaterThan(0);
    expect(screen.getByRole("navigation", { name: "Life sections" })).toBeTruthy();
  });
  it("adds one step as a task and reports it", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    renderPage({ onAddTasks });
    fireEvent.click(screen.getByRole("button", { name: "Add to tasks: Read the whole lease before signing and keep a copy" }));
    await screen.findByText(/Added “Read the whole lease/u);
    expect(onAddTasks.mock.calls[0][0][0]).toMatchObject({ id: "life-housing-lease", category: lifeCategory });
  });
  it("adds all open steps in a topic in one tap", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(3);
    renderPage({ onAddTasks });
    fireEvent.click(screen.getByRole("button", { name: /^Add all \d+ Housing and move-in steps to tasks/u }));
    await screen.findByText(/Added 3 housing and move-in steps/u);
    expect(onAddTasks.mock.calls[0][0].length).toBeGreaterThan(1);
  });
  it("shows steps already in Journey once and marks planned ones", () => {
    renderPage({ added: ["gen-arrival-bank"], tasks: [{ id: "t", title: "Set up online banking and turn on fraud alerts" }] });
    const bank = screen.getByRole("list", { name: "Banking and money steps" });
    expect(within(bank).getAllByText("In your tasks")).toHaveLength(2);
    expect(within(bank).queryByRole("button", { name: /Add to tasks/u })).toBeNull();
    expect(screen.getAllByText("Compare student bank accounts and what each needs to open")).toHaveLength(1);
  });
  it("labels official links and says plainly when there is no vetted source", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /Information for renters, U\.S\. Dept\. of Housing and Urban Development/u }).getAttribute("href")).toMatch(/^https:\/\//u);
    expect(screen.getByText(/does not compare or rate plans/u)).toBeTruthy();
  });
  it("explains a failure in plain words", async () => {
    renderPage({ onAddTasks: vi.fn().mockRejectedValue(new Error("Sign in to add tasks.")) });
    fireEvent.click(screen.getAllByRole("button", { name: /^Add to tasks:/u })[0]);
    expect((await screen.findByRole("alert")).textContent).toContain("Sign in");
  });
});
