import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";

import DashboardPage from "../pages/DashboardPage";

function renderHome(props = {}) {
  let location;
  function Probe() { location = useLocation(); return null; }
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DashboardPage {...props} />} />
        <Route path="*" element={null} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
  return { getPath: () => location?.pathname };
}

describe("DashboardPage", () => {
  test("shows the next task and a calm Ask entry", () => {
    const onToggleTask = vi.fn();
    const { getPath } = renderHome({
      profile: { fullName: "Maya", university: "UNC Chapel Hill" },
      tasks: [
        { id: "1", title: "Pay SEVIS fee", dueDate: "2026-08-01", priority: "high", completed: false },
        { id: "2", title: "Upload insurance waiver", dueDate: "2026-08-05", priority: "high", completed: false },
      ],
      onToggleTask,
    });

    expect(screen.getByText(/Good (morning|afternoon|evening), Maya/)).toBeInTheDocument();
    expect(screen.getByText("Pay SEVIS fee")).toBeInTheDocument();
    expect(screen.getByText("1 more task")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleTask).toHaveBeenCalledWith("1");

    fireEvent.click(screen.getByRole("button", { name: /Ask GlobeReady/ }));
    expect(getPath()).toBe("/assistant");
  });

  test("stays calm when nothing is urgent", () => {
    renderHome({ profile: { fullName: "Maya" }, tasks: [] });
    expect(screen.getByText("Nothing urgent. You are caught up.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  test("surfaces the latest relevant update without ranking copy", () => {
    renderHome({
      profile: { fullName: "Maya" },
      tasks: [],
      topNews: [{ id: "n1", title: "F-1 interview scheduling changes", publisher: "travel.state.gov" }],
    });
    expect(screen.getByText("F-1 interview scheduling changes")).toBeInTheDocument();
    expect(screen.queryByText(/Recommended/i)).not.toBeInTheDocument();
  });
});
