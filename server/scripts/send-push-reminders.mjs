// Daily push reminders for students who turned them on. For each student with a saved push address it reads only
// their key dates and open tasks, builds one short notification (titles only, never document text), and sends it.
// Addresses that Firebase reports as gone are deleted. Nothing is logged except counts.
import { pathToFileURL } from "node:url";

const MAX_LISTED = 3;

export function localToday(timeZone, now = new Date()) {
  let zone = "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone }); zone = timeZone || "UTC"; } catch { zone = "UTC"; }
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts;
}

export function daysBetween(todayKey, dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return null;
  const toUtc = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(dateKey) - toUtc(todayKey)) / 86_400_000);
}

const when = (days) => days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;

// Key dates fire on their own remindDays, tomorrow and today. Open tasks fire tomorrow and today. Nothing fires for the past.
export function buildReminder({ keyDates = [], tasks = [], todayKey }) {
  const items = [];
  for (const item of keyDates) {
    const days = daysBetween(todayKey, item.date);
    if (days === null || days < 0) continue;
    if (days === 0 || days === 1 || (Number.isInteger(item.remindDays) && item.remindDays > 1 && days === item.remindDays)) items.push({ days, label: String(item.label || "Key date").slice(0, 80) });
  }
  for (const task of tasks) {
    if (task.completed) continue;
    const days = daysBetween(todayKey, task.dueDate);
    if (days === 0 || days === 1) items.push({ days, label: String(task.title || "Task").slice(0, 80) });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.days - b.days || a.label.localeCompare(b.label));
  const listed = items.slice(0, MAX_LISTED).map((item) => `${item.label} ${when(item.days)}`);
  const extra = items.length - listed.length;
  return {
    title: items.length === 1 ? "GlobeReady reminder" : `GlobeReady: ${items.length} things coming up`,
    body: `${listed.join(". ")}${extra > 0 ? `. And ${extra} more.` : "."}`.slice(0, 240),
    tag: `globeready-${todayKey}`,
  };
}

const goneCodes = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"]);

export async function sendReminders({ firestore, messaging, now = new Date(), log = console.log }) {
  const snapshot = await firestore.collectionGroup("pushTokens").get();
  const byUser = new Map();
  for (const item of snapshot.docs) {
    const uid = item.ref.parent.parent?.id;
    const token = item.data().token;
    if (!uid || typeof token !== "string") continue;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push({ ref: item.ref, token });
  }
  let students = 0; let sent = 0; let removed = 0;
  for (const [uid, devices] of byUser) {
    const user = firestore.collection("users").doc(uid);
    const [profile, dates, tasks] = await Promise.all([user.get(), user.collection("trackedDates").get(), user.collection("tasks").get()]);
    const todayKey = localToday(profile.data()?.timeZone, now);
    const reminder = buildReminder({ keyDates: dates.docs.map((d) => d.data()), tasks: tasks.docs.map((d) => d.data()), todayKey });
    if (!reminder) continue;
    students += 1;
    const result = await messaging.sendEach(devices.map((device) => ({
      token: device.token,
      data: { title: reminder.title, body: reminder.body, tag: reminder.tag },
      webpush: { headers: { TTL: "43200", Urgency: "normal" } },
    })));
    for (const [index, response] of result.responses.entries()) {
      if (response.success) sent += 1;
      else if (goneCodes.has(response.error?.code)) { await devices[index].ref.delete(); removed += 1; }
    }
  }
  log(`push reminders: ${byUser.size} students with push on, ${students} with something due, ${sent} sent, ${removed} dead addresses removed`);
  return { students, sent, removed };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const { getMessaging } = await import("firebase-admin/messaging");
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required");
  const app = initializeApp({ credential: applicationDefault(), projectId });
  await sendReminders({ firestore: getFirestore(app), messaging: getMessaging(app) });
}
