import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import TopStoriesReader from "../components/TopStoriesReader";

afterEach(cleanup);
const stories = [
  { id: "1", title: "First update", publisher: "USCIS", topics: ["employment"], whyItMatters: "Review your filing plan." },
  { id: "2", title: "Second update", publisher: "SEVP", topics: ["travel-entry"] },
];

describe("TopStoriesReader", () => {
  test("moves through stories with controls and keyboard", () => {
    render(<TopStoriesReader items={stories} />);
    expect(screen.getByText("First update")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next story/i }));
    expect(screen.getByText("Second update")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("region", { name: /top stories/i }), { key: "ArrowLeft" });
    expect(screen.getByText("First update")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  test("renders legacy stories with a neutral fallback image", () => {
    render(<TopStoriesReader items={[{ id: "old", title: "Legacy story", publisher: "Official source" }]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/general update illustration/i);
  });
});

test("the Save button shows and toggles the saved state", async () => {
  const { default: Reader } = await import("../components/TopStoriesReader");
  const toggle = vi.fn();
  const items = [{ id: "a", title: "Story A" }];
  const { rerender } = render(<Reader items={items} savedIds={new Set()} onToggleSave={toggle} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Story A" }));
  expect(toggle).toHaveBeenCalledWith(items[0]);
  rerender(<Reader items={items} savedIds={new Set(["a"])} onToggleSave={toggle} />);
  expect(screen.getByRole("button", { name: "Unsave Story A" })).toHaveAttribute("aria-pressed", "true");
});
