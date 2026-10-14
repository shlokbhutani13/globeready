import { describe, expect, it } from "vitest";
import { addCustomDocument, cleanReadiness, clearReadiness, documentRows, documentTypes, limits, loadReadiness, readinessSummary, removeCustomDocument, saveReadiness, setMark } from "../lib/document-readiness";
import { keyDateKinds } from "../lib/key-dates";

const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const empty = { marks: {}, custom: [] };

describe("document types", () => {
  it("covers the important documents and ties dates to Key dates kinds that exist", () => {
    expect(documentTypes.length).toBeGreaterThanOrEqual(12);
    const kinds = new Set(keyDateKinds.map((kind) => kind.id));
    for (const type of documentTypes.filter((entry) => entry.dateKind)) expect(kinds.has(type.dateKind), type.id).toBe(true);
    expect(new Set(documentTypes.map((type) => type.id)).size).toBe(documentTypes.length);
  });
  it("never claims to verify anything", () => {
    expect(JSON.stringify(documentTypes)).not.toMatch(/valid|verified|genuine|authentic/iu);
  });
});

describe("rows and dates", () => {
  it("reads passport, visa and I-20 dates from Key dates instead of asking again", () => {
    const rows = documentRows(empty, [{ kind: "passport", date: "2026-12-01", label: "P" }, { kind: "passport", date: "2026-10-01", label: "old" }, { kind: "visa", date: "2030-01-01" }], now);
    const passport = rows.find((row) => row.id === "passport");
    expect(passport).toMatchObject({ date: "2026-12-01", dateSource: "key-dates", dateState: "soon", days: 48 });
    expect(rows.find((row) => row.id === "visa")).toMatchObject({ dateState: "later" });
    expect(rows.find((row) => row.id === "i20")).toMatchObject({ date: "", dateState: null, hasKeyDateKind: true });
  });
  it("flags a date that has passed without saying the document is invalid", () => {
    const rows = documentRows(empty, [{ kind: "insurance", date: "2026-09-01" }], now);
    expect(rows.find((row) => row.id === "insurance").dateState).toBe("past");
  });
  it("uses a typed expiry only for documents without a Key dates kind", () => {
    let state = setMark(empty, "work-card", { status: "have", expiry: "2027-02-01" });
    state = setMark(state, "ssn", { expiry: "2027-02-01" });
    state = cleanReadiness(state);
    const rows = documentRows(state, [], now);
    expect(rows.find((row) => row.id === "work-card")).toMatchObject({ date: "2027-02-01", dateSource: "typed", dateState: "later" });
    expect(rows.find((row) => row.id === "ssn").date).toBe("");
    expect(rows.find((row) => row.id === "passport").date).toBe("");
  });
  it("summarizes what is marked", () => {
    let state = setMark(empty, "passport", { status: "have" });
    state = setMark(state, "visa", { status: "missing" });
    state = setMark(state, "i20", { status: "review" });
    const summary = readinessSummary(documentRows(state, [{ kind: "passport", date: "2026-11-01" }], now));
    expect(summary).toMatchObject({ have: 1, missing: 1, review: 1, dateSoon: 1, total: documentTypes.length });
    expect(summary.unmarked).toBe(documentTypes.length - 3);
  });
});

describe("editing and storage", () => {
  it("adds, marks and removes your own documents", () => {
    let state = addCustomDocument(empty, "  Vaccination card ", "xabc1");
    state = setMark(state, "xabc1", { status: "have", expiry: "2027-01-01", note: "In the blue folder" });
    expect(documentRows(state, [], now).find((row) => row.id === "xabc1")).toMatchObject({ label: "Vaccination card", date: "2027-01-01", custom: true, note: "In the blue folder" });
    state = removeCustomDocument(state, "xabc1");
    expect(state.custom).toEqual([]);
    expect(state.marks.xabc1).toBeUndefined();
    expect(() => addCustomDocument(empty, " ")).toThrow(/Type the name/u);
    let full = empty;
    for (let i = 0; i < limits.custom; i += 1) full = addCustomDocument(full, `d${i}`, `xid${i}a`);
    expect(() => addCustomDocument(full, "more")).toThrow(/up to 10/u);
    expect(() => setMark(empty, "work-card", { expiry: "2027-02-31" })).toThrow(/real date/u);
  });
  it("round-trips per account, validates, and survives blocked storage", () => {
    const store = memory();
    saveReadiness(store, "u", setMark(empty, "passport", { status: "have", note: "x".repeat(500) }));
    const loaded = loadReadiness(store, "u");
    expect(loaded.marks.passport.status).toBe("have");
    expect(loaded.marks.passport.note).toHaveLength(limits.note);
    expect(loadReadiness(store, "other")).toEqual(empty);
    expect(cleanReadiness({ marks: { bogus: { status: "have" }, passport: { status: "valid!" } }, custom: [{ id: "bad", label: "x" }] })).toEqual({ marks: { passport: { status: "", expiry: "", note: "" } }, custom: [] });
    clearReadiness(store, "u");
    expect(loadReadiness(store, "u")).toEqual(empty);
    const blocked = { getItem: () => "{oops", setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(loadReadiness(blocked, "u")).toEqual(empty);
    expect(() => saveReadiness(blocked, "u", empty)).toThrow(/would not save/u);
    expect(() => clearReadiness(blocked, "u")).not.toThrow();
  });
});
