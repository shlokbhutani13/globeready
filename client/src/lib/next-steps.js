import { daysUntil, localDateKey } from "./reminders";
import { notifyLifeChanged } from "./life-events";
import { journeyItemsFor } from "../data/journey-templates";

// "Your next steps": one ranked, plain list built from tasks, dates and cases the student entered, plus a few common
// journey steps. It is informational. A date here is a date the student typed in (or a suggestion with no date), never
// a legal deadline, and nothing here decides what the student must do.

export const snoozeChoices = [{ days: 1, label: "Tomorrow" }, { days: 3, label: "3 days" }, { days: 7, label: "1 week" }];
const SNOOZE_CAP = 200;
const snoozeKey = (scope) => `globeready:next-snooze:v1:${scope || "anon"}`;

const dayWord = (days) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const normalize = (text) => String(text || "").trim().toLowerCase();

export function buildNextSteps({ tasks = [], dates = [], journeyHave = [], profile = {}, now = new Date(), horizonDays = 14, suggestionLimit = 3, extra = [] } = {}) {
  const rows = [];
  for (const task of tasks) {
    if (task.completed) continue;
    const due = daysUntil(task.dueDate, now);
    const remind = daysUntil(task.remindOn, now);
    if (due !== null && due < 0) {
      rows.push({ id: `task:${task.id}:${task.dueDate}`, kind: "overdue", rank: 1, days: due, title: task.title, reason: `This task’s due date, ${task.dueDate}, passed ${dayWord(due)}. The date is the one you set.`, task, to: "/tasks", openLabel: "Open tasks" });
    } else if (due !== null && due <= horizonDays) {
      rows.push({ id: `task:${task.id}:${task.dueDate}`, kind: "task", rank: due <= 3 ? 2 : 3, days: due, title: task.title, reason: `Due ${dayWord(due)} (${task.dueDate}), the date you set.`, task, to: "/tasks", openLabel: "Open tasks" });
    } else if (remind !== null && remind <= 0 && remind >= -14) {
      rows.push({ id: `task:${task.id}:remind:${task.remindOn}`, kind: "reminder", rank: 3, days: remind, title: task.title, reason: `You asked to be reminded on ${task.remindOn}.`, task, to: "/tasks", openLabel: "Open tasks" });
    }
  }
  for (const entry of dates) {
    const days = daysUntil(entry.date, now);
    if (days === null || days < -7) continue;
    const window = Number.isInteger(entry.remindDays) ? entry.remindDays : 30;
    if (days > window || days > 60) continue;
    const fromCase = Boolean(entry.caseId);
    rows.push({
      id: `date:${entry.id}:${entry.date}`, kind: fromCase ? "case" : "date", rank: days < 0 ? 1 : days <= 7 ? 2 : 3, days,
      title: entry.label,
      reason: days < 0 ? `${fromCase ? "A date you entered for this case" : "A date you entered"}, ${entry.date}, passed ${dayWord(days)}. Check the original document or notice.` : `${fromCase ? "A date you entered for this case" : "A date you entered"}: ${entry.date} (${dayWord(days)}). Confirm it against your official document.`,
      to: fromCase ? "/cases" : "/dates", openLabel: fromCase ? "Open cases" : "Open key dates",
    });
  }
  const extraSuggestions = extra.filter((entry) => entry.kind === "suggestion").slice(0, suggestionLimit);
  rows.push(...extra.filter((entry) => entry.kind !== "suggestion"));
  const haveTitles = new Set(tasks.map((task) => normalize(task.title)));
  const have = new Set(journeyHave);
  const suggestions = journeyItemsFor(profile)
    .filter((item) => !have.has(item.id) && !haveTitles.has(normalize(item.title)))
    .sort((left, right) => (left.priority === "high" ? 0 : 1) - (right.priority === "high" ? 0 : 1))
    .slice(0, Math.max(0, suggestionLimit - extraSuggestions.length))
    .map((item) => ({ id: `journey:${item.id}`, kind: "suggestion", rank: 4, days: null, title: item.title, reason: "A common step for international students. It is a suggestion with no deadline, and your school may do things differently.", item, to: "/journey", openLabel: "Open journey planner" }));
  const sorted = rows.sort((left, right) => left.rank - right.rank || (left.days ?? 0) - (right.days ?? 0) || left.title.localeCompare(right.title));
  return [...sorted, ...extraSuggestions, ...suggestions];
}

export function loadSnoozes(storage, scope, now = new Date()) {
  try {
    const raw = JSON.parse(storage?.getItem(snoozeKey(scope)) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const today = localDateKey(now);
    return Object.fromEntries(Object.entries(raw).filter(([id, until]) => typeof id === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(until) && until > today).slice(-SNOOZE_CAP));
  } catch { return {}; }
}
export function snoozeItem(storage, scope, id, days, now = new Date()) {
  const current = loadSnoozes(storage, scope, now);
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  current[id] = localDateKey(until);
  try { storage?.setItem(snoozeKey(scope), JSON.stringify(Object.fromEntries(Object.entries(current).slice(-SNOOZE_CAP)))); } catch { /* storage may be blocked */ }
  notifyLifeChanged();
  return current;
}
export function unsnoozeItem(storage, scope, id, now = new Date()) {
  const current = loadSnoozes(storage, scope, now);
  delete current[id];
  try { storage?.setItem(snoozeKey(scope), JSON.stringify(current)); } catch { /* storage may be blocked */ }
  notifyLifeChanged();
  return current;
}
export function splitSnoozed(steps, snoozes = {}) {
  return { active: steps.filter((step) => !(step.id in snoozes)), snoozed: steps.filter((step) => step.id in snoozes).map((step) => ({ ...step, until: snoozes[step.id] })) };
}
export function clearNextStepsDeviceData(storage, scope) { try { storage?.removeItem(snoozeKey(scope)); } catch { /* ignore */ } }

// The next seven days (today included), grouped by day, plus anything already overdue.
export function weeklySummary({ tasks = [], dates = [], now = new Date() } = {}) {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
    const key = localDateKey(day);
    const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : day.toLocaleDateString("en-US", { weekday: "long" });
    return { date: key, label: `${label} (${key})`, items: [] };
  });
  const overdue = [];
  const place = (kind, title, date) => {
    const gap = daysUntil(date, now);
    if (gap === null) return;
    if (gap < 0) overdue.push({ kind, title, date });
    else if (gap < 7) days[gap].items.push({ kind, title, date });
  };
  for (const task of tasks) if (!task.completed && task.dueDate) place("Task", task.title, task.dueDate);
  for (const entry of dates) { const gap = daysUntil(entry.date, now); if (gap !== null && gap >= -7) place(entry.caseId ? "Case date" : "Key date", entry.label, entry.date); }
  const total = days.reduce((sum, day) => sum + day.items.length, 0);
  return { days, overdue, total };
}

export function weeklyText(summary) {
  const lines = ["My week (from GlobeReady). Dates are ones I entered; they are not official deadlines."];
  if (summary.overdue.length) lines.push("", "Past due:", ...summary.overdue.map((item) => `- ${item.title} (${item.date})`));
  for (const day of summary.days) if (day.items.length) lines.push("", `${day.label}:`, ...day.items.map((item) => `- ${item.title}`));
  if (!summary.total && !summary.overdue.length) lines.push("", "Nothing is scheduled this week.");
  return lines.join("\n");
}
