import { daysUntil } from "./reminders";
import { isCalendarDate } from "./calendar-date";

// A private checklist of which important documents the student has. It records only what the student says. It never
// reads, uploads or verifies a document and says nothing about whether one is valid. Expiry for passport, visa, I-20 and
// similar comes from the student's Key dates, so dates are typed once. The checklist is stored in this browser only.
export const documentTypes = [
  { id: "passport", label: "Passport", group: "Identity and entry", dateKind: "passport" },
  { id: "visa", label: "U.S. visa", group: "Identity and entry", dateKind: "visa" },
  { id: "i94", label: "I-94 arrival record", group: "Identity and entry" },
  { id: "i20", label: "I-20 or DS-2019", group: "School and program", dateKind: "i20-ds2019" },
  { id: "travel-signature", label: "Travel signature on I-20 or DS-2019", group: "School and program", dateKind: "travel-signature" },
  { id: "admission", label: "Admission letter", group: "School and program" },
  { id: "sevis-receipt", label: "SEVIS fee receipt", group: "School and program" },
  { id: "funds", label: "Proof of financial support", group: "School and program" },
  { id: "work-card", label: "Work authorization card, if you have one", group: "Work and tax", ownExpiry: true },
  { id: "ssn", label: "Social Security card, if you have one", group: "Work and tax" },
  { id: "tax-forms", label: "Tax forms you have received", group: "Work and tax" },
  { id: "insurance", label: "Health insurance card", group: "Health and housing", dateKind: "insurance" },
  { id: "immunization", label: "Immunization records", group: "Health and housing", ownExpiry: false },
  { id: "lease", label: "Lease or housing agreement", group: "Health and housing", dateKind: "lease" },
];
export const statusChoices = [{ id: "have", label: "Have it" }, { id: "missing", label: "Missing" }, { id: "review", label: "Needs review" }];
export const limits = { custom: 10, label: 80, note: 200 };
const key = (scope) => `globeready:doc-readiness:v1:${scope || "anon"}`;
const knownIds = new Set(documentTypes.map((type) => type.id));
const empty = () => ({ marks: {}, custom: [] });
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function cleanReadiness(value) {
  const out = empty();
  if (!value || typeof value !== "object") return out;
  const customIds = new Set();
  out.custom = (Array.isArray(value.custom) ? value.custom : []).filter((entry) => entry && /^x[a-z0-9]{3,24}$/u.test(entry.id) && text(entry.label, limits.label)).slice(0, limits.custom).map((entry) => { customIds.add(entry.id); return { id: entry.id, label: text(entry.label, limits.label) }; });
  for (const [id, mark] of Object.entries(value.marks && typeof value.marks === "object" ? value.marks : {})) {
    if (!knownIds.has(id) && !customIds.has(id)) continue;
    const type = documentTypes.find((entry) => entry.id === id);
    const ownDate = (type ? type.ownExpiry : true) && isCalendarDate(mark?.expiry) ? mark.expiry : "";
    out.marks[id] = { status: statusChoices.some((choice) => choice.id === mark?.status) ? mark.status : "", expiry: ownDate, note: text(mark?.note, limits.note) };
  }
  return out;
}
export function loadReadiness(storage, scope) { try { return cleanReadiness(JSON.parse(storage?.getItem(key(scope)) || "null")); } catch { return empty(); } }
export function saveReadiness(storage, scope, state) {
  const clean = cleanReadiness(state);
  try { storage.setItem(key(scope), JSON.stringify(clean)); } catch { throw new Error("This browser would not save your checklist. Private browsing can block it."); }
  return clean;
}
export function clearReadiness(storage, scope) { try { storage?.removeItem(key(scope)); } catch { /* ignore */ } }

export function setMark(state, id, patch) {
  const current = state.marks[id] || { status: "", expiry: "", note: "" };
  if (patch.expiry && !isCalendarDate(patch.expiry)) throw new Error("Choose a real date, or clear it.");
  return { ...state, marks: { ...state.marks, [id]: { ...current, ...patch } } };
}
export function addCustomDocument(state, label, id = `x${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`) {
  const value = text(label, limits.label);
  if (!value) throw new Error("Type the name of the document first.");
  if (state.custom.length >= limits.custom) throw new Error(`You can add up to ${limits.custom} documents of your own.`);
  return { ...state, custom: [...state.custom, { id, label: value }] };
}
export function removeCustomDocument(state, id) {
  const { [id]: _removed, ...marks } = state.marks;
  return { ...state, custom: state.custom.filter((entry) => entry.id !== id), marks };
}

// One row per document, with the date the student entered (from Key dates, or typed here) and how close it is.
export function documentRows(state, keyDates = [], now = new Date(), { soonDays = 90 } = {}) {
  const rows = [...documentTypes, ...state.custom.map((entry) => ({ ...entry, group: "My own documents", custom: true, ownExpiry: true }))].map((type) => {
    const mark = state.marks[type.id] || { status: "", expiry: "", note: "" };
    const fromDates = type.dateKind ? keyDates.filter((entry) => entry.kind === type.dateKind && isCalendarDate(entry.date)).sort((left, right) => left.date.localeCompare(right.date)) : [];
    const upcoming = fromDates.find((entry) => daysUntil(entry.date, now) >= 0) || fromDates.at(-1);
    const date = upcoming?.date || mark.expiry || "";
    const days = date ? daysUntil(date, now) : null;
    const dateState = days === null ? null : days < 0 ? "past" : days <= soonDays ? "soon" : "later";
    return { ...type, status: mark.status, note: mark.note, date, dateSource: upcoming ? "key-dates" : mark.expiry ? "typed" : "", days, dateState, hasKeyDateKind: Boolean(type.dateKind) };
  });
  return rows;
}

export function readinessSummary(rows) {
  const count = (test) => rows.filter(test).length;
  return { total: rows.length, have: count((row) => row.status === "have"), missing: count((row) => row.status === "missing"), review: count((row) => row.status === "review"), unmarked: count((row) => !row.status), dateSoon: count((row) => row.dateState === "soon" || row.dateState === "past") };
}
