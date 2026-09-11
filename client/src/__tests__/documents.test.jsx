import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

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
});
