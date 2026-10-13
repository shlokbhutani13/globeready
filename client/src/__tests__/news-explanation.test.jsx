import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NewsExplanation from "../components/NewsExplanation";

test("requests and displays a cited explanation only after the user asks", async () => {
  const explain = vi.fn().mockResolvedValue({ answer: "The filing date changed.", sources: [{ title: "USCIS", url: "https://www.uscis.gov/news" }], disclaimer: "General information only." });
  render(<NewsExplanation itemId="n1" explain={explain} />);
  expect(explain).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /explain with ai/i }));
  await waitFor(() => expect(screen.getByText(/filing date changed/i)).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "USCIS" })).toHaveAttribute("href", "https://www.uscis.gov/news");
});
