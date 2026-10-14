import { relevanceFor } from "./relevance";
import { rulesLibrary } from "../data/rules-library";
import { daysUntil } from "./reminders";

// "What may apply to me": informational matches between the student's own profile fields and the tags on reviewed
// updates and library entries. It never says an update or rule legally applies to anyone.
export const profileInputs = [
  { id: "visaType", label: "Visa type", value: (profile) => profile.visaType },
  { id: "journeyStage", label: "Journey stage", value: (profile) => profile.journeyStage },
  { id: "university", label: "University", value: (profile) => profile.university },
  { id: "topics", label: "Saved topics", value: (profile) => (Array.isArray(profile.topics) && profile.topics.length ? profile.topics.map((topic) => topic.replaceAll("-", " ")).join(", ") : "") },
];

export function profileSummary(profile = {}) {
  const inputs = profileInputs.map((input) => ({ id: input.id, label: input.label, value: String(input.value(profile) || "").trim() }));
  return { inputs, missing: inputs.filter((input) => !input.value), complete: inputs.every((input) => input.value) };
}

function ranked(items, profile) {
  return items
    .map((item) => ({ item, relevance: relevanceFor(item, profile) }))
    .filter(({ relevance }) => relevance)
    .sort((left, right) => right.relevance.matches.length - left.relevance.matches.length)
    .map(({ item, relevance }) => ({ item, relevance }));
}

export function matchedForProfile({ profile = {}, news = [], rules = rulesLibrary } = {}) {
  return {
    updates: ranked(news, profile),
    rules: ranked(rules.filter((entry) => entry.status !== "superseded"), profile),
  };
}

// Dates and deadlines within the next `horizonDays`, from tasks, key dates and case events, soonest first.
export function comingUp({ tasks = [], dates = [], now = new Date(), horizonDays = 30 } = {}) {
  const rows = [];
  for (const task of tasks) {
    if (task.completed || !task.dueDate) continue;
    rows.push({ id: `task:${task.id}`, kind: "Task", title: task.title, date: task.dueDate, to: "/tasks" });
  }
  for (const entry of dates) rows.push({ id: `date:${entry.id}`, kind: entry.caseId ? "Case" : "Key date", title: entry.label, date: entry.date, to: entry.caseId ? "/cases" : "/dates" });
  return rows
    .map((row) => ({ ...row, days: daysUntil(row.date, now) }))
    .filter((row) => row.days !== null && row.days >= -7 && row.days <= horizonDays)
    .sort((left, right) => left.days - right.days);
}
