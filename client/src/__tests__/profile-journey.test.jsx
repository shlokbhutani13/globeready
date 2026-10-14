import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";
import ProfilePage from "../pages/ProfilePage";
import DashboardPage from "../pages/DashboardPage";

afterEach(cleanup);

test("profile collects journey dates and confirms only a successful save", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<ProfilePage profile={{ fullName: "Maya", visaType: "F-1" }} onSave={onSave} />);
  fireEvent.change(screen.getByLabelText("Program start date"), { target: { value: "2026-08-20" } });
  fireEvent.change(screen.getByLabelText("Expected graduation date"), { target: { value: "2028-05-15" } });
  fireEvent.change(screen.getByLabelText("Degree level"), { target: { value: "Doctoral" } });
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Profile saved."));
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ startDate: "2026-08-20", graduationDate: "2028-05-15", degreeLevel: "Doctoral" }));
});

test("profile does not claim success when the save failed, and rejects impossible dates", async () => {
  const onSave = vi.fn().mockResolvedValue(false);
  render(<ProfilePage profile={{ fullName: "Maya", startDate: "2026-08-20" }} onSave={onSave} />);
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
  await waitFor(() => expect(onSave).toHaveBeenCalled());
  expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Expected graduation date"), { target: { value: "2026-01-01" } });
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/on or after your start date/i);
});

test("Home's Next task is the soonest deadline, not the first in the list", () => {
  const tasks = [
    { id: "1", title: "No date", completed: false },
    { id: "2", title: "Later", dueDate: "2999-01-01", completed: false },
    { id: "3", title: "Sooner", dueDate: "2999-01-01".replace("2999", "2998"), completed: false },
  ];
  render(<MemoryRouter><DashboardPage tasks={tasks} /></MemoryRouter>);
  expect(screen.getByText("Sooner")).toBeInTheDocument();
});

test("topic choices appear only where they can be saved, and are saved with the profile", async () => {
  const onSave = vi.fn().mockResolvedValue(true);
  const { rerender } = render(<ProfilePage profile={{ fullName: "Maya" }} onSave={onSave} />);
  expect(screen.queryByText(/Topics I want flagged/)).not.toBeInTheDocument();
  rerender(<ProfilePage profile={{ fullName: "Maya" }} onSave={onSave} showTopics />);
  fireEvent.click(screen.getByLabelText("Work and training"));
  fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ topics: ["employment"] })));
});
