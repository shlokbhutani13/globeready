import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ForYouPage from "../pages/ForYouPage";
import UniversityPage from "../pages/UniversityPage";

afterEach(cleanup);
const now = new Date(2026, 9, 14);
const news = [{ id: "n1", title: "Fixed periods replace duration of status", publisher: "DHS", visaTypes: ["f-1"], journeyStages: ["enrolled"], topics: ["status"], universityIds: [], effectiveAt: "2026-09-15" }];
const wrap = (element) => render(<MemoryRouter>{element}</MemoryRouter>);

describe("ForYouPage", () => {
  const profile = { visaType: "F-1", journeyStage: "Current student", university: "Example University", topics: ["employment"] };
  it("states up front that matches are informational, not legal conclusions", () => {
    wrap(<ForYouPage profile={profile} news={news} now={now} />);
    expect(screen.getByRole("heading", { level: 1, name: "What may apply to you" })).toBeTruthy();
    expect(screen.getByText(/informational matches, not legal conclusions/u)).toBeTruthy();
  });
  it("shows the four profile inputs and the reason for each matched update", () => {
    wrap(<ForYouPage profile={profile} news={news} now={now} />);
    const inputs = screen.getByText("What we match on").closest("section");
    for (const label of ["Visa type", "Journey stage", "University", "Saved topics"]) expect(within(inputs).getByText(label)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Fixed periods replace duration of status" })).toBeTruthy();
    expect(screen.getByText(/Matched on your visa type \(F-1\) and journey stage \(Current student\)/u)).toBeTruthy();
  });
  it("shows matching library entries with official links", () => {
    wrap(<ForYouPage profile={profile} news={[]} now={now} />);
    expect(screen.getByText(/Rules and forms that may be relevant/u)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /official source/u }).length).toBeGreaterThan(0);
  });
  it("asks for details instead of showing matches when the profile is empty", () => {
    wrap(<ForYouPage profile={{}} news={news} now={now} />);
    expect(screen.getByText("Add a few details to see matches")).toBeTruthy();
    expect(screen.queryByText(/Updates that may be relevant/u)).toBeNull();
  });
  it("tells the student about missing inputs without guessing", () => {
    wrap(<ForYouPage profile={{ visaType: "F-1" }} news={[]} now={now} />);
    expect(screen.getByText(/Nothing is guessed for fields you leave empty/u)).toBeTruthy();
  });
  it("lists what is coming up from tasks, key dates and cases", () => {
    wrap(<ForYouPage profile={profile} now={now} tasks={[{ id: "t", title: "Pay SEVIS fee", dueDate: "2026-10-20" }]} dates={[{ id: "c-1", caseId: "c", label: "OPT: appointment", date: "2026-10-18" }]} />);
    const section = screen.getByText("Coming up in the next 30 days").closest("section");
    expect(within(section).getAllByRole("listitem").map((item) => item.textContent)).toEqual([expect.stringContaining("OPT: appointment"), expect.stringContaining("Pay SEVIS fee")]);
  });
  it("says so when a loaded list is empty", () => {
    wrap(<ForYouPage profile={{ visaType: "J-1" }} news={[]} now={now} />);
    expect(screen.getByText(/No reviewed update matches your details/u)).toBeTruthy();
    expect(screen.getByText(/No tasks, key dates or case dates in the next 30 days/u)).toBeTruthy();
  });
});

describe("UniversityPage", () => {
  it("prompts for a university when none is saved", () => {
    wrap(<UniversityPage profile={{}} />);
    expect(screen.getByText("No university added yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add your university" })).toBeTruthy();
  });
  it("is honest that an unreviewed university is not reviewed, and offers a way to add its website", () => {
    wrap(<UniversityPage profile={{ university: "Example University" }} />);
    expect(screen.getAllByText("Not reviewed").length).toBeGreaterThan(0);
    expect(screen.getByText(/no reviewed sources for your university/u)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add your university's website" })).toBeTruthy();
  });
  it("builds clearly labelled search links from the website the student entered", () => {
    wrap(<UniversityPage profile={{ university: "Example University", officialUniversityDomain: "example.edu" }} />);
    expect(screen.getByText(/GlobeReady has not checked the results/u)).toBeTruthy();
    const link = screen.getByRole("link", { name: "International student office: search" });
    expect(decodeURIComponent(link.getAttribute("href"))).toContain("site:example.edu");
    expect(screen.getByRole("link", { name: /Open example\.edu/u }).getAttribute("href")).toBe("https://example.edu");
  });
  it("saves a link, warning when it is not on the university's website, and removes it", async () => {
    const onSaveLink = vi.fn().mockResolvedValue({});
    const onRemoveLink = vi.fn().mockResolvedValue({});
    wrap(<UniversityPage profile={{ university: "Example University", officialUniversityDomain: "example.edu" }} savedResources={[{ id: "a", title: "Intl office", url: "https://intl.example.edu/", category: "University" }, { id: "b", title: "Other site", url: "https://example.com/", category: "University" }, { id: "g", title: "A guide", url: "https://uscis.gov/", category: "Visa" }]} onSaveLink={onSaveLink} onRemoveLink={onRemoveLink} />);
    const list = screen.getByRole("list", { name: "Saved university links" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("On example.edu")).toBeTruthy();
    expect(within(list).getByText(/Not on example\.edu/u)).toBeTruthy();
    const form = screen.getByRole("form", { name: "Save a university link" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Housing" } });
    fireEvent.change(within(form).getByLabelText(/Web address/u), { target: { value: "https://housing.example.edu/" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save link" }));
    await screen.findByText("Link saved.");
    expect(onSaveLink).toHaveBeenCalledWith({ title: "Housing", url: "https://housing.example.edu/", category: "University", source: "example.edu" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Intl office" }));
    expect(onRemoveLink).toHaveBeenCalledWith("a");
  });
  it("keeps the form values and explains a refused link", async () => {
    wrap(<UniversityPage profile={{ university: "X University" }} onSaveLink={vi.fn().mockRejectedValue(new Error("Resource URL must use https."))} />);
    const form = screen.getByRole("form", { name: "Save a university link" });
    fireEvent.change(within(form).getByLabelText("Name"), { target: { value: "Bad" } });
    fireEvent.change(within(form).getByLabelText(/Web address/u), { target: { value: "http://x.edu" } });
    fireEvent.submit(form);
    expect((await within(form).findByRole("alert")).textContent).toContain("https");
    expect(within(form).getByLabelText("Name").value).toBe("Bad");
  });
  it("shows only school contacts, and an empty state when there are none", () => {
    const { unmount } = wrap(<UniversityPage profile={{ university: "X University" }} contacts={[{ id: "1", name: "Dr. Rao", role: "dso", phone: "555-0100" }, { id: "2", name: "Mom", role: "personal" }]} />);
    expect(screen.getByText("Dr. Rao")).toBeTruthy();
    expect(screen.queryByText("Mom")).toBeNull();
    unmount();
    wrap(<UniversityPage profile={{ university: "X University" }} />);
    expect(screen.getByText("No school contacts saved")).toBeTruthy();
  });
  it("lists reviewed updates for the university, or says there are none", () => {
    const { unmount } = wrap(<UniversityPage profile={{ university: "Example University" }} news={[{ id: "u1", title: "Campus notice", publisher: "Example", universityIds: ["example-university"] }]} />);
    expect(screen.getByRole("link", { name: "Campus notice" })).toBeTruthy();
    unmount();
    wrap(<UniversityPage profile={{ university: "Example University" }} />);
    expect(screen.getByText(/no reviewed updates for Example University yet/u)).toBeTruthy();
  });
});
