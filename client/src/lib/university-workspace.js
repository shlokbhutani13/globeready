import { isCalendarDate } from "./calendar-date";
import { officeQuestions } from "../data/office-questions";

// Everything the student types on the university pages is kept in this browser only (localStorage), never in their
// account and never uploaded. That keeps free-text notes private by default, at the cost of not following them to a
// second device. The structure is validated on load, so a damaged or hand-edited value cannot break the page.
const key = (scope) => `globeready:university-workspace:v1:${scope || "anon"}`;
export const limits = { custom: 10, terms: 30, answer: 300, question: 200, label: 80, note: 300 };
const empty = () => ({ questions: {}, custom: [], terms: [] });
const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const knownIds = new Set(officeQuestions.map((question) => question.id));

export function cleanWorkspace(value) {
  const base = empty();
  if (!value || typeof value !== "object") return base;
  for (const [id, entry] of Object.entries(value.questions && typeof value.questions === "object" ? value.questions : {})) {
    if (!knownIds.has(id) && !/^c[a-z0-9]{3,24}$/u.test(id)) continue;
    base.questions[id] = { ask: entry?.ask === true, answer: text(entry?.answer, limits.answer) };
  }
  base.custom = (Array.isArray(value.custom) ? value.custom : []).filter((entry) => entry && /^c[a-z0-9]{3,24}$/u.test(entry.id) && text(entry.text, limits.question)).slice(0, limits.custom).map((entry) => ({ id: entry.id, text: text(entry.text, limits.question) }));
  base.terms = (Array.isArray(value.terms) ? value.terms : []).filter((entry) => entry && /^t[a-z0-9]{3,24}$/u.test(entry.id) && text(entry.label, limits.label)).slice(0, limits.terms)
    .map((entry) => ({ id: entry.id, label: text(entry.label, limits.label), date: isCalendarDate(entry.date) ? entry.date : "", note: text(entry.note, limits.note) }));
  return base;
}

export function loadWorkspace(storage, scope) {
  try { return cleanWorkspace(JSON.parse(storage?.getItem(key(scope)) || "null")); } catch { return empty(); }
}
export function saveWorkspace(storage, scope, workspace) {
  const clean = cleanWorkspace(workspace);
  try { storage.setItem(key(scope), JSON.stringify(clean)); } catch { throw new Error("This browser would not save your notes. Private browsing can block it."); }
  return clean;
}
export function clearWorkspace(storage, scope) { try { storage?.removeItem(key(scope)); } catch { /* ignore */ } }

const makeId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function setQuestion(workspace, id, patch) {
  const current = workspace.questions[id] || { ask: false, answer: "" };
  return { ...workspace, questions: { ...workspace.questions, [id]: { ...current, ...patch } } };
}
export function addCustomQuestion(workspace, input, id = makeId("c")) {
  const value = text(input, limits.question);
  if (!value) throw new Error("Type your question first.");
  if (workspace.custom.length >= limits.custom) throw new Error(`You can keep up to ${limits.custom} questions of your own.`);
  return { ...workspace, custom: [...workspace.custom, { id, text: value }], questions: { ...workspace.questions, [id]: { ask: true, answer: "" } } };
}
export function removeCustomQuestion(workspace, id) {
  const { [id]: _removed, ...rest } = workspace.questions;
  return { ...workspace, custom: workspace.custom.filter((entry) => entry.id !== id), questions: rest };
}
export function addTermNote(workspace, input, id = makeId("t")) {
  const label = text(input?.label, limits.label);
  if (!label) throw new Error("Give the note a short name, such as “Orientation” or “Fall classes start”.");
  const date = typeof input?.date === "string" ? input.date.trim() : "";
  if (date && !isCalendarDate(date)) throw new Error("Choose a real date, or leave the date empty.");
  if (workspace.terms.length >= limits.terms) throw new Error(`You can keep up to ${limits.terms} term notes. Remove one first.`);
  return { ...workspace, terms: [...workspace.terms, { id, label, date, note: text(input?.note, limits.note) }] };
}
export function removeTermNote(workspace, id) { return { ...workspace, terms: workspace.terms.filter((entry) => entry.id !== id) }; }

export const allQuestions = (workspace) => [...officeQuestions.map((question) => ({ ...question, custom: false })), ...workspace.custom.map((entry) => ({ ...entry, group: "mine", custom: true }))];

// Where the student has (or has not yet) saved each kind of contact. Everything shown is what the student entered.
export const directorySlots = [
  { id: "international-office", label: "International student office" },
  { id: "dso", label: "Designated school official (DSO)" },
  { id: "campus-safety", label: "Campus safety" },
  { id: "insurance", label: "Health insurance or clinic" },
];
export function officeDirectory(contacts = []) {
  const slots = directorySlots.map((slot) => ({ ...slot, contacts: contacts.filter((contact) => contact.role === slot.id) }));
  const known = new Set(directorySlots.map((slot) => slot.id));
  return { slots, others: contacts.filter((contact) => !known.has(contact.role) && contact.role !== "personal" && contact.role !== "embassy"), missing: slots.filter((slot) => slot.contacts.length === 0) };
}
