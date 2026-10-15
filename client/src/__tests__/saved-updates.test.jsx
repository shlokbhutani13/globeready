import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import NewsPage from "../pages/NewsPage";

afterEach(cleanup);
const items = [
  { id: "a", title: "Alpha rule", sourceId: "federal-register", publisher: "DHS", sourceVerified: true, publishedAt: "2026-07-01" },
  { id: "b", title: "Beta notice", sourceId: "federal-register", publisher: "DHS", sourceVerified: true, publishedAt: "2026-06-01" },
];

test("students can narrow Updates to the ones they saved", () => {
  render(<MemoryRouter><NewsPage zeroCostMode items={items} savedIds={new Set(["b"])} onToggleSave={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Show saved updates (1)" }));
  expect(screen.getByRole("button", { name: "Showing saved updates" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getAllByRole("heading", { name: "Beta notice" }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("heading", { name: "Alpha rule" })).not.toBeInTheDocument();
});

test("says so when nothing is saved", () => {
  render(<MemoryRouter><NewsPage zeroCostMode items={items} savedIds={new Set()} onToggleSave={vi.fn()} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Show saved updates (0)" }));
  expect(screen.getByText("No saved updates here")).toBeInTheDocument();
});
