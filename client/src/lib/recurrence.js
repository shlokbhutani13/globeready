import { isCalendarDate } from "./calendar-date";

export const recurrenceLabels = { none: "Does not repeat", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
export const recurrenceValues = ["weekly", "monthly", "yearly"];

const parse = (date) => date.split("-").map(Number);
const pad = (value) => String(value).padStart(2, "0");
const daysIn = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// The next due date for a repeating task. Monthly and yearly repeats keep the day of the month, or use the last day
// of a shorter month (for example 31 January repeats on 28 February). Returns "" when there is nothing sensible.
export function nextOccurrence(dueDate, recurrence) {
  if (!recurrenceValues.includes(recurrence) || !isCalendarDate(dueDate)) return "";
  const [year, month, day] = parse(dueDate);
  if (recurrence === "weekly") return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  if (recurrence === "monthly") {
    const targetYear = year + Math.floor(month / 12);
    const targetMonth = (month % 12) + 1;
    return `${targetYear}-${pad(targetMonth)}-${pad(Math.min(day, daysIn(targetYear, targetMonth)))}`;
  }
  return `${year + 1}-${pad(month)}-${pad(Math.min(day, daysIn(year + 1, month)))}`;
}

const dayMs = 86_400_000;

// The task to create after a repeating task is completed: same details and links, later dates, not completed.
export function nextTaskFrom(task) {
  const dueDate = nextOccurrence(task.dueDate, task.recurrence);
  if (!dueDate) return null;
  const next = { title: task.title, category: task.category || "General", priority: task.priority || "medium", dueDate, recurrence: task.recurrence };
  if (task.notes) next.notes = task.notes;
  if (isCalendarDate(task.remindOn)) {
    const offset = Math.round((Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${task.remindOn}T00:00:00Z`)) / dayMs);
    next.remindOn = new Date(Date.parse(`${dueDate}T00:00:00Z`) - offset * dayMs).toISOString().slice(0, 10);
  }
  if (Array.isArray(task.links) && task.links.length) next.links = task.links;
  return next;
}
