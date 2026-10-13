import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import DigestSettings from "../components/DigestSettings";

afterEach(cleanup);

test("changes frequency and truthfully discloses disabled email delivery", () => {
  const onChange = vi.fn();
  render(<DigestSettings preferences={{ digestFrequency: "weekly" }} digests={[{ id: "d1", generatedAt: "2026-10-13T12:00:00Z", itemCount: 3 }]} onChange={onChange} />);
  expect(screen.getByText(/email delivery is not connected/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/digest frequency/i), { target: { value: "daily" } });
  expect(onChange).toHaveBeenCalledWith({ digestFrequency: "daily" });
  expect(screen.getByText(/3 verified updates/i)).toBeInTheDocument();
});
