import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SetupPage from "../pages/SetupPage";
import HelpPage from "../pages/HelpPage";
import PageHelp from "../components/PageHelp";
import { glossary } from "../data/glossary";

afterEach(cleanup);
const wrap = (node) => render(<MemoryRouter>{node}</MemoryRouter>);

describe("SetupPage", () => {
  it("shows progress, text status, and a link for each step", () => {
    wrap(<SetupPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Set up in five minutes" })).toBeTruthy();
    expect(document.querySelector(".setup-progress").textContent).toContain("0 of 5");
    expect(screen.getAllByText("Not started").length).toBe(6);
    expect(screen.getByRole("link", { name: /Open profile/u }).getAttribute("href")).toBe("/profile");
  });
  it("marks finished steps done and celebrates completion", () => {
    wrap(<SetupPage profile={{ visaType: "F-1", university: "X", journeyStage: "Y", topics: ["status"] }} dates={[{}]} contacts={[{ role: "dso" }]} tasks={[{}]} />);
    expect(document.querySelector(".setup-progress").textContent).toContain("5 of 5");
    expect(screen.getByText(/finished the basics/u)).toBeTruthy();
  });
  it("says suggestions are not legal conclusions", () => {
    wrap(<SetupPage />);
    expect(screen.getByText(/not legal conclusions or official deadlines/u)).toBeTruthy();
  });
});

describe("HelpPage", () => {
  it("explains storage, lists terms and filters them", () => {
    wrap(<HelpPage zeroCostMode />);
    expect(screen.getByRole("heading", { level: 1, name: "Help and glossary" })).toBeTruthy();
    expect(screen.getByText(/Never collected:/u)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${glossary.length} of ${glossary.length}`, "u"))).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search terms"), { target: { value: "work authorization" } });
    expect(screen.getByText("EAD (Employment Authorization Document)")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search terms"), { target: { value: "zzzz" } });
    expect(screen.getByText("No terms match")).toBeTruthy();
  });
  it("shows only informational sections outside the free beta", () => {
    wrap(<HelpPage />);
    expect(screen.queryByRole("heading", { level: 3, name: "Case tracker" })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: "Rules and forms" })).toBeTruthy();
  });
});

describe("PageHelp", () => {
  it("is collapsed by default and states what the page does not do", () => {
    wrap(<PageHelp id="cases" />);
    const details = screen.getByText("How this page works").closest("details");
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("does not check USCIS");
  });
  it("renders nothing for unknown ids", () => {
    const { container } = wrap(<PageHelp id="nope" />);
    expect(container.innerHTML).toBe("");
  });
});
