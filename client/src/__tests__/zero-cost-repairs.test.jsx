import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ConsentPanel from "../components/ConsentPanel";
import CoverageLedger, { checkLabel } from "../components/CoverageLedger";
import { iso, rangeFor } from "../components/NewsToolbar";
import NewsCard from "../components/NewsCard";
import LoginPage from "../pages/LoginPage";
import SettingsPage from "../pages/SettingsPage";

afterEach(cleanup);

describe("zero-cost trust repairs", () => {
  test("planned sources are labelled as not monitored and never show a check date", () => {
    render(<CoverageLedger ledger={{ entries: [
      { id: "federal-register", name: "Federal Register", status: "active", lastVerifiedAt: "2026-10-13T12:00:00Z" },
      { id: "uscis", name: "USCIS", status: "planned", lastVerifiedAt: "2026-10-13T12:00:00Z" },
    ] }} />);
    fireEvent.click(screen.getByRole("button", { name: /show source details/i }));
    expect(screen.getByText(/1 of 2 sources active/i)).toBeInTheDocument();
    expect(screen.getAllByText(/planned — not monitored yet/i).length).toBeGreaterThan(0);
    expect(checkLabel({ status: "planned", lastVerifiedAt: "2026-10-13T12:00:00Z" })).toBe("Not monitored");
    expect(checkLabel({ status: "active", lastVerifiedAt: "2026-10-13T12:00:00Z" })).toMatch(/^Last reviewed /u);
    expect(checkLabel({ status: "active", lastSuccessAt: "2026-10-13T12:00:00Z" })).toMatch(/^Last successful check /u);
  });

  test("consent checkboxes follow choices that load after the panel first renders", () => {
    const { rerender } = render(<ConsentPanel consent={null} onSave={vi.fn()} />);
    rerender(<ConsentPanel consent={{ documents: true, aiGeneration: false, text: {} }} onSave={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /allow globeready to read my documents/i })).toBeChecked();
    rerender(<ConsentPanel consent={{ documents: false, aiGeneration: false, text: {} }} onSave={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /allow globeready to read my documents/i })).not.toBeChecked();
  });

  test("date filters use the student's local calendar day", () => {
    const eveningInNewYork = new Date(2026, 9, 13, 23, 30);
    expect(iso(eveningInNewYork)).toBe("2026-10-13");
    expect(rangeFor("week", eveningInNewYork)).toEqual({ from: "2026-10-06", to: "2026-10-13" });
  });

  test("the save control on an update calls the save handler", () => {
    const onToggleSave = vi.fn();
    render(<NewsCard item={{ id: "federal-register-2026-14439", title: "Fixed admission periods", legalState: "effective", sourceVerified: true }} onToggleSave={onToggleSave} />);
    fireEvent.click(screen.getByRole("button", { name: /save fixed admission periods/i }));
    expect(onToggleSave).toHaveBeenCalledWith(expect.objectContaining({ id: "federal-register-2026-14439" }));
  });

  test("the free beta sign-in page does not promise AI explanations or cloud document storage", () => {
    render(<LoginPage auth={{ firebaseConfigured: true }} zeroCost />);
    expect(screen.queryByText(/AI explanations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cloud document storage|Documents use your Firebase project/i)).not.toBeInTheDocument();
    expect(screen.getByText(/documents are read on your device/i)).toBeInTheDocument();
    expect(screen.getByText(/verify your email/i)).toBeInTheDocument();
  });

  test("account deletion asks password accounts for their password and Google accounts for a pop-up", async () => {
    const onDelete = vi.fn(async () => {});
    const { rerender } = render(<SettingsPage zeroCostMode live consent={{ documents: false, text: {} }} signInProviders={["password"]} onDelete={onDelete} />);
    fireEvent.change(screen.getByLabelText(/type delete my account/i), { target: { value: "DELETE MY ACCOUNT" } });
    const button = screen.getByRole("button", { name: /delete my account/i });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: "secret-pass" } });
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledWith({ password: "secret-pass" });
    rerender(<SettingsPage zeroCostMode live consent={{ documents: false, text: {} }} signInProviders={["google.com"]} onDelete={onDelete} />);
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/google window will ask you to confirm/i)).toBeInTheDocument();
  });
});
