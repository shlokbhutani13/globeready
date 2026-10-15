import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { MemoryRouter } from "react-router-dom";
import AssistantPage from "../pages/AssistantPage";

afterEach(cleanup);

describe("document-grounded assistant", () => {
  test("uses private browser retrieval in zero-cost mode and hides cloud history", async () => {
    const requestAnswer = vi.fn();
    render(<AssistantPage
      localMode
      localChunks={[{ documentId: "i20", documentName: "I-20.pdf", page: 2, text: "Travel signature valid until May." }]}
      requestAnswer={requestAnswer}
    />);

    expect(screen.getByText(/runs privately in this browser/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /history/i })).toBeNull();
    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: "When is my travel signature valid?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    expect(await screen.findByText("I-20.pdf · page 2")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /1 matching passage from your documents/i })).toBeTruthy();
    expect(screen.getByText("Travel signature valid until May.").tagName).toBe("BLOCKQUOTE");
    expect(screen.getByText(/not an answer or legal advice/i)).toBeTruthy();
    expect(requestAnswer).not.toHaveBeenCalled();
  });

  test("stops searching stored text when document reading consent is withdrawn", () => {
    render(<MemoryRouter><AssistantPage localMode documentsAllowed={false} localChunks={[]} /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /document reading is off/i })).toBeTruthy();
    expect(screen.getByLabelText("Ask GlobeReady").disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Send question" }).disabled).toBe(true);
  });

  test("shows the official-contact referral with passages for a high-risk question", async () => {
    render(<AssistantPage localMode localChunks={[{ documentId: "i20", documentName: "I-20.pdf", page: 1, text: "Your OPT start date and SEVIS status are listed here." }]} />);
    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), { target: { value: "What is my OPT start date?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByText(/Designated School Official/i)).toBeTruthy();
  });

  test("renders the document, page, and excerpt returned with an answer", async () => {
    render(<AssistantPage requestAnswer={async () => ({
      answer: "Check the travel signature on page two.",
      sources: [],
      documentCitations: [{
        documentName: "I-20.pdf",
        page: 2,
        excerpt: "Travel signature valid until May.",
      }],
    })} />);

    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), {
      target: { value: "When does my travel signature expire?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    await waitFor(() => {
      expect(screen.getByText(/From I-20\.pdf · page 2/)).toBeTruthy();
      expect(screen.getByText(/Travel signature valid until May/)).toBeTruthy();
    });
  });

  test("sends the selected document as the retrieval scope", async () => {
    const requestAnswer = vi.fn().mockResolvedValue({
      answer: "The program start date is August 18.",
      sources: [],
      documentCitations: [],
    });
    render(<AssistantPage
      documents={[{ id: "doc-7", name: "I-20.pdf" }]}
      requestAnswer={requestAnswer}
    />);

    fireEvent.change(screen.getByLabelText("Document scope"), {
      target: { value: "doc-7" },
    });
    fireEvent.change(screen.getByLabelText("Ask GlobeReady"), {
      target: { value: "When does my program start?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    await waitFor(() => expect(requestAnswer).toHaveBeenCalled());
    const [, options] = requestAnswer.mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      question: "When does my program start?",
      documentId: "doc-7",
    });
  });
});
