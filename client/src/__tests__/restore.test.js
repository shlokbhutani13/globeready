import { describe, expect, test, vi } from "vitest";
import { applyRestore, maxRestoreBytes, planRestore } from "../lib/restore";

const uid = "maya";
const archive = (extra = {}) => ({
  schemaVersion: 2, exportedAt: "2026-10-14T00:00:00.000Z", uid,
  profile: { fullName: "Maya", visaType: "F-1", startDate: "2026-08-20", topics: ["employment"], consent: { documents: true }, updatedAt: { seconds: 1 } },
  tasks: [
    { id: "a", title: "Pay SEVIS fee", dueDate: "2026-11-01", priority: "high", category: "Immigration", completed: true },
    { id: "b", title: "Existing task", dueDate: "2026-11-02" },
    { id: "c", title: "", dueDate: "2026-11-02" },
  ],
  savedResources: [{ id: "r", title: "USCIS", url: "https://www.uscis.gov", category: "status" }, { id: "x", title: "Bad", url: "http://insecure.example" }],
  savedNews: [{ id: "federal-register-1", newsItemId: "federal-register-1" }, { id: "../evil", newsItemId: "../evil" }],
  trackedDates: [{ id: "d", label: "Passport", kind: "passport", date: "2028-03-01", remindDays: 90 }],
  contacts: [{ id: "k", name: "Dr. Rao", role: "dso", email: "dso@school.edu" }],
  planner: [{ id: "travel", have: ["passport-valid"], custom: [{ id: "c1", label: "Charger" }] }],
  documents: [{ id: "doc-00", name: "i20.pdf", chunks: [{ page: 1, text: "x" }] }],
  ...extra,
});
const plan = (value, existing = {}) => planRestore(JSON.stringify(value), { uid, existing });

describe("restore preview", () => {
  test("accepts a valid export, separates invalid and duplicate records, and counts what would be written", () => {
    const result = plan(archive(), { tasks: [{ title: "existing task", dueDate: "2026-11-02" }], profile: { fullName: "Already Set" } });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ tasks: 1, savedResources: 1, savedNews: 1, trackedDates: 1, contacts: 1, cases: 0, planner: 1 });
    expect(result.duplicates).toBe(1);
    expect(result.invalid.map((entry) => entry.section).sort()).toEqual(["savedNews", "savedResources", "tasks"]);
    expect(result.profileFill).toEqual({ visaType: "F-1", startDate: "2026-08-20", topics: ["employment"] });
    expect(result.add.tasks[0].completed).toBe(true);
    expect(result.writes).toBe(1 + 1 + 1 + 1 + 1 + 1 + 1 + 1);
    expect(result.notRestored.join(" ")).toMatch(/1 document/);
    expect(result.notRestored.join(" ")).toMatch(/Privacy choices/);
  });

  test("never restores into a different account or an unsupported version", () => {
    expect(planRestore(JSON.stringify(archive({ uid: "someone-else" })), { uid }).error).toMatch(/different account/);
    expect(plan(archive({ schemaVersion: 1 })).error).toMatch(/not supported/);
    expect(planRestore(JSON.stringify(archive()), { uid: "" }).ok).toBe(false);
  });

  test("rejects malformed, oversized and over-limit files before any record is examined", () => {
    expect(planRestore("", { uid }).error).toMatch(/empty/);
    expect(planRestore("{not json", { uid }).error).toMatch(/not JSON/);
    expect(planRestore("[]", { uid }).ok).toBe(false);
    expect(planRestore(" ".repeat(maxRestoreBytes + 1), { uid }).error).toMatch(/10 MB/);
    expect(plan(archive({ tasks: "nope" })).error).toMatch(/not a list/);
    expect(plan(archive({ contacts: Array.from({ length: 51 }, (_, i) => ({ name: `n${i}`, role: "other" })) })).error).toMatch(/more than 50/);
    expect(plan(archive({ tasks: Array.from({ length: 2001 }, (_, i) => ({ title: `t${i}` })) })).error).toMatch(/more than 2000/);
  });

  test("merges: duplicates are skipped, contacts cap at 50 in total, planner progress is a union", () => {
    const contacts = Array.from({ length: 5 }, (_, i) => ({ name: `Person ${i}`, role: "personal" }));
    const capped = plan(archive({ contacts }), { contacts: Array.from({ length: 47 }, (_, i) => ({ name: `Old ${i}`, role: "other" })) });
    expect(capped.add.contacts).toHaveLength(3);
    expect(capped.capped).toEqual([{ section: "contacts", skipped: 2 }]);
    const merged = plan(archive(), { planner: { travel: { have: ["visa-valid"], custom: [{ id: "c0", label: "Own" }] } } });
    expect(merged.add.planner[0]).toMatchObject({ id: "travel", have: ["visa-valid", "passport-valid"] });
    expect(merged.add.planner[0].custom.map((item) => item.id)).toEqual(["c0", "c1"]);
    const same = plan(archive(), { planner: { travel: { have: ["passport-valid"], custom: [{ id: "c1", label: "Charger" }] } } });
    expect(same.add.planner).toHaveLength(0);
  });

  test("a file with nothing new says so", () => {
    const result = plan({ schemaVersion: 2, uid, profile: {}, tasks: [] });
    expect(result.nothingToRestore).toBe(true);
  });
});

describe("applying a confirmed restore", () => {
  const makeStore = (overrides = {}) => ({
    createTask: vi.fn(async () => ({ id: "new-task" })), toggleTask: vi.fn(async () => {}), saveResource: vi.fn(async () => {}), saveNews: vi.fn(async () => {}),
    createTrackedDate: vi.fn(async () => {}), createContact: vi.fn(async () => {}), savePlanner: vi.fn(async () => {}), saveProfile: vi.fn(async () => {}), ...overrides,
  });

  test("only adds records, restores completed tasks through the permitted update, and reports progress", async () => {
    const store = makeStore();
    const progress = vi.fn();
    const result = await applyRestore(plan(archive()), store, { onProgress: progress });
    expect(result).toEqual({ done: 8, total: 8 });
    expect(store.toggleTask).toHaveBeenCalledWith({ id: "new-task", completed: false });
    expect(store.saveProfile).toHaveBeenCalledWith({ fullName: "Maya", visaType: "F-1", startDate: "2026-08-20", topics: ["employment"] });
    expect(progress).toHaveBeenLastCalledWith({ done: 8, total: 8 });
  });

  test("stops at the first failure and says what was kept", async () => {
    const store = makeStore({ saveResource: vi.fn(async () => { throw new Error("quota exceeded"); }) });
    await expect(applyRestore(plan(archive()), store, { concurrency: 1 })).rejects.toThrow(/Restore stopped after \d+ of 8 items \(quota exceeded\)/);
  });

  test("refuses to run without a valid plan", async () => {
    await expect(applyRestore({ ok: false }, makeStore())).rejects.toThrow(/no valid restore plan/);
  });
});

describe("restoring cases and richer tasks", () => {
  const goodCase = { title: "Post-completion OPT", kind: "opt-ead", status: "filed", receiptNumber: "IOE1234567890", timeline: [{ date: "2026-10-01", type: "note", text: "Filed" }] };
  test("validates every case and keeps its history; tasks keep notes, repeat and links", () => {
    const result = plan(archive({ cases: [goodCase, { title: "", kind: "opt-ead" }, { ...goodCase, title: "Bad status", status: "approved" }], tasks: [{ title: "Pay rent", dueDate: "2026-11-01", recurrence: "monthly", notes: "n", links: [{ type: "case", id: "abc" }] }] }));
    expect(result.add.cases).toHaveLength(1);
    expect(result.add.cases[0].timeline).toHaveLength(1);
    expect(result.invalid.filter((item) => item.section === "cases")).toHaveLength(2);
    expect(result.add.tasks[0]).toMatchObject({ recurrence: "monthly", notes: "n", links: [{ type: "case", id: "abc" }] });
  });
  test("skips a case that already exists and caps the total at 50", () => {
    expect(plan(archive({ cases: [goodCase] }), { cases: [{ title: "post-completion opt", kind: "opt-ead", receiptNumber: "ioe1234567890" }] }).duplicates).toBeGreaterThan(0);
    const many = Array.from({ length: 10 }, (_, index) => ({ ...goodCase, title: `Case ${index}`, receiptNumber: undefined }));
    const result = plan(archive({ cases: many }), { cases: Array.from({ length: 45 }, (_, index) => ({ title: `Old ${index}`, kind: "other" })) });
    expect(result.add.cases).toHaveLength(5);
    expect(result.capped).toContainEqual({ section: "cases", skipped: 5 });
  });
  test("refuses an export with too many cases", () => {
    expect(plan(archive({ cases: Array.from({ length: 51 }, () => goodCase) })).error).toMatch(/"cases" section has more than 50/u);
  });
  test("writes restored cases through the store", async () => {
    const store = { createTask: vi.fn(async () => ({ id: "t" })), toggleTask: vi.fn(), saveResource: vi.fn(), saveNews: vi.fn(), createTrackedDate: vi.fn(), createContact: vi.fn(), savePlanner: vi.fn(), saveProfile: vi.fn(), createCase: vi.fn(async () => ({})) };
    await applyRestore(plan({ schemaVersion: 2, uid, cases: [goodCase] }), store);
    expect(store.createCase).toHaveBeenCalledWith(expect.objectContaining({ title: "Post-completion OPT" }), 0);
  });
});
