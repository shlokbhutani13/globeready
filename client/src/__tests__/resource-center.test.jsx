import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResourcesPage from "../pages/ResourcesPage";
import { resourceCategories, resourceCenter, resourcesIn, scamTips, searchResources } from "../data/resource-center";

afterEach(cleanup);
const trusted = ["988lifeline.org", "thehotline.org", "rainn.org"];

describe("resource center data", () => {
  it("covers every required category with at least two entries", () => {
    expect(resourceCategories.map((category) => category.id)).toEqual(["emergency", "scams", "health", "tax", "housing", "travel", "campus-safety"]);
    for (const category of resourceCategories) expect(resourcesIn(category.id).length).toBeGreaterThanOrEqual(2);
  });
  it("links only to government sites or named public-service operators over https", () => {
    for (const entry of resourceCenter) {
      expect(new Set(resourceCenter.map((other) => other.id)).size).toBe(resourceCenter.length);
      if (!entry.url) continue;
      const host = new URL(entry.url).hostname.replace(/^www\./u, "");
      expect(entry.url.startsWith("https://")).toBe(true);
      expect(/\.(gov|mil)$/u.test(host) || trusted.includes(host)).toBe(true);
    }
  });
  it("gives every entry somewhere to go", () => {
    for (const entry of resourceCenter) expect(Boolean(entry.url || entry.phone || entry.internal)).toBe(true);
  });
  it("searches titles and summaries", () => {
    expect(searchResources("rental scam").map((entry) => entry.id)).toContain("ftc-rental-scams");
    expect(searchResources("")).toEqual([]);
  });
  it("keeps scam advice free of promises about outcomes", () => {
    expect(scamTips.length).toBeGreaterThanOrEqual(5);
    expect(scamTips.join(" ")).not.toMatch(/guarantee|always safe|will not be deported/iu);
  });
});

describe("ResourcesPage", () => {
  const renderPage = () => render(<MemoryRouter><ResourcesPage /></MemoryRouter>);
  it("leads with 911 and says the numbers are U.S. numbers", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Safety and life resources" })).toBeTruthy();
    expect(screen.getByText(/call/iu, { selector: ".notice p" }).textContent).toMatch(/911/u);
    expect(screen.getByText(/U\.S\. numbers/u)).toBeTruthy();
  });
  it("has a section and a jump link for every category", () => {
    renderPage();
    const nav = screen.getByRole("navigation", { name: "Resource categories" });
    for (const category of resourceCategories) {
      expect(within(nav).getByRole("link", { name: category.label })).toBeTruthy();
      expect(screen.getByRole("heading", { level: 2, name: category.label })).toBeTruthy();
    }
  });
  it("labels outbound links with the resource name and lets phone numbers be copied", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Report fraud to the FTC: official site" }).getAttribute("href")).toBe("https://reportfraud.ftc.gov/");
    expect(screen.getByRole("button", { name: /988 Suicide & Crisis Lifeline phone number/u })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Open your contacts" }).length).toBeGreaterThan(0);
  });
  it("shows ways to spot a scam", () => {
    renderPage();
    expect(within(screen.getByRole("list", { name: "Ways to spot a scam" })).getAllByRole("listitem")).toHaveLength(scamTips.length);
  });
});
