import "@testing-library/jest-dom/vitest";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import NewsCard from "../components/NewsCard";
import SourceStatus from "../components/SourceStatus";
import NewsPage from "../pages/NewsPage";
import { countryCodeFor, rankNewsItems, universityIdFor } from "../lib/news-data";

afterEach(cleanup);

const item = (overrides = {}) => ({
  id: "item-1",
  title: "USCIS updates I-20 guidance",
  publisher: "U.S. Citizenship and Immigration Services",
  canonicalUrl: "https://www.uscis.gov/example",
  legalState: "final",
  editorialState: "approved",
  plainLanguageSummary: "A short plain-language explanation.",
  sourceVerified: true,
  urgency: "medium",
  topics: ["status"],
  visaTypes: ["f-1"],
  nationalities: [],
  universityIds: [],
  publishedAt: "2026-09-01",
  effectiveAt: null,
  ...overrides,
});

describe("news-data pure helpers", () => {
  test("universityIdFor produces a stable, canonical slug", () => {
    expect(universityIdFor("UNC Chapel Hill")).toBe("unc-chapel-hill");
    expect(universityIdFor("  Duke University!! ")).toBe("duke-university");
    expect(universityIdFor(undefined)).toBe("");
  });

  test("countryCodeFor maps a known nationality and returns null for unknown input", () => {
    expect(countryCodeFor("India")).toBe("IN");
    expect(countryCodeFor("Nonexistentland")).toBeNull();
  });

  test("rankNewsItems never drops an item, even with no matching signals", () => {
    const items = [item({ id: "a" }), item({ id: "b", topics: ["taxes-social-security"] })];
    const ranked = rankNewsItems(items, { university: "", visaType: "", homeCountry: "" });
    expect(ranked.map((entry) => entry.id).sort()).toEqual(["a", "b"]);
  });

  test("rankNewsItems ranks a matching university above a non-matching item", () => {
    const items = [
      item({ id: "no-match" }),
      item({ id: "match", universityIds: ["unc-chapel-hill"] }),
    ];
    const ranked = rankNewsItems(items, { university: "UNC Chapel Hill" });
    expect(ranked[0].id).toBe("match");
  });

  test("rankNewsItems ranks urgent items above routine items of equal relevance", () => {
    const items = [item({ id: "routine", urgency: "low" }), item({ id: "urgent", urgency: "critical" })];
    const ranked = rankNewsItems(items, {});
    expect(ranked[0].id).toBe("urgent");
  });
});

describe("SourceStatus", () => {
  test("renders a human label for every coverage state", () => {
    render(<SourceStatus state="covered" />);
    expect(screen.getByText(/covered/i)).toBeInTheDocument();
  });

  test("falls back to a safe label for an unrecognized state instead of crashing", () => {
    render(<SourceStatus state="totally-unknown" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("NewsCard", () => {
  test("shows the official source link and legal state", () => {
    render(<NewsCard item={item()} />);
    expect(screen.getByText("USCIS updates I-20 guidance")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /official source/i })).toHaveAttribute("href", "https://www.uscis.gov/example");
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  test("flags an unverified source instead of presenting it as official", () => {
    render(<NewsCard item={item({ sourceVerified: false })} />);
    expect(screen.getByText(/unverified source/i)).toBeInTheDocument();
  });

  test("labels automatic official-source items and uses a safe external Read more link", () => {
    render(<NewsCard item={item({ autoIngested: true, sourceVerified: false, trustLabel: "From official source — not yet reviewed by GlobeReady" })} profile={{ visaType: "F-1" }} />);
    expect(screen.getByText(/not yet reviewed by GlobeReady/i)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /read more/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText(/may be relevant/i)).not.toBeInTheDocument();
  });

  test("hides the generated summary until the item is administratively approved", () => {
    render(<NewsCard item={item({ editorialState: "published-source-only", plainLanguageSummary: "", excerpt: "Raw source excerpt" })} />);
    expect(screen.getByText("Raw source excerpt")).toBeInTheDocument();
  });

  test("calls onToggleSave when the save button is pressed", () => {
    const onToggleSave = vi.fn();
    render(<NewsCard item={item()} saved={false} onToggleSave={onToggleSave} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(onToggleSave).toHaveBeenCalledWith(expect.objectContaining({ id: "item-1" }));
  });
});

describe("NewsPage", () => {
  test("shows a retry action when loading failed, and never a blank page", () => {
    const onRetry = vi.fn();
    render(<MemoryRouter><NewsPage items={[]} loading={false} error="Could not reach GlobeReady." onRetry={onRetry} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not reach/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  test("shows an explicit empty state instead of implying there is nothing to report", () => {
    render(<MemoryRouter><NewsPage items={[]} loading={false} error="" /></MemoryRouter>);
    expect(screen.getByText(/does not mean nothing has changed/i)).toBeInTheDocument();
  });

  test("renders every item it is given", () => {
    render(<MemoryRouter><NewsPage items={[item({ id: "a" }), item({ id: "b", title: "Second update" })]} /></MemoryRouter>);
    expect(screen.getAllByText("USCIS updates I-20 guidance")).not.toHaveLength(0);
    expect(screen.getAllByText("Second update")).not.toHaveLength(0);
  });

  test("offers archive search and common time filters", () => {
    const onFilterChange = vi.fn();
    render(<MemoryRouter><NewsPage items={[item()]} filters={{}} onFilterChange={onFilterChange} /></MemoryRouter>);
    fireEvent.change(screen.getByRole("searchbox", { name: /search updates/i }), { target: { value: "OPT" } });
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ q: "OPT" }));
    fireEvent.click(screen.getByRole("button", { name: /this month/i }));
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }));
    expect(screen.getByRole("heading", { name: /top stories/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /all news/i })).toBeInTheDocument();
  });

  test("shows the student's university coverage status", () => {
    render(<MemoryRouter><NewsPage items={[]} profile={{ university: "UNC Chapel Hill" }} coverage={{ state: "verification-pending", sources: [] }} /></MemoryRouter>);
    expect(screen.getByText(/verification pending/i)).toBeInTheDocument();
  });

  test("always shows the general-information disclaimer", () => {
    render(<MemoryRouter><NewsPage items={[]} /></MemoryRouter>);
    expect(screen.getByText(/general information/i)).toBeInTheDocument();
  });
});

describe("delayed source disclosure", () => {
  test("names the delayed publisher and never presents the feed as complete", () => {
    render(<MemoryRouter><NewsPage items={[item()]} sourceHealth={{ state: "delayed", delayedPublishers: ["UNC ISSS"], lastCheckedAt: null }} /></MemoryRouter>);
    expect(screen.getByText(/source check delayed/i)).toBeInTheDocument();
    expect(screen.getByText(/UNC ISSS/)).toBeInTheDocument();
    expect(screen.getByText(/does not mean nothing has changed/i)).toBeInTheDocument();
  });

  test("shows no delay banner when every check is current", () => {
    render(<MemoryRouter><NewsPage items={[item()]} sourceHealth={{ state: "current", delayedPublishers: [] }} /></MemoryRouter>);
    expect(screen.queryByText(/source check delayed/i)).not.toBeInTheDocument();
  });
});

describe("university coverage never implies verification it does not have", () => {
  test("a pending student-submitted source reads as pending, never as covered", () => {
    render(<MemoryRouter><NewsPage items={[]} profile={{ university: "Example University" }} coverage={{ state: "verification-pending", sources: [{ publisher: "Example University", verified: false, enabled: false }] }} /></MemoryRouter>);
    expect(screen.getByText("Verification pending")).toBeInTheDocument();
    expect(screen.queryByText(/^Covered$/)).not.toBeInTheDocument();
  });

  test("does not treat federal relevance as university review", () => {
    render(<MemoryRouter><NewsPage items={[item({ title: "Federal F-1 update", visaTypes: ["f-1"], universityIds: [] })]} profile={{ university: "Example University", visaType: "F-1" }} /></MemoryRouter>);
    expect(screen.queryByText(/^Reviewed university coverage$/i)).not.toBeInTheDocument();
  });
});
