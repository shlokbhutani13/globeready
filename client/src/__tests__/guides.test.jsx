import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import GuidesPage from "../pages/GuidesPage";

describe("GuidesPage", () => {
  test("saves an official guide", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<GuidesPage onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Save Set up U.S. banking" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: "banking" }),
    ));
    expect(screen.getByRole("button", { name: "Saved Set up U.S. banking" }).disabled).toBe(true);
  });
});
