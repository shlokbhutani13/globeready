// Builds an iCalendar (.ics) file in the browser. Nothing is uploaded; the file works in Google Calendar, Apple
// Calendar and Outlook. All entries are all-day events on the dates the student entered.
const encoder = new TextEncoder();

export function escapeText(value) {
  return String(value ?? "").replace(/\\/gu, "\\\\").replace(/;/gu, "\;").replace(/,/gu, "\\,").replace(/\r?\n/gu, "\\n");
}

// Content lines are folded at 75 octets, continuing with a leading space, as RFC 5545 requires.
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line;
  const parts = [];
  let current = "";
  let size = 0;
  for (const character of line) {
    const width = encoder.encode(character).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + width > limit) { parts.push(current); current = ""; size = 0; }
    current += character;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compact = (date) => date.replaceAll("-", "");
const stamp = (now) => now.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}/u, "");
const nextDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const validDate = (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`));

function event({ uid, date, summary, description, category, now, alarmDays }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}@globeready`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  if (category) lines.push(`CATEGORIES:${escapeText(category)}`);
  lines.push("TRANSP:TRANSPARENT");
  if (Number.isInteger(alarmDays) && alarmDays > 0) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(summary)}`, `TRIGGER:-P${alarmDays}D`, "END:VALARM");
  }
  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs({ tasks = [], dates = [], now = new Date(), includeCompleted = false } = {}) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GlobeReady//Student deadlines//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:GlobeReady"];
  let count = 0;
  for (const task of tasks) {
    if (!validDate(task.dueDate) || (task.completed && !includeCompleted)) continue;
    lines.push(...event({
      uid: `task-${task.id}`, date: task.dueDate, summary: task.title,
      description: [task.category && `Category: ${task.category}`, task.priority && `Priority: ${task.priority}`, task.completed && "Completed"].filter(Boolean).join(". "),
      category: task.category, now,
    }));
    count += 1;
  }
  for (const entry of dates) {
    if (!validDate(entry.date)) continue;
    lines.push(...event({
      uid: `date-${entry.id}`, date: entry.date, summary: entry.label,
      description: ["Date entered in GlobeReady. Confirm it against your official document.", entry.notes].filter(Boolean).join(" "),
      category: "Key date", now, alarmDays: entry.remindDays,
    }));
    count += 1;
  }
  lines.push("END:VCALENDAR");
  return { text: `${lines.map(foldLine).join("\r\n")}\r\n`, count };
}

export function downloadIcs(result, { documentImpl = document, urlImpl = URL } = {}) {
  const blob = new Blob([result.text], { type: "text/calendar;charset=utf-8" });
  const objectUrl = urlImpl.createObjectURL(blob);
  const anchor = documentImpl.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "globeready-deadlines.ics";
  documentImpl.body.append(anchor);
  anchor.click();
  anchor.remove();
  urlImpl.revokeObjectURL(objectUrl);
  return blob;
}
