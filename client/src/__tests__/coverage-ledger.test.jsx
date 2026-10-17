import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import CoverageLedger from "../components/CoverageLedger";
import UpdateLifecycle from "../components/UpdateLifecycle";

afterEach(cleanup);

test("discloses exact coverage states and freshness in keyboard-accessible details", () => {
  render(<CoverageLedger ledger={{ summary: { total: 2, active: 1, reachable: 1, withRelevantStories: 1, pending: 1 }, entries: [
    { id: "uscis", publisher: "USCIS", status: "active", lastSuccessAt: "2026-10-13T10:00:00Z", cadenceHours: 12 },
    { id: "campus", publisher: "Example University", status: "pending", lastSuccessAt: null, safeReason: "Awaiting verification." },
  ] }} />);
  expect(screen.getByText(/1 of 2 sources reachable, 1 with relevant stories/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /show source details/i }));
  expect(screen.getByText("Example University")).toBeInTheDocument();
  expect(screen.getByText(/awaiting verification/i)).toBeInTheDocument();
  expect(screen.queryByText(/all updates/i)).not.toBeInTheDocument();
});

test("shows approved correction, supersession, and withdrawal states", () => {
  const { rerender } = render(<UpdateLifecycle item={{ lifecycleState: "corrected", replacementItemId: "new-1" }} />);
  expect(screen.getByText(/corrected/i)).toBeInTheDocument();
  rerender(<UpdateLifecycle item={{ lifecycleState: "superseded" }} />);
  expect(screen.getByText(/superseded/i)).toBeInTheDocument();
  rerender(<UpdateLifecycle item={{ lifecycleState: "withdrawn" }} />);
  expect(screen.getByText(/withdrawn/i)).toBeInTheDocument();
});
