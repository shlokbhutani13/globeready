import { daysUntil } from "./reminders";

export const keyDateKinds = [
  { id: "passport", label: "Passport expires", short: "Passport" },
  { id: "visa", label: "Visa expires", short: "Visa" },
  { id: "i20-ds2019", label: "I-20 or DS-2019 program end", short: "I-20 / DS-2019" },
  { id: "travel-signature", label: "Travel signature date", short: "Travel signature" },
  { id: "insurance", label: "Insurance ends", short: "Insurance" },
  { id: "lease", label: "Lease ends", short: "Lease" },
  { id: "enrollment", label: "Enrollment or registration deadline", short: "Enrollment" },
  { id: "other", label: "Other date", short: "Other" },
];

export const kindLabel = (kind) => keyDateKinds.find((entry) => entry.id === kind)?.short || "Date";

// How far away a manually entered date is. Nothing here reads a document; every date was typed in by the student.
export function keyDateStatus(entry, now = new Date()) {
  const days = daysUntil(entry.date, now);
  if (days === null || days === undefined || Number.isNaN(days)) return null;
  const remindDays = Number.isInteger(entry.remindDays) ? entry.remindDays : 30;
  let label;
  if (days < 0) label = `Passed ${-days} day${days === -1 ? "" : "s"} ago`;
  else if (days === 0) label = "Today";
  else if (days === 1) label = "Tomorrow";
  else label = `In ${days} days`;
  const kind = days < 0 ? "passed" : days <= remindDays ? "soon" : "later";
  return { days, label, kind, remindDays };
}

// Reminders for dates inside their own reminder window (and for ones that passed within the last 30 days).
export function deriveDateReminders(dates = [], now = new Date()) {
  return dates
    .map((entry) => ({ entry, status: keyDateStatus(entry, now) }))
    .filter(({ status }) => status && status.days <= status.remindDays && status.days >= -30)
    .sort((left, right) => left.status.days - right.status.days)
    .map(({ entry, status }) => ({
      id: `date:${entry.id}:${entry.date}`,
      kind: status.days < 0 ? "overdue" : status.days <= 7 ? "soon" : "later",
      title: `${entry.label}: ${status.label.toLowerCase()}`,
      body: `${kindLabel(entry.kind)} on ${entry.date}. This is the date you entered.`,
      dueDate: entry.date,
      source: "key-date",
    }));
}

// Next dates for Home: upcoming first, then recently passed, limited.
export function upcomingDates(dates = [], now = new Date(), { horizonDays = 180, limit = 3 } = {}) {
  return dates
    .map((entry) => ({ entry, status: keyDateStatus(entry, now) }))
    .filter(({ status }) => status && status.days <= horizonDays && status.days >= -30)
    .sort((left, right) => left.status.days - right.status.days)
    .slice(0, limit);
}
