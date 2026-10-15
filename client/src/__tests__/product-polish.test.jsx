import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import AppShell from "../components/AppShell";
import NewsAdminPage from "../pages/NewsAdminPage";
import Notice from "../components/ui/Notice";
import PageHelp from "../components/PageHelp";
const designSystem = readFileSync(`${process.cwd()}/src/design-system.css`, "utf8");
const baseStyles = readFileSync(`${process.cwd()}/src/index.css`, "utf8");

const request = vi.fn();
vi.mock("../lib/api", () => ({ apiRequest: (...args) => request(...args) }));
vi.mock("../lib/news-data", async (load) => ({ ...(await load()), fetchReviewCandidates: vi.fn(async () => ({ items: [] })) }));

afterEach(() => { cleanup(); request.mockReset(); });

test("desktop and mobile navigation use identical destination labels", () => {
  render(<MemoryRouter><Routes><Route element={<AppShell onSignOut={() => {}} />}><Route index element={<h1>Home</h1>} /></Route></Routes></MemoryRouter>);
  const desktop = screen.getByRole("navigation", { name: "Main navigation" });
  const mobile = screen.getByRole("navigation", { name: "Primary navigation" });
  const labels = (node) => within(node).getAllByRole("link").slice(0, 5).map((link) => link.textContent.trim());
  expect(labels(desktop)).toEqual(labels(mobile));
});

test("page help is a visible purpose and help affordance", () => {
  render(<PageHelp id="news" />);
  const control = screen.getByText("How this page works");
  expect(control).toBeVisible();
  fireEvent.click(control);
  expect(screen.getByText(/reviewed updates from official sources/i)).toBeVisible();
});

test("failed remote admin content has an observable retry action", async () => {
  request.mockRejectedValue(new Error("Could not load updates"));
  render(<MemoryRouter><NewsAdminPage isAdmin /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load updates");
  request.mockResolvedValue({ items: [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(8));
});

test("feedback has status semantics and no enabled action is inert", () => {
  const action = vi.fn();
  render(<Notice tone="error" action={<button onClick={action}>Try again</button>}>Could not save.</Notice>);
  expect(screen.getByRole("alert")).toHaveTextContent("Problem");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(action).toHaveBeenCalledOnce();
});

describe("responsive and motion contracts", () => {
  test("long titles and error controls can wrap at the 390 pixel fixture", () => {
    expect(designSystem).toMatch(/overflow-wrap:\s*anywhere/u);
    expect(designSystem).toMatch(/\.inline-error[^}]*display:\s*flex/u);
    expect(designSystem).toMatch(/@media\s*\(max-width:\s*640px\)/u);
  });

  test("focus is visible and reduced motion is honored", () => {
    expect(designSystem).toMatch(/:focus-visible[^}]*outline:/u);
    expect(`${designSystem}\n${baseStyles}`).toMatch(/prefers-reduced-motion:\s*reduce/u);
  });
});
