import { describe, expect, test } from "vitest";
import { createDeviceBackup, planDeviceRestore, applyDeviceRestore } from "../lib/device-backup";

const memory = () => {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
};

const sourceData = {
  budget: { currency: "USD", startMonth: "2026-10", items: [{ id: "brent", label: "Rent", category: "housing", kind: "recurring", cents: 80000, note: "", frequency: "monthly" }] },
  readiness: { marks: { passport: { status: "have", expiry: "", note: "drawer" } }, custom: [] },
  emergencyCard: { values: { allergies: "Peanuts" }, include: { allergies: true }, options: {}, contactIds: ["contact-1"] },
  universityWorkspace: { questions: { "rec-dates": { ask: true, answer: "Bring the form" } }, custom: [], terms: [] },
  newsSeen: { "story-1": "2026-10-01" },
  savedSearches: [{ id: "search1", name: "OPT", filters: { q: "opt" } }],
  snoozes: { "task:1": "2099-01-01" },
};

describe("device-only backup", () => {
  test("exports a versioned same-account archive containing only the supported local sections", () => {
    const archive = createDeviceBackup({ uid: "student", data: sourceData, now: new Date("2026-10-14T12:00:00Z") });
    expect(archive).toEqual({
      kind: "globeready-device-backup",
      schemaVersion: 1,
      uid: "student",
      exportedAt: "2026-10-14T12:00:00.000Z",
      data: sourceData,
    });
    expect(JSON.stringify(archive)).not.toContain("profile");
    expect(JSON.stringify(archive)).not.toContain("document text");
  });

  test("rejects malformed, unsupported, oversized and cross-account files without writing", () => {
    expect(planDeviceRestore("nope", { uid: "student" })).toMatchObject({ ok: false });
    expect(planDeviceRestore(JSON.stringify({ kind: "globeready-device-backup", schemaVersion: 2, uid: "student", data: {} }), { uid: "student" }).error).toMatch(/version/iu);
    expect(planDeviceRestore(JSON.stringify({ kind: "globeready-device-backup", schemaVersion: 1, uid: "other", data: sourceData }), { uid: "student" }).error).toMatch(/different account/iu);
    expect(planDeviceRestore("x".repeat(1_000_001), { uid: "student" }).error).toMatch(/larger than/iu);
  });

  test("validates every section and returns a human-readable replacement preview", () => {
    const text = JSON.stringify(createDeviceBackup({ uid: "student", data: sourceData }));
    const plan = planDeviceRestore(text, { uid: "student" });
    expect(plan.ok).toBe(true);
    expect(plan.sections).toEqual([
      { id: "budget", label: "budget", count: 1 },
      { id: "readiness", label: "documents checklist", count: 1 },
      { id: "emergencyCard", label: "emergency card", count: 2 },
      { id: "universityWorkspace", label: "appointment preparation", count: 1 },
      { id: "newsSeen", label: "seen update markers", count: 1 },
      { id: "savedSearches", label: "saved searches", count: 1 },
      { id: "snoozes", label: "snoozed next steps", count: 1 },
    ]);
    const damaged = structuredClone(JSON.parse(text));
    damaged.data.budget.items[0].category = "not-real";
    expect(planDeviceRestore(JSON.stringify(damaged), { uid: "student" }).error).toMatch(/budget/iu);
  });

  test("writes nothing before confirmation, then replaces only the supported scoped keys", () => {
    const storage = memory();
    storage.setItem("unrelated", "keep");
    const plan = planDeviceRestore(JSON.stringify(createDeviceBackup({ uid: "student", data: sourceData })), { uid: "student" });
    expect(storage.values.size).toBe(1);
    const result = applyDeviceRestore(plan, storage, "student");
    expect(result.sections).toBe(7);
    expect(storage.getItem("unrelated")).toBe("keep");
    expect(JSON.parse(storage.getItem("globeready:budget:v1:student"))).toEqual(sourceData.budget);
    expect(JSON.parse(storage.getItem("globeready:emergency-card:v1:student")).values.allergies).toBe("Peanuts");
    expect(JSON.parse(storage.getItem("globeready:news-searches:v1:student"))[0].name).toBe("OPT");
  });

  test("accepts harmless section reordering but rejects impossible snooze dates", () => {
    const archive = createDeviceBackup({ uid: "student", data: sourceData });
    archive.data = Object.fromEntries(Object.entries(archive.data).reverse());
    expect(planDeviceRestore(JSON.stringify(archive), { uid: "student" }).ok).toBe(true);
    archive.data.snoozes["task:1"] = "2099-02-31";
    expect(planDeviceRestore(JSON.stringify(archive), { uid: "student" }).error).toMatch(/snoozed next steps/iu);
  });

  test("rolls back every supported key if browser storage fails partway through", () => {
    const storage = memory();
    const original = JSON.stringify({ old: true });
    storage.setItem("globeready:budget:v1:student", original);
    const baseSet = storage.setItem;
    storage.setItem = (key, value) => {
      if (key.includes("emergency-card")) throw new Error("quota");
      baseSet(key, value);
    };
    const plan = planDeviceRestore(JSON.stringify(createDeviceBackup({ uid: "student", data: sourceData })), { uid: "student" });
    expect(() => applyDeviceRestore(plan, storage, "student")).toThrow(/could not replace/iu);
    expect(storage.getItem("globeready:budget:v1:student")).toBe(original);
    expect(storage.getItem("globeready:doc-readiness:v1:student")).toBeNull();
  });
});
