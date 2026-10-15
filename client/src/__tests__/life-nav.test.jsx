import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SubNav, { lifeLinks, planLinks } from "../components/ui/SubNav";
import ContactsPage from "../pages/ContactsPage";
import UniversityPage from "../pages/UniversityPage";

afterEach(cleanup);
describe("Plan and Life navigation", () => {
  it("keeps the Plan bar short and moves everyday-life tools under Life", () => {
    expect(planLinks.length).toBeLessThanOrEqual(7);
    expect(planLinks.map(([, label]) => label)).toContain("Life");
    expect(planLinks.map(([to]) => to)).not.toContain("/contacts");
    expect(lifeLinks.map(([to]) => to)).toEqual(["/life", "/life/budget", "/life/documents", "/life/emergency-card", "/contacts", "/university", "/prepare"]);
    expect(new Set([...planLinks, ...lifeLinks].map(([to]) => to)).size).toBe(planLinks.length + lifeLinks.length - 1);
  });
  it("shows the Life bar on Contacts and University", () => {
    render(<MemoryRouter><ContactsPage /></MemoryRouter>);
    expect(within(screen.getByRole("navigation", { name: "Life sections" })).getByRole("link", { name: "Budget" })).toBeTruthy();
    cleanup();
    render(<MemoryRouter><UniversityPage profile={{}} /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "Life sections" })).toBeTruthy();
  });
  it("renders nothing for a single link", () => {
    const { container } = render(<MemoryRouter><SubNav label="x" links={[["/a", "A"]]} /></MemoryRouter>);
    expect(container.innerHTML).toBe("");
  });
});
