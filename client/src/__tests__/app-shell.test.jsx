import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import AppShell from "../components/AppShell";

afterEach(cleanup);

test("mobile bar has an Account menu with Profile, Settings and Sign out, usable by keyboard", () => {
  const onSignOut = vi.fn();
  render(<MemoryRouter><AppShell onSignOut={onSignOut} /></MemoryRouter>);
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

test("shows an offline notice that clears when the connection returns", () => {
  render(<MemoryRouter><AppShell onSignOut={() => {}} /></MemoryRouter>);
  expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
  fireEvent(window, new Event("offline"));
  expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  fireEvent(window, new Event("offline"));
  expect(screen.getByText(/you are offline/i)).toBeInTheDocument();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  fireEvent(window, new Event("online"));
  expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument();
});
