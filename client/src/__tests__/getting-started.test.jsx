import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);
import GettingStartedBoard from "../components/GettingStartedBoard";

test("shows five simple destinations and can be dismissed", () => {
  const dismiss = vi.fn();
  render(<MemoryRouter><GettingStartedBoard onDismiss={dismiss} /></MemoryRouter>);
  expect(screen.getAllByRole("link")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: /dismiss guide/i }));
  expect(dismiss).toHaveBeenCalled();
});

test("free-beta orientation promises nothing the free product lacks", async () => {
  const { default: Board } = await import("../components/GettingStartedBoard");
  const { MemoryRouter } = await import("react-router-dom");
  render(<MemoryRouter><Board zeroCostMode onDismiss={() => {}} /></MemoryRouter>);
  expect(screen.getByRole("link", { name: /Tasks/ })).toHaveAttribute("href", "/tasks");
  expect(screen.getByText(/exact passages in your saved documents/i)).toBeInTheDocument();
  expect(screen.queryByText(/sourced explanation/i)).not.toBeInTheDocument();
});
