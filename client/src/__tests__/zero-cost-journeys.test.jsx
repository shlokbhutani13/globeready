import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test } from "vitest";
import DashboardPage from "../pages/DashboardPage";
import NewsPage from "../pages/NewsPage";
import SettingsPage from "../pages/SettingsPage";

afterEach(cleanup);

describe("zero-cost public journeys", () => {
  test("orients a signed-in student without promising an always-on service", () => {
    render(<MemoryRouter><DashboardPage zeroCostMode profile={{ fullName: "Maya" }} tasks={[]} /></MemoryRouter>);
    expect(screen.getByText(/free public beta/i)).toBeInTheDocument();
    expect(screen.getByText(/no guaranteed service level/i)).toBeInTheDocument();
  });

  test("presents reviewed static news and removes unavailable digest controls", () => {
    render(<NewsPage zeroCostMode items={[]} sourceHealth={{ state: "delayed", generatedAt: "2026-09-01T00:00:00Z" }} />);
    expect(screen.getByText(/reviewed official-source feed/i)).toBeInTheDocument();
    expect(screen.getByText(/feed may be out of date/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /update digest/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit preferences/i })).not.toBeInTheDocument();
  });

  test("discloses exactly what the free runtime cannot do", () => {
    render(<SettingsPage zeroCostMode live consent={{ documents: false, aiGeneration: false, text: {} }} />);
    expect(screen.getByText(/original-file backup is unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cloud AI answers are unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/email and push delivery are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/save my preference for email reminders/i)).not.toBeInTheDocument();
  });
});
