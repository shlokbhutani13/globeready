import React from "react";
import { MemoryRouter } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import GuidesPage from "../pages/GuidesPage";

afterEach(cleanup);

describe("GuidesPage", () => {
  test("saves an official guide", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><GuidesPage onSave={onSave} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Save Set up U.S. banking" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "banking" }),
    ));
    expect(screen.getByRole("button", { name: "Saved Set up U.S. banking" }).disabled).toBe(true);
  });

  test("saved guides can be filtered and removed when removal is supported", async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const { guides } = await import("../data/guides");
    const first = guides[0];
    render(<MemoryRouter><GuidesPage onSave={vi.fn()} onRemove={onRemove} savedUrls={[first.url]} savedResources={[{ id: "r1", url: first.url }]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: `Remove ${first.title} from saved` }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("r1"));
    await waitFor(() => expect(screen.getByText("No saved guides yet")).toBeTruthy());
  });
});
