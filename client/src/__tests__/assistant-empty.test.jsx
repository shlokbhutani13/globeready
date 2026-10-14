import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test } from "vitest";
import AssistantPage from "../pages/AssistantPage";

afterEach(cleanup);

test("free-beta Ask explains there is nothing to search yet instead of inviting a search", () => {
  render(<MemoryRouter><AssistantPage localMode documentsAllowed documents={[]} localChunks={[]} /></MemoryRouter>);
  expect(screen.getByText("No saved documents to search")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/documents");
  expect(screen.getByLabelText("Ask GlobeReady")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Send question" })).toBeDisabled();
});
