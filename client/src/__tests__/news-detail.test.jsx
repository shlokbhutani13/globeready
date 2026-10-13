import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import NewsDetailPage from "../pages/NewsDetailPage";

test("renders verified story detail and official source", () => {
  render(<MemoryRouter><NewsDetailPage item={{ id: "n1", title: "OPT rule update", publisher: "USCIS", canonicalUrl: "https://www.uscis.gov/news/n1", publishedAt: "2026-10-01", whyItMatters: "Your filing timeline may change.", detailSections: [{ heading: "What changed", body: "USCIS published a revised filing window." }], topics: ["employment"] }} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "OPT rule update" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "What changed" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /official source/i })).toHaveAttribute("href", "https://www.uscis.gov/news/n1");
});
