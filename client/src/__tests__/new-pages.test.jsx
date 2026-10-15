import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import KeyDatesPage from "../pages/KeyDatesPage";
import ContactsPage from "../pages/ContactsPage";
import JourneyPage from "../pages/JourneyPage";
import TravelPage from "../pages/TravelPage";
import SearchPage from "../pages/SearchPage";

afterEach(cleanup);
const wrap = (node, path = "/") => render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);

describe("Key dates", () => {
  test("adds a hand-entered date and keeps the form values when saving fails", async () => {
    const onCreate = vi.fn().mockRejectedValueOnce({ code: "unavailable" }).mockResolvedValueOnce({});
    wrap(<KeyDatesPage dates={[]} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Passport expires" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2028-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add date" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/internet connection/i);
    expect(screen.getByLabelText("Label")).toHaveValue("Passport expires");
    fireEvent.click(screen.getByRole("button", { name: "Add date" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Date saved."));
    expect(onCreate).toHaveBeenLastCalledWith({ label: "Passport expires", kind: "passport", date: "2028-03-01", remindDays: 30, notes: "" });
    expect(screen.getByLabelText("Label")).toHaveValue("");
  });

  test("lists dates soonest first with status text, and supports edit and delete", async () => {
    const onUpdate = vi.fn().mockResolvedValue();
    const onRemove = vi.fn().mockResolvedValue();
    const dates = [
      { id: "b", label: "Visa", kind: "visa", date: "2028-01-01", remindDays: 30 },
      { id: "a", label: "Lease", kind: "lease", date: "2026-12-01", remindDays: 60 },
    ];
    wrap(<KeyDatesPage dates={dates} onUpdate={onUpdate} onRemove={onRemove} now={new Date(2026, 9, 14)} />);
    const items = within(screen.getByRole("list", { name: "Your key dates" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Lease");
    expect(items[0]).toHaveTextContent("In 48 days");
    fireEvent.click(screen.getByRole("button", { name: "Edit Lease" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-12-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(dates[1], expect.objectContaining({ date: "2026-12-15" })));
    fireEvent.click(screen.getByRole("button", { name: "Delete Visa" }));
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith("b"));
  });

  test("only offers calendar download when supported", () => {
    wrap(<KeyDatesPage dates={[]} />);
    expect(screen.queryByRole("button", { name: /Download calendar/ })).not.toBeInTheDocument();
  });
});

describe("Contacts", () => {
  test("shows phone and email with copy buttons and links, and reports unavailable clipboard honestly", async () => {
    const contacts = [{ id: "c", name: "Dr. Rao", role: "dso", phone: "+1 555 0100", email: "dso@school.edu" }];
    wrap(<ContactsPage contacts={contacts} />);
    expect(screen.getByRole("link", { name: "+1 555 0100" })).toHaveAttribute("href", "tel:+15550100");
    expect(screen.getByRole("link", { name: "dso@school.edu" })).toHaveAttribute("href", "mailto:dso@school.edu");
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    fireEvent.click(screen.getByRole("button", { name: "Copy Dr. Rao's phone number" }));
    await waitFor(() => expect(screen.getAllByRole("status").some((node) => /not available/i.test(node.textContent))).toBe(true));
    if (original) Object.defineProperty(navigator, "clipboard", original); else delete navigator.clipboard;
  });

  test("copies to the clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    wrap(<ContactsPage contacts={[{ id: "c", name: "Dr. Rao", role: "dso", email: "dso@school.edu" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Dr. Rao's email address" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("dso@school.edu"));
    delete navigator.clipboard;
  });

  test("creating passes the current count so the free-beta cap applies", async () => {
    const onCreate = vi.fn().mockResolvedValue();
    wrap(<ContactsPage contacts={[{ id: "1", name: "A", role: "other" }]} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Campus Police" } });
    fireEvent.change(screen.getByLabelText("Who they are"), { target: { value: "campus-safety" } });
    fireEvent.click(screen.getByRole("button", { name: "Add contact" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ name: "Campus Police", role: "campus-safety" }), 1));
  });
});

describe("Journey planner", () => {
  test("labels itself as general guidance and adds only the chosen, not-yet-added steps", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(1);
    wrap(<JourneyPage profile={{ visaType: "F-1", startDate: "2026-08-20" }} tasks={[]} added={[]} onAddTasks={onAddTasks} />);
    expect(screen.getByText(/General guidance for planning only/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Confirm your SEVIS I-901 fee is paid/));
    fireEvent.click(screen.getByRole("button", { name: /Add 1 selected to Tasks/ }));
    await waitFor(() => expect(onAddTasks).toHaveBeenCalledWith([expect.objectContaining({ id: "f1-arrival-sevis" })]));
    expect(await screen.findByText("Added 1 task.")).toBeInTheDocument();
  });

  test("steps already in Tasks are disabled and marked", () => {
    wrap(<JourneyPage profile={{ visaType: "J-1" }} tasks={[{ title: "Check passport validity before any trip abroad" }]} added={[]} onAddTasks={vi.fn()} />);
    const box = screen.getByLabelText(/Check passport validity before any trip abroad/);
    expect(box).toBeDisabled();
    expect(box).toBeChecked();
  });

  test("explains missing profile dates instead of inventing due dates", () => {
    wrap(<JourneyPage profile={{ visaType: "F-1" }} tasks={[]} onAddTasks={vi.fn()} />);
    expect(screen.getByText(/Add your program start and graduation dates/)).toBeInTheDocument();
  });
});

describe("Travel readiness", () => {
  test("shows all required sections and adds missing items as tasks with the departure date", async () => {
    const onAddTasks = vi.fn().mockResolvedValue(3);
    wrap(<TravelPage have={["passport-valid"]} custom={[]} onSaveChecklist={vi.fn()} onAddTasks={onAddTasks} />);
    for (const name of ["Passport", "Visa and entry", "School and program documents", "Travel signature", "Medication and health", "Accommodation and money", "Emergency contacts"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    fireEvent.change(screen.getByLabelText(/Departure date/), { target: { value: "2026-12-20" } });
    fireEvent.click(screen.getByRole("button", { name: /missing to Tasks/ }));
    await waitFor(() => expect(onAddTasks).toHaveBeenCalled());
    const [items, options] = onAddTasks.mock.calls[0];
    expect(options).toEqual({ dueDate: "2026-12-20" });
    expect(items.every((item) => item.category === "Travel")).toBe(true);
    expect(items.some((item) => /Passport is valid/.test(item.title))).toBe(false);
  });

  test("saves checkbox changes and custom items", async () => {
    const onSaveChecklist = vi.fn().mockResolvedValue();
    wrap(<TravelPage have={[]} custom={[]} onSaveChecklist={onSaveChecklist} onAddTasks={vi.fn()} />);
    fireEvent.click(screen.getByLabelText(/Passport is valid for the length/));
    await waitFor(() => expect(onSaveChecklist).toHaveBeenCalledWith({ have: ["passport-valid"], custom: [] }));
    fireEvent.change(screen.getByLabelText("Item"), { target: { value: "Bring charger" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    await waitFor(() => expect(onSaveChecklist).toHaveBeenLastCalledWith({ have: [], custom: [expect.objectContaining({ label: "Bring charger" })] }));
  });
});

describe("Search page", () => {
  const data = { news: [{ id: "n1", title: "Fixed admission periods" }], guides: [{ id: "g", title: "Set up U.S. banking", summary: "", category: "Money" }], tasks: [], documents: [{ id: "doc-00", name: "Lease.pdf" }] };
  test("groups results and states that document contents are not searched", () => {
    wrap(<SearchPage {...data} />, "/search?q=banking");
    expect(screen.getByRole("heading", { name: "Guides (1)" })).toBeInTheDocument();
    expect(screen.getByText(/never looks inside your documents/i)).toBeInTheDocument();
  });
  test("shows an honest empty result", () => {
    wrap(<SearchPage {...data} />, "/search?q=zzzz");
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();
  });
});

describe("update relevance in the interface", () => {
  test("cards and detail pages explain the match and stay informational", async () => {
    const { default: NewsCard } = await import("../components/NewsCard");
    const { default: NewsDetailPage } = await import("../pages/NewsDetailPage");
    const { Route, Routes } = await import("react-router-dom");
    const item = { id: "n", title: "Rule", visaTypes: ["f-1"], topics: ["employment"], sourceVerified: true };
    wrap(<NewsCard item={item} profile={{ visaType: "F-1", topics: ["employment"] }} />);
    expect(screen.getByText("May be relevant to you")).toBeInTheDocument();
    expect(screen.getByText(/Matched on visa type, saved topics/)).toBeInTheDocument();
    cleanup();
    render(<MemoryRouter initialEntries={["/news/n"]}><Routes><Route path="news/:id" element={<NewsDetailPage localMode items={[item]} profile={{ visaType: "F-1" }} />} /></Routes></MemoryRouter>);
    expect(screen.getByText(/does not mean the update legally applies to you/i)).toBeInTheDocument();
  });
  test("nothing is shown without a match", async () => {
    const { default: NewsCard } = await import("../components/NewsCard");
    wrap(<NewsCard item={{ id: "n", title: "Rule", visaTypes: ["j-1"] }} profile={{ visaType: "F-1" }} />);
    expect(screen.queryByText("May be relevant to you")).not.toBeInTheDocument();
  });
});
