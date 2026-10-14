import { describe, expect, test } from "vitest";
import { glossary, searchGlossary } from "../data/glossary";
import { helpOrder, pageHelp, pageHelpTitles } from "../data/page-help";
import { setupProgress, setupSteps } from "../lib/setup-guide";

describe("glossary", () => {
  test("has unique ids, terms and plain meanings", () => {
    expect(new Set(glossary.map((entry) => entry.id)).size).toBe(glossary.length);
    expect(glossary.length).toBeGreaterThanOrEqual(20);
    for (const entry of glossary) {
      expect(entry.meaning.length, entry.id).toBeGreaterThan(40);
      expect(entry.term && entry.short, entry.id).toBeTruthy();
    }
  });
  test("includes the terms students meet first", () => {
    const ids = glossary.map((entry) => entry.id);
    for (const id of ["dso", "i20", "sevis", "opt", "cpt", "i94", "rfe", "visa-vs-status", "ds"]) expect(ids).toContain(id);
  });
  test("avoids stating numbers of days or fees that depend on a category", () => {
    for (const entry of glossary) expect(entry.meaning, entry.id).not.toMatch(/\b\d+\s*(-|\s)?days?\b|\$\d/iu);
  });
  test("points to a school official or the official source for anything status-related", () => {
    const risky = glossary.filter((entry) => ["grace-period", "change-of-status", "travel-signature", "stem-opt", "ds"].includes(entry.id));
    for (const entry of risky) expect(entry.meaning, entry.id).toMatch(/DSO|rule/u);
  });
  test("searches terms and meanings ignoring case", () => {
    expect(searchGlossary("work authorization").map((entry) => entry.id)).toContain("ead");
    expect(searchGlossary("OPT").length).toBeGreaterThan(0);
    expect(searchGlossary("zzzzzz")).toEqual([]);
    expect(searchGlossary("  ")).toHaveLength(glossary.length);
  });
});

describe("page help", () => {
  test("every help topic says what, how, and what it does not do, and has a title", () => {
    expect(Object.keys(pageHelp).sort()).toEqual([...helpOrder].sort());
    for (const id of helpOrder) {
      expect(pageHelp[id].what.length, id).toBeGreaterThan(20);
      expect(pageHelp[id].how.length, id).toBeGreaterThanOrEqual(3);
      expect(pageHelp[id].not.length, id).toBeGreaterThan(20);
      expect(pageHelpTitles[id], id).toBeTruthy();
    }
  });
});

describe("setup guide", () => {
  test("starts with nothing done and the profile step next", () => {
    const steps = setupSteps({});
    expect(steps.map((step) => step.id)).toEqual(["profile", "dates", "contact", "journey", "topics", "documents"]);
    const progress = setupProgress(steps);
    expect(progress).toMatchObject({ done: 0, total: 5, complete: false });
    expect(progress.next.id).toBe("profile");
  });
  test("marks steps done from what the student entered", () => {
    const steps = setupSteps({ profile: { visaType: "F-1", university: "X", journeyStage: "Newly arrived", topics: ["status"] }, dates: [{ id: "d" }], contacts: [{ role: "personal" }], tasks: [] });
    expect(Object.fromEntries(steps.map((step) => [step.id, step.done]))).toEqual({ profile: true, dates: true, contact: false, journey: false, topics: true, documents: false });
    expect(setupProgress(steps).next.id).toBe("contact");
  });
  test("a DSO or international office contact counts; the optional step never blocks completion", () => {
    const steps = setupSteps({ profile: { visaType: "F-1", university: "X", journeyStage: "Y", topics: ["status"] }, dates: [{}], contacts: [{ role: "international-office" }], tasks: [{}] });
    const progress = setupProgress(steps);
    expect(progress).toMatchObject({ done: 5, total: 5, complete: true, next: null });
    expect(steps.find((step) => step.id === "documents").done).toBe(false);
  });
  test("treats blank profile fields as missing and reads document consent", () => {
    expect(setupSteps({ profile: { visaType: " ", university: "X", journeyStage: "Y" } })[0].done).toBe(false);
    expect(setupSteps({ consent: { documents: true } }).find((step) => step.id === "documents").done).toBe(true);
  });
});
