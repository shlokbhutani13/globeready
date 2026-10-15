import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import AppShell from "../components/AppShell";

afterEach(cleanup);
const shell = (props = {}, path = "/") => render(
  <MemoryRouter initialEntries={[path]}><Routes><Route element={<AppShell onSignOut={() => {}} {...props} />}><Route path="*" element={<p>page</p>} /></Route></Routes></MemoryRouter>,
);

test("main navigation is five predictable destinations on desktop and phone", () => {
  shell();
  for (const name of ["Main navigation", "Primary navigation"]) {
    const nav = screen.getByRole("navigation", { name });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent.trim()).filter((text) => ["Home", "Plan", "Updates", "Documents", "Ask"].includes(text))).toEqual(["Home", "Plan", "Updates", "Documents", "Ask"]);
  }
});

test("Plan stays current across its sub-pages, and the skip link targets the main region", () => {
  shell({}, "/dates");
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(within(nav).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
});

test.each([
  ["/cases", "Plan"],
  ["/university", "Plan"],
  ["/life", "Plan"],
  ["/life/budget", "Plan"],
  ["/prepare", "Plan"],
  ["/for-you", "Updates"],
  ["/rules", "Updates"],
  ["/resources", "Updates"],
])("%s keeps its main destination current", (path, destination) => {
  shell({}, path);
  for (const name of ["Main navigation", "Primary navigation"]) {
    const nav = screen.getByRole("navigation", { name });
    expect(within(nav).getByRole("link", { name: destination })).toHaveAttribute("aria-current", "page");
  }
  cleanup();
});

test("search is a labelled landmark and reminders show an unread count in text", () => {
  shell({ unreadNotifications: 3 });
  expect(screen.getByRole("search")).toBeInTheDocument();
  expect(screen.getByLabelText(/search updates, rules, resources, cases, guides, tasks and document names/i)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Reminders (3 unread)" }).length).toBeGreaterThan(0);
});

test("phone Account menu has Reminders, Profile, Settings and Sign out, usable by keyboard", () => {
  const onSignOut = vi.fn();
  shell({ onSignOut });
  const mobile = screen.getByRole("navigation", { name: "Primary navigation" });
  const toggle = within(mobile).getByRole("button", { name: "Account" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  const menu = screen.getByRole("group", { name: "Account menu" });
  expect(within(menu).getByRole("link", { name: /Profile/ })).toHaveAttribute("href", "/profile");
  expect(within(menu).getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(toggle);
  fireEvent.click(within(screen.getByRole("group", { name: "Account menu" })).getByRole("button", { name: /Sign out/ }));
  expect(onSignOut).toHaveBeenCalled();
});

test("shows an offline notice that says changes are not synchronized, and clears when back online", () => {
  shell();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  fireEvent(window, new Event("offline"));
  expect(screen.getByText(/changes will not be saved or synchronized/i)).toBeInTheDocument();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  fireEvent(window, new Event("online"));
  expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
});
