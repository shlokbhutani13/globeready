import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
import GettingStartedBoard from "../components/GettingStartedBoard";

test("shows five simple destinations and can be dismissed", () => {
  const dismiss = vi.fn();
  render(<MemoryRouter><GettingStartedBoard onDismiss={dismiss} /></MemoryRouter>);
  expect(screen.getAllByRole("link")).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: /dismiss guide/i }));
  expect(dismiss).toHaveBeenCalled();
});
