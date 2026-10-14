import { describe, expect, test } from "vitest";
import { journeyItemsFor, journeyStages, journeyDisclaimer } from "../data/journey-templates";
import { allTravelItems, travelSections } from "../data/travel-checklist";
import { stageProgress, suggestedDueDate, tasksFromItems } from "../lib/planner";

describe("journey templates", () => {
  test("every template covers all six stages and labels itself as general guidance", () => {
    for (const visa of ["F-1", "J-1", "Other", ""]) {
      const items = journeyItemsFor(visa);
      for (const stage of journeyStages) expect(items.some((item) => item.stage === stage.id), `${visa} ${stage.id}`).toBe(true);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    }
    expect(journeyDisclaimer).toMatch(/general guidance/i);
  });

  test("visa-specific items appear only for that visa", () => {
    expect(journeyItemsFor("F-1").some((item) => item.id.startsWith("f1-"))).toBe(true);
    expect(journeyItemsFor("F-1").some((item) => item.id.startsWith("j1-"))).toBe(false);
    expect(journeyItemsFor("J-1").some((item) => item.id.startsWith("j1-"))).toBe(true);
    expect(journeyItemsFor("Other").some((item) => /^(f1|j1)-/.test(item.id))).toBe(false);
  });

  test("items never state a legal conclusion and always route to an official", () => {
    for (const item of journeyItemsFor("F-1")) expect(item.title).not.toMatch(/\byou (are|will be) (eligible|allowed|authorized)\b/i);
  });
});

describe("planner logic", () => {
  test("suggested dates count from the student's own dates and are empty without them", () => {
    expect(suggestedDueDate({ anchor: "start", offsetDays: -30 }, { startDate: "2026-08-20" })).toBe("2026-07-21");
    expect(suggestedDueDate({ anchor: "graduation", offsetDays: 14 }, { graduationDate: "2028-05-15" })).toBe("2028-05-29");
    expect(suggestedDueDate({ anchor: "start", offsetDays: 1 }, {})).toBe("");
    expect(suggestedDueDate({}, { startDate: "2026-08-20" })).toBe("");
  });

  test("creating tasks skips ones that already exist and duplicates in the same batch", () => {
    const items = [{ title: "Check passport", priority: "high" }, { title: "check passport " }, { title: "Pack charger", category: "Travel" }];
    const tasks = tasksFromItems(items, [{ title: "Pack Charger" }], {}, {});
    expect(tasks).toEqual([{ title: "Check passport", category: "General", priority: "high", dueDate: "" }]);
  });

  test("travel items can be added with the departure date as the due date", () => {
    const tasks = tasksFromItems([{ label: "Passport is valid", category: "Travel" }], [], {}, { dueDate: "2026-12-01" });
    expect(tasks[0]).toMatchObject({ title: "Passport is valid", dueDate: "2026-12-01", category: "Travel" });
  });

  test("progress counts items marked as had", () => {
    expect(stageProgress([{ id: "a" }, { id: "b" }], ["a", "zzz"])).toEqual({ total: 2, done: 1 });
  });

  test("travel checklist has every required section and merges custom items", () => {
    expect(travelSections.map((section) => section.id)).toEqual(["passport", "visa", "documents", "signature", "medication", "accommodation", "emergency"]);
    const items = allTravelItems([{ id: "c1", label: "Charger" }]);
    expect(items.at(-1)).toMatchObject({ id: "c1", custom: true });
  });
});
