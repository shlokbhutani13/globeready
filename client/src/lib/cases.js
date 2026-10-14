import { isCalendarDate } from "./calendar-date";
import { daysUntil } from "./reminders";

// The case tracker keeps what the student types in. GlobeReady never contacts USCIS or any agency, so a status here is
// only ever the status the student last entered.

export const caseKinds = [
  { id: "opt-ead", label: "OPT or work permit (I-765)" },
  { id: "stem-opt", label: "STEM OPT" },
  { id: "change-of-status", label: "Change or extension of status (I-539)" },
  { id: "sevis-transfer", label: "SEVIS transfer or program change" },
  { id: "travel-document", label: "Travel document or visa" },
  { id: "other", label: "Other" },
];
export const caseStatuses = [
  { id: "preparing", label: "Preparing" },
  { id: "filed", label: "Filed or submitted" },
  { id: "receipt-received", label: "Receipt received" },
  { id: "biometrics", label: "Biometrics scheduled or done" },
  { id: "evidence-requested", label: "Request for evidence received" },
  { id: "interview", label: "Interview scheduled" },
  { id: "decision-received", label: "Decision received" },
  { id: "closed", label: "Closed" },
];
export const entryTypes = [
  { id: "status", label: "Status change" },
  { id: "receipt", label: "Receipt notice" },
  { id: "appointment", label: "Appointment" },
  { id: "rfe-received", label: "Request for evidence received" },
  { id: "rfe-due", label: "Request for evidence response due" },
  { id: "note", label: "Note" },
];
export const maxCases = 50;
export const maxTimeline = 40;
const labelOf = (list, id) => list.find((entry) => entry.id === id)?.label || id;
export const caseKindLabel = (id) => labelOf(caseKinds, id);
export const caseStatusLabel = (id) => labelOf(caseStatuses, id);
export const entryTypeLabel = (id) => labelOf(entryTypes, id);

function optional(value, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function validEntry(input = {}) {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!isCalendarDate(date)) throw new Error("Choose a real date for this entry.");
  if (!entryTypes.some((type) => type.id === input.type)) throw new Error("Choose what kind of entry this is.");
  const text = optional(input.text, 300, "Entry note");
  const entry = { date, type: input.type };
  if (input.type === "status") {
    if (!caseStatuses.some((status) => status.id === input.status)) throw new Error("Choose the new status.");
    entry.status = input.status;
  }
  if (input.type === "note" && !text) throw new Error("Write a short note.");
  if (text) entry.text = text;
  return entry;
}

export function validTimeline(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("The case history must be a list.");
  if (input.length > maxTimeline) throw new Error(`A case can keep up to ${maxTimeline} history entries.`);
  return input.map(validEntry).sort((left, right) => left.date.localeCompare(right.date));
}

export function validCase(input = {}) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > 120) throw new Error("Give the case a name of 1 to 120 characters.");
  if (!caseKinds.some((kind) => kind.id === input.kind)) throw new Error("Choose what kind of case this is.");
  const status = input.status || "preparing";
  if (!caseStatuses.some((entry) => entry.id === status)) throw new Error("Choose a status from the list.");
  const filedOn = typeof input.filedOn === "string" ? input.filedOn.trim() : "";
  if (filedOn && !isCalendarDate(filedOn)) throw new Error("Filed date must be a real date (YYYY-MM-DD).");
  const receiptNumber = optional(input.receiptNumber, 40, "Receipt number").replace(/\s+/gu, "").toUpperCase();
  if (receiptNumber && !/^[A-Z0-9-]{5,40}$/u.test(receiptNumber)) throw new Error("A receipt number uses letters, numbers and hyphens only.");
  const record = { title, kind: input.kind, status, timeline: validTimeline(input.timeline) };
  const formNumber = optional(input.formNumber, 40, "Form number");
  if (formNumber) record.formNumber = formNumber;
  if (receiptNumber) record.receiptNumber = receiptNumber;
  if (filedOn) record.filedOn = filedOn;
  const notes = optional(input.notes, 1000, "Notes");
  if (notes) record.notes = notes;
  return record;
}

// Adds one history entry. A status entry also becomes the case's current status, because the student is telling
// GlobeReady what changed.
export function withEntry(record, entryInput) {
  const entry = validEntry(entryInput);
  const next = { ...record, timeline: [...(record.timeline || []), entry] };
  if (entry.type === "status") next.status = entry.status;
  if (entry.type === "rfe-received" && next.status !== "decision-received" && next.status !== "closed") next.status = "evidence-requested";
  if (entry.type === "receipt" && ["preparing", "filed"].includes(next.status)) next.status = "receipt-received";
  return validCase(next);
}

export function withoutEntry(record, index) {
  const timeline = [...(record.timeline || [])];
  if (!Number.isInteger(index) || index < 0 || index >= timeline.length) throw new Error("That history entry no longer exists.");
  timeline.splice(index, 1);
  return validCase({ ...record, timeline });
}

const reminderWindows = { appointment: 14, "rfe-due": 30 };

// Upcoming appointment and evidence-response dates, shaped like key dates so reminders, Home and the calendar file all
// work for them without special cases.
export function caseDates(cases = []) {
  const dates = [];
  for (const record of cases) {
    (record.timeline || []).forEach((entry, index) => {
      if (!reminderWindows[entry.type] || !isCalendarDate(entry.date)) return;
      if (["decision-received", "closed"].includes(record.status)) return;
      dates.push({
        id: `case-${record.id}-${index}`, caseId: record.id, kind: "other", date: entry.date, remindDays: reminderWindows[entry.type],
        label: `${record.title}: ${entry.type === "appointment" ? "appointment" : "evidence response due"}`,
        notes: entry.text || "",
      });
    });
  }
  return dates;
}

export function caseSummary(record, now = new Date()) {
  const timeline = record.timeline || [];
  const lastEntry = [...timeline].sort((left, right) => left.date.localeCompare(right.date)).at(-1) || null;
  const next = caseDates([{ ...record, status: record.status }]).map((entry) => ({ entry, days: daysUntil(entry.date, now) }))
    .filter(({ days }) => days !== null && days >= 0).sort((left, right) => left.days - right.days)[0] || null;
  return { lastEntry, next, open: !["decision-received", "closed"].includes(record.status) };
}
