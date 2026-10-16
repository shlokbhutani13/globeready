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

test("the source filter lists only sources that have published stories in the free beta", async () => {
  const { default: Toolbar, sourcesFromItems } = await import("../components/NewsToolbar");
  const sources = sourcesFromItems([{ sourceId: "federal-register" }, { sourceId: "federal-register" }]);
  expect(sources).toEqual([{ id: "federal-register", label: "Federal Register" }]);
  render(<Toolbar sources={sources} filters={{}} />);
  const options = screen.getByLabelText("Source").querySelectorAll("option");
  expect([...options].map((option) => option.textContent)).toEqual(["All official sources", "Federal Register"]);
});
