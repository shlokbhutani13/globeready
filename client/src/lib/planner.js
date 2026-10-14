import { localDateKey } from "./reminders";
import { isCalendarDate } from "./calendar-date";

const dayMs = 86_400_000;

// Suggested due date for a template item, counted from the student's own start or graduation date. Empty when the
// student has not entered that date, so nothing is invented.
export function suggestedDueDate(item, profile = {}) {
  const base = item.anchor === "start" ? profile.startDate : item.anchor === "graduation" ? profile.graduationDate : "";
  if (!isCalendarDate(base)) return "";
  const time = Date.parse(`${base}T00:00:00Z`);
  if (Number.isNaN(time)) return "";
  return new Date(time + (item.offsetDays || 0) * dayMs).toISOString().slice(0, 10);
}

const normalize = (text) => String(text || "").trim().toLowerCase();

// Tasks to create for the chosen template items. Anything the student already has a task for (same title) is skipped,
// so adding twice never duplicates.
export function tasksFromItems(items, existingTasks = [], profile = {}, { dueDate } = {}) {
  const existing = new Set(existingTasks.map((task) => normalize(task.title)));
  const seen = new Set();
  const created = [];
  for (const item of items) {
    const key = normalize(item.title ?? item.label);
    if (!key || existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    created.push({
      title: (item.title ?? item.label).slice(0, 200),
      category: item.category || "General",
      priority: item.priority || "medium",
      dueDate: dueDate || suggestedDueDate(item, profile),
      ...(Array.isArray(item.links) && item.links.length ? { links: item.links } : {}),
    });
  }
  return created;
}

export function stageProgress(items, haveIds = []) {
  const have = new Set(haveIds);
  const total = items.length;
  const done = items.filter((item) => have.has(item.id)).length;
  return { total, done };
}

export { localDateKey };
