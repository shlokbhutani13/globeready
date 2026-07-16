import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import DashboardPage from "../pages/DashboardPage";

describe("DashboardPage", () => {
  test("shows deadlines, documents, and journey progress", () => {
    render(
      <DashboardPage
        profile={{ fullName: "Maya", university: "UNC Chapel Hill", journeyStage: "Preparing" }}
        tasks={[
          { id: "1", title: "Pay SEVIS fee", dueDate: "2026-08-01", priority: "high", completed: false },
        ]}
        documents={[{ id: "1", name: "I-20.pdf", category: "immigration" }]}
      />,
    );

    expect(screen.getByText(/Good morning, Maya/i)).toBeInTheDocument();
    expect(screen.getByText("Upcoming deadlines")).toBeInTheDocument();
    expect(screen.getByText("I-20.pdf")).toBeInTheDocument();
    expect(screen.getAllByText(/Preparing/i).length).toBeGreaterThan(0);
  });
});
