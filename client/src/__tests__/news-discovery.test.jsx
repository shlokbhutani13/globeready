import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NewsPage from "../pages/NewsPage";
import NewsExplainer from "../components/NewsExplainer";
import { applyDiscovery, clearNewsDeviceData, describeSearch, discoveryOptions, loadSearches, loadSeen, markSeen, removeSearch, saveSearch, seenState, splitFilters } from "../lib/news-discovery";
import { explainNews } from "../lib/news-explainer";

afterEach(cleanup);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m }; };
const rule = { id: "a", title: "Fixed admission periods", publisher: "DHS", publishedAt: "2026-07-17", verifiedAt: "2026-07-20", effectiveAt: "2099-09-15", legalState: "effective", sourceId: "federal-register", sourceVerified: true, topics: ["status", "employment"], visaTypes: ["f-1", "j-1"], journeyStages: ["enrolled", "opt"], shortSummary: "DHS replaced duration of status.", detailSections: [{ heading: "What changed", body: "Fixed periods now apply." }] };
const old = { id: "b", title: "Travel notice", publishedAt: "2026-01-01", effectiveAt: "2026-02-01", legalState: "informational", topics: ["travel"], visaTypes: ["m-1"], sourceVerified: true };

describe("discovery logic", () => {
  it("offers only topics and visas that exist in the feed", () => {
    const options = discoveryOptions([rule, old]);
    expect(options.topics.map((t) => t.id)).toEqual(["employment", "status", "travel"]);
    expect(options.visas.map((v) => v.label)).toEqual(["F-1", "J-1", "M-1"]);
  });
  it("narrows by profile match, upcoming effective date, and unread", () => {
    const profile = { visaType: "F-1" };
    expect(applyDiscovery([rule, old], { matchesProfile: true }, { profile }).map((i) => i.id)).toEqual(["a"]);
    expect(applyDiscovery([rule, old], { hasEffectiveDate: true }, { today: "2026-10-14" }).map((i) => i.id)).toEqual(["a"]);
    expect(applyDiscovery([rule, old], { unreadOnly: true }, { seen: { b: "2026-01-01" } }).map((i) => i.id)).toEqual(["a"]);
    expect(applyDiscovery([rule, old], {}, {})).toHaveLength(2);
  });
  it("tracks new, seen and updated items on this device", () => {
    const store = memory();
    expect(seenState(rule, loadSeen(store, "u"))).toBe("new");
    const seen = markSeen(store, "u", [rule]);
    expect(seenState(rule, seen)).toBe("seen");
    expect(seenState({ ...rule, verifiedAt: "2026-08-01" }, seen)).toBe("updated");
    expect(loadSeen(store, "other")).toEqual({});
  });
  it("survives corrupted or blocked storage", () => {
    const bad = { getItem: () => "{not json", setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(loadSeen(bad, "u")).toEqual({});
    expect(loadSearches(bad, "u")).toEqual([]);
    expect(() => markSeen(bad, "u", [rule])).not.toThrow();
    expect(() => saveSearch(bad, "u", "x", { q: "opt" })).toThrow(/would not save/u);
    expect(() => clearNewsDeviceData(bad, "u")).not.toThrow();
  });
  it("saves, names, limits and removes searches", () => {
    const store = memory();
    let list = saveSearch(store, "u", "", { q: "opt", topic: "employment", matchesProfile: true, junk: "x" }, () => "1");
    expect(list[0]).toMatchObject({ id: "1", filters: { q: "opt", topic: "employment", matchesProfile: true } });
    expect(list[0].filters.junk).toBeUndefined();
    expect(list[0].name).toContain("opt");
    expect(() => saveSearch(store, "u", list[0].name, { q: "x" })).toThrow(/already have/u);
    expect(() => saveSearch(store, "u", "empty", {})).toThrow(/Choose a search/u);
    for (let i = 0; i < 9; i += 1) list = saveSearch(store, "u", `s${i}`, { q: `q${i}` }, () => `id${i}`);
    expect(() => saveSearch(store, "u", "one more", { q: "z" })).toThrow(/up to 10/u);
    expect(removeSearch(store, "u", "1")).toHaveLength(9);
    clearNewsDeviceData(store, "u");
    expect(loadSearches(store, "u")).toEqual([]);
  });
  it("splits a saved search into feed filters and page flags and describes it", () => {
    const filters = { q: "travel", visaType: "f-1", unreadOnly: true };
    expect(splitFilters(filters)).toEqual({ feed: { q: "travel", visaType: "f-1" }, flags: { unreadOnly: true } });
    expect(describeSearch(filters)).toBe("“travel”, F-1, not yet seen");
  });
});

describe("reading guide", () => {
  it("is built only from the reviewed record and never states a conclusion about the student", () => {
    const guide = explainNews(rule);
    expect(guide.sections.map((s) => s.heading)).toEqual(["What changed", "Who it may be tagged for", "What to ask your DSO"]);
    expect(guide.sections[0].body[0]).toBe("Fixed periods now apply.");
    expect(guide.sections[1].body[0]).toContain("F-1, J-1");
    expect(guide.sections[1].body[0]).toContain("not a decision about you");
    expect(guide.asks.join(" ")).toContain("2099-09-15");
    expect(guide.asks.join(" ")).toMatch(/work or practical-training/u);
    expect(JSON.stringify(guide)).not.toMatch(/you must|you are required|your deadline/iu);
  });
  it("says so when the record lists nothing, and still gives questions", () => {
    const guide = explainNews({ id: "x", title: "T" });
    expect(guide.sections[0].heading).toBe("Who it may be tagged for");
    expect(guide.sections[0].body[0]).toContain("does not list who");
    expect(guide.asks.length).toBeGreaterThanOrEqual(2);
  });
  it("renders with an informational label", () => {
    render(<NewsExplainer item={rule} />);
    expect(screen.getByRole("heading", { name: "Reading guide" })).toBeTruthy();
    expect(screen.getByText(/Informational guidance/u)).toBeTruthy();
    expect(screen.getByText(/Built from the reviewed record \(reviewed 2026-07-20\)/u)).toBeTruthy();
  });
});

describe("NewsPage discovery (free beta)", () => {
  const renderPage = (extra = {}) => render(<MemoryRouter><NewsPage zeroCostMode items={[rule, old]} filters={{}} onFilterChange={() => {}} storage={memory()} storageScope="u" savedIds={new Set()} {...extra} /></MemoryRouter>);
  it("marks unread items, clears them with Mark all as seen, and filters to them", () => {
    renderPage();
    expect(screen.getAllByText("New").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Mark all as seen" }));
    expect(screen.queryByText("New")).toBeNull();
    fireEvent.click(screen.getByLabelText(/New or changed since I last looked/u));
    expect(screen.getByText("No updates match yet")).toBeTruthy();
  });
  it("narrows with the effective-date option and says it is not a deadline", () => {
    renderPage();
    fireEvent.click(screen.getByLabelText("Has an upcoming effective date"));
    expect(screen.getByText("1 stories")).toBeTruthy();
    expect(screen.getByText(/not a deadline for you/u)).toBeTruthy();
  });
  it("saves a search, shows it, applies it and removes it", () => {
    const changes = [];
    renderPage({ filters: { q: "opt" }, onFilterChange: (f) => changes.push(f) });
    fireEvent.change(screen.getByLabelText("Save this search as"), { target: { value: "My OPT" } });
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));
    const list = screen.getByRole("list", { name: "Saved searches" });
    fireEvent.click(within(list).getByRole("button", { name: "My OPT" }));
    expect(changes.at(-1)).toEqual({ q: "opt" });
    fireEvent.click(screen.getByRole("button", { name: "Remove saved search My OPT" }));
    expect(screen.queryByRole("list", { name: "Saved searches" })).toBeNull();
  });
  it("explains why a save failed", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Save search" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a search word");
  });
  it("is absent outside the free beta", () => {
    renderPage({ zeroCostMode: false });
    expect(screen.queryByLabelText("Has an upcoming effective date")).toBeNull();
  });
});
