import { describe, expect, it } from "vitest";
import { addMonths, budgetCsv, cleanBudget, clearBudget, csvCell, emptyBudget, formatAmount, limits, loadBudget, monthlyCents, parseAmount, removeItem, saveBudget, setCurrency, setStartMonth, summarize, upsertItem } from "../lib/budget";

const now = new Date(2026, 9, 14);
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const plan = () => {
  let b = emptyBudget(now);
  b = upsertItem(b, { label: "Rent", category: "housing", kind: "recurring", frequency: "monthly", amount: "1,200.50" }, "brent");
  b = upsertItem(b, { label: "Groceries", category: "food", kind: "recurring", frequency: "weekly", amount: "60" }, "bfood");
  b = upsertItem(b, { label: "Bus pass", category: "transport", kind: "recurring", frequency: "yearly", amount: "120" }, "bbus");
  b = upsertItem(b, { label: "Deposit", category: "arrival", kind: "one-time", month: "2026-11", amount: "900" }, "bdep");
  b = upsertItem(b, { label: "Bedding", category: "arrival", kind: "one-time", amount: "80.25" }, "bbed");
  b = upsertItem(b, { label: "Far away", category: "other", kind: "one-time", month: "2028-01", amount: "10" }, "bfar");
  return b;
};

describe("amounts", () => {
  it("parses exact cents and rejects anything else", () => {
    expect(parseAmount("1,200.50")).toBe(120050);
    expect(parseAmount("0.1")).toBe(10);
    expect(parseAmount("19.99")).toBe(1999);
    for (const bad of ["", "-5", "$5", "1.234", "abc", "1e3", "5."]) expect(() => parseAmount(bad), bad).toThrow(/Enter an amount/u);
    expect(() => parseAmount("99999999999")).toThrow(/too large/u);
  });
  it("formats without converting currencies", () => {
    expect(formatAmount(120050, "EUR")).toBe("EUR 1,200.50");
  });
});

describe("totals", () => {
  const s = summarize(plan(), { months: 12 });
  it("turns weekly and yearly costs into a monthly equivalent", () => {
    expect(monthlyCents({ kind: "recurring", frequency: "weekly", cents: 6000 })).toBe(26000);
    expect(monthlyCents({ kind: "recurring", frequency: "yearly", cents: 12000 })).toBe(1000);
    expect(monthlyCents({ kind: "one-time", cents: 5 })).toBe(0);
    expect(s.monthly).toBe(120050 + 26000 + 1000);
  });
  it("totals one-time costs and keeps undated and out-of-range ones apart", () => {
    expect(s.oneTime).toBe(90000 + 8025 + 1000);
    expect(s.undated).toBe(8025);
    expect(s.outsideRange).toBe(1000);
  });
  it("builds a month-by-month view starting at the chosen month", () => {
    expect(s.timeline).toHaveLength(12);
    expect(s.timeline[0].month).toBe("2026-10");
    expect(s.timeline[1]).toMatchObject({ month: "2026-11", oneTime: 90000, total: s.monthly + 90000 });
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(s.firstYear).toBe(s.monthly * 12 + 90000 + 8025);
  });
  it("totals by category and leaves out empty ones", () => {
    expect(s.categories.map((c) => c.id)).toEqual(["housing", "food", "transport", "arrival", "other"]);
    expect(s.categories.find((c) => c.id === "arrival").oneTime).toBe(98025);
  });
  it("starts from a different month", () => {
    const b = setStartMonth(plan(), "2026-11");
    expect(summarize(b).timeline[0]).toMatchObject({ month: "2026-11", oneTime: 90000 });
    expect(() => setStartMonth(b, "2026-13")).toThrow(/real start month/u);
  });
});

describe("validation and storage", () => {
  it("explains bad input in plain words", () => {
    const b = emptyBudget(now);
    expect(() => upsertItem(b, { label: " ", category: "food", kind: "one-time", amount: "1" })).toThrow(/short name/u);
    expect(() => upsertItem(b, { label: "x", category: "nope", kind: "one-time", amount: "1" })).toThrow(/category/u);
    expect(() => upsertItem(b, { label: "x", category: "food", kind: "recurring", amount: "1" })).toThrow(/how often/u);
    expect(() => upsertItem(b, { label: "x", category: "food", kind: "one-time", month: "2026-00", amount: "1" })).toThrow(/real month/u);
    expect(() => setCurrency(b, "dollars")).toThrow(/three-letter/u);
    expect(setCurrency(b, "eur").currency).toBe("EUR");
    let full = b;
    for (let i = 0; i < limits.items; i += 1) full = upsertItem(full, { label: `c${i}`, category: "other", kind: "one-time", amount: "1" }, `b${String(i).padStart(4, "0")}`);
    expect(() => upsertItem(full, { label: "one more", category: "other", kind: "one-time", amount: "1" })).toThrow(/up to 200/u);
  });
  it("edits and removes an item", () => {
    let b = plan();
    b = upsertItem(b, { label: "Rent", category: "housing", kind: "recurring", frequency: "monthly", amount: "1300" }, "brent");
    expect(b.items.find((i) => i.id === "brent").cents).toBe(130000);
    expect(b.items).toHaveLength(6);
    expect(removeItem(b, "brent").items).toHaveLength(5);
  });
  it("round-trips per account, drops damaged entries, survives blocked storage", () => {
    const store = memory();
    saveBudget(store, "u", plan(), now);
    expect(loadBudget(store, "u", now).items).toHaveLength(6);
    expect(loadBudget(store, "other", now).items).toHaveLength(0);
    const dirty = cleanBudget({ currency: "us", startMonth: "bad", items: [{ id: "bad!", label: "x" }, { id: "bgood", label: "Ok", category: "food", kind: "one-time", cents: 100 }, { id: "bneg", label: "Neg", category: "food", kind: "one-time", cents: -5 }] }, now);
    expect(dirty).toMatchObject({ currency: "USD", startMonth: "2026-10" });
    expect(dirty.items.map((i) => i.id)).toEqual(["bgood"]);
    clearBudget(store, "u");
    expect(loadBudget(store, "u", now).items).toEqual([]);
    const blocked = { getItem: () => "{oops", setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("full"); } };
    expect(loadBudget(blocked, "u", now).items).toEqual([]);
    expect(() => saveBudget(blocked, "u", plan(), now)).toThrow(/would not save/u);
    expect(() => clearBudget(blocked, "u")).not.toThrow();
  });
});

describe("CSV export", () => {
  it("escapes quotes, commas and line breaks, and neutralises formulas", () => {
    expect(csvCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1 555")).toBe("'+1 555");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell(12.5)).toBe("12.5");
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });
  it("includes costs, category totals, monthly summary and totals with plain decimals", () => {
    const csv = budgetCsv(plan());
    expect(csv).toContain("Name,Category,Type,How often,Amount,Currency,Month,Monthly equivalent,Note");
    expect(csv).toContain("Rent,Housing and rent,Repeats,Every month,1200.50,USD,,1200.50,");
    expect(csv).toContain("Groceries,Food,Repeats,Every week,60.00,USD,,260.00,");
    expect(csv).toContain("Deposit,Arrival and setup,One-time,,900.00,USD,2026-11,,");
    expect(csv).toContain("Month by month from 2026-10");
    expect(csv).toContain("2026-11,1470.50,900.00,2370.50,USD");
    expect(csv).toContain("Repeating per month,1470.50,USD");
    expect(csv.split("\r\n").length).toBeGreaterThan(30);
    expect(csv).not.toMatch(/\$/u);
  });
  it("neutralises a formula typed as a name", () => {
    const b = upsertItem(emptyBudget(now), { label: "=1+1", category: "other", kind: "one-time", amount: "5" }, "bx00");
    expect(budgetCsv(b)).toContain("'=1+1,Other,One-time");
  });
});
