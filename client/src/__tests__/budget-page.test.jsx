import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import BudgetPage from "../pages/BudgetPage";
import { emptyBudget, loadBudget, saveBudget, upsertItem } from "../lib/budget";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const renderPage = (store = memory(), extra = {}) => render(<MemoryRouter><BudgetPage storage={store} storageScope="u" now={now} {...extra} /></MemoryRouter>);
const addCost = (values) => {
  const form = screen.getByRole("form", { name: "Add a cost" });
  for (const [label, value] of Object.entries(values)) fireEvent.change(within(form).getByLabelText(label), { target: { value } });
  fireEvent.submit(form);
};

describe("BudgetPage", () => {
  it("is private, local and does not connect to banks or convert currencies", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Budget planner" })).toBeTruthy();
    expect(screen.getByText(/Saved in this browser only/u)).toBeTruthy();
    expect(screen.getByText(/does not convert currencies or connect to any bank/u)).toBeTruthy();
    expect(screen.getByText("No costs yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Export CSV/u }).disabled).toBe(true);
  });
  it("adds a repeating cost and a dated one-time cost and shows totals in the chosen currency", () => {
    const store = memory();
    renderPage(store);
    addCost({ Name: "Rent", Amount: "1000", "How often": "monthly" });
    addCost({ Name: "Deposit", Type: "one-time", Amount: "500", "Month (optional)": "2026-11" });
    const totals = screen.getByRole("region", { name: "Totals" });
    expect(totals.textContent).toContain("USD 1,000.00");
    expect(totals.textContent).toContain("USD 500.00");
    expect(totals.textContent).toContain("USD 12,500.00");
    fireEvent.change(screen.getByLabelText(/Currency/u), { target: { value: "eur" } });
    expect(screen.getByRole("region", { name: "Totals" }).textContent).toContain("EUR 1,000.00");
    expect(loadBudget(store, "u", now).items).toHaveLength(2);
    expect(loadBudget(store, "u", now).currency).toBe("EUR");
    const months = screen.getByRole("region", { name: "Month by month" });
    expect(within(months).getByRole("row", { name: /2026-11/u }).textContent).toContain("1,500.00");
    expect(within(months).getByRole("columnheader", { name: "Total (EUR)" })).toBeTruthy();
  });
  it("lets the student replace the currency code by typing normally", () => {
    const store = memory();
    renderPage(store);
    const input = screen.getByLabelText(/Currency/u);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.change(input, { target: { value: "e" } });
    expect(input.value).toBe("E");
    fireEvent.change(input, { target: { value: "eu" } });
    fireEvent.change(input, { target: { value: "eur" } });
    fireEvent.blur(input);
    expect(input.value).toBe("EUR");
    expect(loadBudget(store, "u", now).currency).toBe("EUR");
  });
  it("explains a bad amount and keeps what was typed", () => {
    renderPage();
    addCost({ Name: "Rent", Amount: "$12" });
    expect(screen.getByRole("alert").textContent).toContain("Enter an amount");
    expect(screen.getByRole("form", { name: "Add a cost" }).querySelector("input[placeholder='Rent']").value).toBe("Rent");
  });
  it("edits and deletes a cost", () => {
    const store = memory();
    saveBudget(store, "u", upsertItem(emptyBudget(now), { label: "Phone", category: "phone", kind: "recurring", frequency: "monthly", amount: "30" }, "bphn"), now);
    renderPage(store);
    fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }));
    fireEvent.change(within(screen.getByRole("form", { name: "Edit a cost" })).getByLabelText("Amount"), { target: { value: "35.50" } });
    fireEvent.submit(screen.getByRole("form", { name: "Edit a cost" }));
    expect(screen.getByText(/USD 35\.50 every month/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete Phone" }));
    expect(screen.getByText("No costs yet")).toBeTruthy();
  });
  it("exports a CSV only through a browser download", () => {
    const download = vi.fn();
    const store = memory();
    saveBudget(store, "u", upsertItem(emptyBudget(now), { label: "Rent", category: "housing", kind: "recurring", frequency: "monthly", amount: "800" }, "brent"), now);
    renderPage(store, { download });
    fireEvent.click(screen.getByRole("button", { name: /Export CSV/u }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(download.mock.calls[0][0]).toBe("globeready-budget-2026-10-14.csv");
    expect(download.mock.calls[0][1]).toContain("Rent,Housing and rent,Repeats,Every month,800.00,USD");
    expect(download.mock.calls[0][2]).toContain("text/csv");
  });
  it("asks before removing everything", () => {
    const store = memory();
    saveBudget(store, "u", upsertItem(emptyBudget(now), { label: "Rent", category: "housing", kind: "recurring", frequency: "monthly", amount: "800" }, "brent"), now);
    renderPage(store);
    fireEvent.click(screen.getByRole("button", { name: "Remove all costs" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(loadBudget(store, "u", now).items).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove all costs" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove all" }));
    expect(loadBudget(store, "u", now).items).toHaveLength(0);
  });
  it("says so when the browser will not save", () => {
    const blocked = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem: () => {} };
    renderPage(blocked);
    addCost({ Name: "Rent", Amount: "100" });
    expect(screen.getByRole("alert").textContent).toContain("would not save");
  });
});
