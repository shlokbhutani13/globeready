import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import NewsDetailPage from "../pages/NewsDetailPage";

test("automatic stories show only source-level context and no personalised or reviewed guidance", () => {
  render(<MemoryRouter><NewsDetailPage item={{ id: "auto-1", title: "Official feed item", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/auto", publishedAt: "2026-10-14", excerpt: "A short source excerpt.", autoIngested: true, sourceVerified: false, trustLabel: "From official source — not yet reviewed by GlobeReady", topics: ["employment"], visaTypes: ["f-1"] }} profile={{ visaType: "F-1" }} onAddTasks={vi.fn()} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /not yet reviewed/i })).toBeInTheDocument();
  expect(screen.getByText(/informational only/i)).toBeInTheDocument();
  expect(screen.queryByText(/may be relevant/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /add a task/i })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /read more/i })).toHaveAttribute("rel", "noopener noreferrer");
});

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

test("free-beta detail page shows a source-based At a glance panel and no AI wording", () => {
  const story = { id: "fr", title: "Rule", legalState: "scheduled", documentType: "final-rule", publishedAt: "2026-07-17", effectiveAt: "2026-10-20", docketNumber: "ICEB-1" };
  render(<MemoryRouter initialEntries={["/news/fr"]}><Routes><Route path="news/:id" element={<NewsDetailPage localMode items={[story]} />} /></Routes></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "At a glance" })).toBeInTheDocument();
  expect(screen.getByText(/set to take effect on a future date/i)).toBeInTheDocument();
  expect(screen.getByText("Final rule")).toBeInTheDocument();
  expect(screen.queryByText(/AI/)).not.toBeInTheDocument();
});

test("labels corrected and archived updates without hiding their history", () => {
  const story = {
    id: "corrected", title: "Corrected update", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/corrected",
    editorialState: "archived", lifecycleState: "archived", correctionNote: "The official source withdrew this notice.",
    reviewHistory: [{ type: "approve", decidedAt: "2026-10-01T00:00:00.000Z", reasonCode: "verified-official-source" }, { type: "archive", decidedAt: "2026-10-14T00:00:00.000Z", reasonCode: "source-withdrawn" }],
  };
  render(<MemoryRouter><NewsDetailPage item={story} /></MemoryRouter>);
  expect(screen.getByText(/archived update/i)).toBeInTheDocument();
  expect(screen.getByText(/official source withdrew/i)).toBeInTheDocument();
  expect(screen.getByText(/review history/i)).toBeInTheDocument();
  expect(screen.getByText(/approved/i)).toBeInTheDocument();
});
