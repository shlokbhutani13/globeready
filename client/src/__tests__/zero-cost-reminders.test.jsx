import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import NotificationsPage from "../pages/NotificationsPage";

afterEach(cleanup);

test("free-beta notifications page is honest about what reminders are", () => {
  render(<MemoryRouter><NotificationsPage localMode notifications={[]} /></MemoryRouter>);
  expect(screen.getByText(/only while GlobeReady is open/i)).toBeInTheDocument();
  expect(screen.getByText(/no email or push/i)).toBeInTheDocument();
});

test("full product copy is unchanged", () => {
  render(<MemoryRouter><NotificationsPage notifications={[]} /></MemoryRouter>);
  expect(screen.queryByText(/only while GlobeReady is open/i)).not.toBeInTheDocument();
});
