import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AssistantPage from "../pages/AssistantPage";

afterEach(cleanup);
const news = [{ id: "n-auto", title: "SEVP updates certification expiration date process", excerpt: "SEVP posted a change to certification expiration dates.", publisher: "ICE SEVP", canonicalUrl: "https://www.ice.gov/sevis/x", sourceVerified: false, autoIngested: true }];
const mount = (props = {}) => render(<MemoryRouter><AssistantPage localMode documentsAllowed={false} localChunks={[]} documents={[]} grounded={{ news, visaCategory: "f-1" }} {...props} /></MemoryRouter>);
const ask = (text) => {
  fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send question" }));
};

describe("Ask GlobeReady (sources mode)", () => {
  it("opens in sources mode even with document reading off, with one h1", () => {
    mount();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Ask GlobeReady");
    expect(screen.queryByText(/Document reading is off/)).toBeNull();
    expect(screen.getByRole("button", { name: "Guides and official sources" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows results with their source label, a safe external link and the notice", async () => {
    mount();
    ask("What is OPT?");
    const results = await screen.findByRole("heading", { name: /sources? matched/ });
    const block = results.closest(".source-results");
    expect(within(block).getAllByText(/Plain-language meaning/).length).toBeGreaterThan(0);
    expect(block.querySelector(".assistant-notice").textContent).toMatch(/not an answer about your situation/);
    ask("sevp certification expiration date");
    const links = (await screen.findAllByRole("link", { name: /Read the source/ })).filter((a) => a.getAttribute("href") === "https://www.ice.gov/sevis/x");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getAllByText(/not yet reviewed by GlobeReady/).length).toBeGreaterThan(0);
  });

  it("says so plainly when nothing matches", async () => {
    mount();
    ask("pizza recipe");
    expect(await screen.findByRole("heading", { name: "No source matched" })).toBeTruthy();
    expect(screen.getByText(/will not guess/)).toBeTruthy();
  });

  it("keeps the documents mode and its empty states one click away", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "My documents" }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Search your documents");
    expect(screen.getByText(/Document reading is off/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guides and official sources" }));
    expect(screen.queryByText(/Document reading is off/)).toBeNull();
  });

  it("changes nothing for callers that do not pass grounded", () => {
    mount({ grounded: null });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Search your documents");
    expect(screen.queryByRole("group", { name: "What to search" })).toBeNull();
  });
});
