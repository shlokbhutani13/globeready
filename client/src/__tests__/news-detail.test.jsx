import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import NewsDetailPage from "../pages/NewsDetailPage";

test("renders verified story detail and official source", () => {
  render(<MemoryRouter><NewsDetailPage item={{ id: "n1", title: "OPT rule update", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/n1", publishedAt: "2026-10-01", whyItMatters: "Your filing timeline may change.", detailSections: [{ heading: "What changed", body: "USCIS published a revised filing window." }], topics: ["employment"] }} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "OPT rule update" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "What changed" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /official source/i })).toHaveAttribute("href", "https://www.uscis.gov/news/n1");
});

describe("static-mode detail loading", () => {
  const story = { id: "fr-1", title: "Late story", publisher: "Federal Register", canonicalUrl: "https://www.federalregister.gov/d/1" };
  const view = (props) => (
    <MemoryRouter initialEntries={["/news/fr-1"]}><Routes><Route path="news/:id" element={<NewsDetailPage localMode {...props} />} /></Routes></MemoryRouter>
  );

  test("shows loading while the reviewed feed loads, then the story that arrives", () => {
    const { rerender } = render(view({ items: [], loading: true }));
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText(/not in the current reviewed/i)).not.toBeInTheDocument();
    rerender(view({ items: [story], loading: false }));
    expect(screen.getByRole("heading", { name: "Late story" })).toBeInTheDocument();
  });

  test("says the update is missing only after loading finished", () => {
    render(view({ items: [story], loading: false, error: "" , }));
    cleanup();
    render(<MemoryRouter initialEntries={["/news/gone"]}><Routes><Route path="news/:id" element={<NewsDetailPage localMode items={[story]} loading={false} />} /></Routes></MemoryRouter>);
    expect(screen.getByText(/not in the current reviewed/i)).toBeInTheDocument();
  });

  test("reports a feed load failure instead of loading forever", () => {
    render(view({ items: [], loading: false, error: "Could not load updates." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load updates.");
  });
});
