import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import TasksPage, { buildCalendarMonth } from "../pages/TasksPage";
import NotificationsPage from "../pages/NotificationsPage";

afterEach(cleanup);

describe("buildCalendarMonth", () => {
  test("counts tasks due on each day without inventing a count for days with none", () => {
    const tasks = [{ dueDate: "2026-08-01" }, { dueDate: "2026-08-01" }, { dueDate: "2026-08-15" }];
    const days = buildCalendarMonth(tasks, new Date(Date.UTC(2026, 7, 1)));
    const firstDay = days.find((day) => day?.key === "2026-08-01");
    const fifteenth = days.find((day) => day?.key === "2026-08-15");
    const second = days.find((day) => day?.key === "2026-08-02");

    expect(firstDay.taskCount).toBe(2);
    expect(fifteenth.taskCount).toBe(1);
    expect(second.taskCount).toBe(0);
  });

  test("produces exactly the number of days in the given month", () => {
    const days = buildCalendarMonth([], new Date(Date.UTC(2026, 1, 1)));
    const realDays = days.filter(Boolean);
    expect(realDays).toHaveLength(28);
  });
});

describe("TasksPage", () => {
  test("submits a new task with its due date and priority instead of a bare title", () => {
    const onAdd = vi.fn();
    render(<TasksPage tasks={[]} onAdd={onAdd} onToggle={() => {}} onDelete={() => {}} />);

    fireEvent.change(screen.getByLabelText("New task"), { target: { value: "Pay SEVIS fee" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "high" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));

    expect(onAdd).toHaveBeenCalledWith({ title: "Pay SEVIS fee", dueDate: "2026-08-01", priority: "high" });
  });

  test("does not submit an empty task", () => {
    const onAdd = vi.fn();
    render(<TasksPage tasks={[]} onAdd={onAdd} onToggle={() => {}} onDelete={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  test("clicking a calendar day filters the task list to that day only", () => {
    const tasks = [
      { id: "1", title: "Due today", dueDate: "2026-08-01", completed: false },
      { id: "2", title: "Due later", dueDate: "2026-08-20", completed: false },
    ];
    render(<TasksPage tasks={tasks} onAdd={() => {}} onToggle={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.getByText("Due later")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2026-08-01, 1 task/i }));

    expect(screen.getByText("Due today")).toBeInTheDocument();
    expect(screen.queryByText("Due later")).not.toBeInTheDocument();
  });
});

describe("NotificationsPage", () => {
  test("shows an explicit empty state when there are no notifications", () => {
    render(<NotificationsPage notifications={[]} />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });

  test("lets a student mark a single notification as read", () => {
    const onMarkRead = vi.fn();
    const notification = { id: "n1", title: "Due: Pay SEVIS fee", body: "This task is due today.", read: false };
    render(<NotificationsPage notifications={[notification]} onMarkRead={onMarkRead} />);

    fireEvent.click(screen.getByRole("button", { name: /mark .* as read/i }));
    expect(onMarkRead).toHaveBeenCalledWith(notification);
  });

  test("offers mark-all-read only when something is unread", () => {
    const read = { id: "n1", title: "Read one", body: "", read: true };
    render(<NotificationsPage notifications={[read]} />);
    expect(screen.queryByRole("button", { name: /mark all read/i })).not.toBeInTheDocument();
  });
});
