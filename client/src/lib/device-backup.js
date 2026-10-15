import { cleanBudget } from "./budget";
import { cleanReadiness } from "./document-readiness";
import { cleanCard } from "./emergency-card";
import { cleanWorkspace } from "./university-workspace";
import { notifyLifeChanged } from "./life-events";
import { isCalendarDate } from "./calendar-date";

const KIND = "globeready-device-backup";
const VERSION = 1;
const MAX_BYTES = 1_000_000;
const sectionIds = ["budget", "readiness", "emergencyCard", "universityWorkspace", "newsSeen", "savedSearches", "snoozes"];
const storageKeys = {
  budget: "budget",
  readiness: "doc-readiness",
  emergencyCard: "emergency-card",
  universityWorkspace: "university-workspace",
  newsSeen: "news-seen",
  savedSearches: "news-searches",
  snoozes: "next-snooze",
};
const labels = {
  budget: "budget",
  readiness: "documents checklist",
  emergencyCard: "emergency card",
  universityWorkspace: "appointment preparation",
  newsSeen: "seen update markers",
  savedSearches: "saved searches",
  snoozes: "snoozed next steps",
};

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : isObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const scopedKey = (section, uid) => `globeready:${storageKeys[section]}:v1:${uid || "anon"}`;

function cleanSeen(value) {
  if (!isObject(value)) return {};
  const entries = Object.entries(value);
  if (entries.length > 500) throw new Error("The seen update markers section contains too many entries.");
  const out = {};
  for (const [id, stamp] of entries) {
    if (!id || id.length > 160 || ["__proto__", "constructor", "prototype"].includes(id) || typeof stamp !== "string" || stamp.length > 80) throw new Error("The seen update markers section is invalid.");
    out[id] = stamp;
  }
  return out;
}

const textFilterKeys = new Set(["q", "topic", "visaType", "legalState", "sourceId", "from", "to"]);
const flagFilterKeys = new Set(["matchesProfile", "hasEffectiveDate", "unreadOnly"]);
function cleanSearches(value) {
  if (!Array.isArray(value) || value.length > 10) throw new Error("The saved searches section is invalid.");
  return value.map((entry) => {
    if (!isObject(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 80 || typeof entry.name !== "string" || !entry.name || entry.name.length > 60 || !isObject(entry.filters)) throw new Error("The saved searches section is invalid.");
    const filters = {};
    for (const [key, item] of Object.entries(entry.filters)) {
      if (textFilterKeys.has(key) && typeof item === "string" && item.trim() && item.length <= 120) filters[key] = item;
      else if (flagFilterKeys.has(key) && item === true) filters[key] = true;
      else throw new Error("The saved searches section is invalid.");
    }
    return { id: entry.id, name: entry.name, filters };
  });
}

function cleanSnoozes(value) {
  if (!isObject(value) || Object.keys(value).length > 200) throw new Error("The snoozed next steps section is invalid.");
  const out = {};
  for (const [id, date] of Object.entries(value)) {
    if (!id || id.length > 200 || !isCalendarDate(date)) throw new Error("The snoozed next steps section is invalid.");
    out[id] = date;
  }
  return out;
}

function validateData(data, now = new Date()) {
  if (!isObject(data) || Object.keys(data).length !== sectionIds.length || !sectionIds.every((id) => Object.hasOwn(data, id))) throw new Error("The backup does not contain the expected device-data sections.");
  const cleaners = {
    budget: (value) => cleanBudget(value, now),
    readiness: cleanReadiness,
    emergencyCard: cleanCard,
    universityWorkspace: cleanWorkspace,
    newsSeen: cleanSeen,
    savedSearches: cleanSearches,
    snoozes: cleanSnoozes,
  };
  const clean = {};
  for (const id of sectionIds) {
    try {
      clean[id] = cleaners[id](data[id]);
      if (!same(clean[id], data[id])) throw new Error();
    } catch {
      throw new Error(`The ${labels[id]} section is invalid.`);
    }
  }
  return clean;
}

export function createDeviceBackup({ uid, data, now = new Date() }) {
  if (typeof uid !== "string" || !uid) throw new Error("A signed-in account is required.");
  const clean = validateData(data, now);
  return { kind: KIND, schemaVersion: VERSION, uid, exportedAt: now.toISOString(), data: clean };
}

export function readDeviceData(storage, uid, now = new Date()) {
  const read = (id, fallback) => {
    try { return JSON.parse(storage?.getItem(scopedKey(id, uid)) || JSON.stringify(fallback)); } catch { return fallback; }
  };
  return validateData({
    budget: cleanBudget(read("budget", null), now),
    readiness: cleanReadiness(read("readiness", null)),
    emergencyCard: cleanCard(read("emergencyCard", null)),
    universityWorkspace: cleanWorkspace(read("universityWorkspace", null)),
    newsSeen: cleanSeen(read("newsSeen", {})),
    savedSearches: cleanSearches(read("savedSearches", [])),
    snoozes: cleanSnoozes(read("snoozes", {})),
  }, now);
}

function sectionCount(id, value) {
  if (id === "budget") return value.items.length;
  if (id === "readiness") return Object.keys(value.marks).length + value.custom.length;
  if (id === "emergencyCard") return Object.keys(value.values).length + value.contactIds.length;
  if (id === "universityWorkspace") return Object.keys(value.questions).length + value.custom.length + value.terms.length;
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

export function planDeviceRestore(text, { uid, now = new Date() } = {}) {
  if (typeof text !== "string") return { ok: false, error: "Choose a GlobeReady device backup JSON file." };
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES) return { ok: false, error: "This file is larger than the 1 MB device-backup limit." };
  try {
    const archive = JSON.parse(text);
    if (!isObject(archive) || archive.kind !== KIND) throw new Error("This is not a GlobeReady device backup.");
    if (archive.schemaVersion !== VERSION) throw new Error("This backup version is not supported.");
    if (archive.uid !== uid) throw new Error("This backup belongs to a different account.");
    const data = validateData(archive.data, now);
    return { ok: true, data, sections: sectionIds.map((id) => ({ id, label: labels[id], count: sectionCount(id, data[id]) })) };
  } catch (error) {
    return { ok: false, error: error?.message || "This device backup is damaged or invalid." };
  }
}

export function applyDeviceRestore(plan, storage, uid) {
  if (!plan?.ok || !plan.data || typeof uid !== "string" || !uid) throw new Error("Preview a valid device backup before replacing data.");
  const before = new Map(sectionIds.map((id) => [id, storage.getItem(scopedKey(id, uid))]));
  try {
    for (const id of sectionIds) storage.setItem(scopedKey(id, uid), JSON.stringify(plan.data[id]));
  } catch {
    for (const id of sectionIds) {
      try {
        const value = before.get(id);
        if (value === null) storage.removeItem(scopedKey(id, uid));
        else storage.setItem(scopedKey(id, uid), value);
      } catch { /* best effort after browser storage failure */ }
    }
    throw new Error("GlobeReady could not replace your device data. Your previous data was restored where the browser allowed it.");
  }
  notifyLifeChanged();
  return { sections: sectionIds.length };
}
