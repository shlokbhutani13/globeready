import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import DocumentsPage, { validateDocument } from "../pages/DocumentsPage";

afterEach(cleanup);

describe("document validation", () => {
  test("rejects unsupported file types", () => {
    const file = new File(["bad"], "script.exe", { type: "application/octet-stream" });
    expect(validateDocument(file)).toMatch(/PDF, PNG, or JPEG/i);
  });

  test("accepts a small PDF", () => {
    const file = new File(["passport"], "passport.pdf", { type: "application/pdf" });
    expect(validateDocument(file)).toBe("");
  });

  test("prevents uploads when document storage is unavailable", () => {
    render(<DocumentsPage storageAvailable={false} />);

    expect(screen.getByRole("button", { name: "Add document" }).disabled).toBe(true);
    expect(screen.getByText(/document uploads need storage to be enabled/i)).toBeTruthy();
  });

  test("offers private on-device processing without cloud Storage", () => {
    render(<DocumentsPage storageAvailable={false} localProcessing />);

    expect(screen.getByRole("button", { name: "Add document" }).disabled).toBe(false);
    expect(screen.getByRole("heading", { name: /read a document on this device/i })).toBeTruthy();
    expect(screen.getByText(/original file never leaves this device/i)).toBeTruthy();
  });

  test("shows a document's current indexing state", () => {
    render(<DocumentsPage documents={[
      {
        id: "doc-1",
        name: "I-20.pdf",
        category: "Immigration",
        contentType: "application/pdf",
        analysisStatus: "indexing",
      },
    ]} />);

    expect(screen.getByText("Indexing")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Indexing…" }).disabled).toBe(true);
  });

  test("labels sample documents as demo metadata instead of indexed files", () => {
    render(<DocumentsPage documents={[
      {
        id: "doc-demo",
        name: "I-20.pdf",
        category: "Immigration",
        storageMode: "safe demo metadata",
      },
    ]} />);

    expect(screen.getByText("Demo metadata")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Demo explanation" })).toBeTruthy();
  });
  test("shows browser-processing progress with a working cancel button and blocks a second file", () => {
    const onCancel = vi.fn();
    render(<DocumentsPage localProcessing storageAvailable={false} processing={{ percent: 42, label: "Reading page 3 of 7" }} onCancelProcessing={onCancel} />);
    expect(screen.getByRole("progressbar", { name: /document processing/i }).getAttribute("aria-valuenow")).toBe("42");
    expect(screen.getByText(/reading page 3 of 7 · 42%/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add document" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("reports how many pages were read and which had no searchable text", () => {
    render(<DocumentsPage localProcessing storageAvailable={false} documents={[
      { id: "doc-00", name: "Handbook.pdf", contentType: "application/pdf", storageMode: "browser-local", analysisStatus: "indexed", pageCount: 12, pagesWithText: 9 },
      { id: "doc-01", name: "I-20.pdf", contentType: "application/pdf", storageMode: "browser-local", analysisStatus: "indexed", pageCount: 3, pagesWithText: 3 },
    ]} />);
    expect(screen.getByText(/12 pages read · 3 had no readable text/i)).toBeTruthy();
    expect(screen.getByText("All 3 pages read")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ready for ask/i })).toBeNull();
  });

  test("lets a student delete all saved document text after confirming", async () => {
    const onDeleteAllText = vi.fn(async () => {});
    render(<DocumentsPage localProcessing storageAvailable={false} onDeleteAllText={onDeleteAllText} consent={{ documents: false, text: {} }}
      documents={[{ id: "doc-00", name: "I-20.pdf", contentType: "application/pdf", storageMode: "browser-local", analysisStatus: "indexed", pageCount: 1, pagesWithText: 1 }]} />);
    expect(screen.getByText(/ask is not searching your 1 saved document/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /delete all saved document text/i }));
    expect(onDeleteAllText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete all" }));
    await vi.waitFor(() => expect(onDeleteAllText).toHaveBeenCalledOnce());
  });

  test("explains the per-account document limit", () => {
    const documents = Array.from({ length: 50 }, (_, slot) => ({ id: `doc-${String(slot).padStart(2, "0")}`, name: `d${slot}.pdf`, contentType: "application/pdf", storageMode: "browser-local", analysisStatus: "indexed" }));
    render(<DocumentsPage localProcessing storageAvailable={false} documents={documents} />);
    expect(screen.getByRole("heading", { name: /document limit reached \(50\)/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add document" }).disabled).toBe(true);
  });
});
