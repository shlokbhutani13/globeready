import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import AssistantPage from "../pages/AssistantPage";

afterEach(cleanup);

describe("document-grounded assistant", () => {
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
