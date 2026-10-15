// In-app task reminders for the zero-cost beta. They are computed in the browser from the student's tasks while the
// app is open; nothing runs in the background and nothing is sent anywhere.

export function localDateKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function daysUntil(dueDate, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dueDate || "")) return null;
  const [year, month, day] = dueDate.split("-").map(Number);
  const due = Date.UTC(year, month - 1, day);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - today) / 86_400_000);
}

export function dueStatus(task, now = new Date()) {
  if (!task || task.completed) return null;
  const days = daysUntil(task.dueDate, now);
  if (days === null) return null;
  if (days < 0) return { kind: "overdue", days, label: `Overdue by ${-days} day${days === -1 ? "" : "s"}` };
  if (days === 0) return { kind: "today", days, label: "Due today" };
  if (days === 1) return { kind: "soon", days, label: "Due tomorrow" };
  if (days <= 7) return { kind: "soon", days, label: `Due in ${days} days` };
  return { kind: "later", days, label: `Due ${task.dueDate}` };
}

// Open tasks that are overdue or due within `windowDays`, most urgent first. The id includes the due date, so a
// rescheduled task produces a new, unread reminder.
export function deriveReminders(tasks = [], now = new Date(), { windowDays = 3 } = {}) {
  const dueReminders = tasks
    .map((task) => ({ task, status: dueStatus(task, now) }))
    .filter(({ status }) => status && status.days <= windowDays)
    .sort((left, right) => left.status.days - right.status.days || String(left.task.title).localeCompare(String(right.task.title)))
    .map(({ task, status }) => ({
      id: `${task.id}:${task.dueDate}`,
      taskId: task.id,
      kind: status.kind,
      title: `${status.label}: ${task.title}`,
      body: status.kind === "overdue" ? "This task is past its due date. Complete it or change the date." : `Due ${task.dueDate}.`,
      dueDate: task.dueDate,
    }));
  // A reminder date the student chose by hand fires from that day, for up to 14 days, so old data never nags.
  const manual = tasks
    .filter((task) => !task.completed && task.remindOn)
    .map((task) => ({ task, days: daysUntil(task.remindOn, now) }))
    .filter(({ days }) => days !== null && days <= 0 && days >= -14)
    .map(({ task }) => ({
      id: `${task.id}:remind:${task.remindOn}`,
      taskId: task.id,
      kind: "soon",
      title: `Reminder: ${task.title}`,
      body: task.dueDate ? `You asked to be reminded on ${task.remindOn}. Due ${task.dueDate}.` : `You asked to be reminded on ${task.remindOn}.`,
      dueDate: task.dueDate || task.remindOn,
    }));
  return [...manual, ...dueReminders];
}

// Which reminders this browser has marked read. Stored per account on this device only.
export function createReminderReadStore(uid, storage = globalThis.localStorage) {
  const key = `globeready:reminders-read:${uid}`;
  const read = () => {
    try { return new Set(JSON.parse(storage?.getItem(key) || "[]")); } catch { return new Set(); }
  };
  const write = (ids) => {
    try { storage?.setItem(key, JSON.stringify([...ids].slice(-500))); } catch { /* storage may be unavailable */ }
  };
  return {
    read,
    markRead(ids) { const next = read(); ids.forEach((id) => next.add(id)); write(next); return next; },
  };
}
