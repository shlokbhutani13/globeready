import { relevanceFor } from "./relevance";

// Discovery helpers for the reviewed news feed. Everything here runs in the browser, and the seen markers and saved
// searches are stored only on this device (localStorage), never in the student's account.

const seenKey = (scope) => `globeready:news-seen:v1:${scope || "anon"}`;
const searchKey = (scope) => `globeready:news-searches:v1:${scope || "anon"}`;
const SEEN_CAP = 500;
const SEARCH_CAP = 10;

export const flagKeys = ["matchesProfile", "hasEffectiveDate", "unreadOnly"];
const textKeys = ["q", "topic", "visaType", "legalState", "sourceId", "from", "to"];
const label = (value) => String(value).replaceAll("-", " ");

function read(storage, key, fallback) {
  try { const raw = storage?.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// Options come from what is actually published, so no choice returns nothing by design.
export function discoveryOptions(items = []) {
  const unique = (values) => [...new Set(values.filter((value) => typeof value === "string" && value))].sort();
  return {
    topics: unique(items.flatMap((item) => item.topics || [])).map((id) => ({ id, label: label(id) })),
    visas: unique(items.flatMap((item) => item.visaTypes || [])).map((id) => ({ id, label: id.toUpperCase() })),
  };
}

// Narrowing on the page: text filters are applied by the feed loader; these run on its result.
export function applyDiscovery(items = [], flags = {}, { profile = {}, seen = {}, today = "" } = {}) {
  return items.filter((item) => {
    if (flags.matchesProfile && !relevanceFor(item, profile)) return false;
    if (flags.hasEffectiveDate && !(item.effectiveAt && (!today || item.effectiveAt >= today))) return false;
    if (flags.unreadOnly && !isUnread(item, seen) && !isUpdatedSinceSeen(item, seen)) return false;
    return true;
  });
}

const stamp = (item) => String(item.verifiedAt || item.publishedAt || "");
export function isUnread(item, seen = {}) { return !(item.id in seen); }
export function isUpdatedSinceSeen(item, seen = {}) { return item.id in seen && stamp(item) > String(seen[item.id] || ""); }
export function seenState(item, seen = {}) { return isUnread(item, seen) ? "new" : isUpdatedSinceSeen(item, seen) ? "updated" : "seen"; }

export function loadSeen(storage, scope) {
  const value = read(storage, seenKey(scope), {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
export function markSeen(storage, scope, items) {
  const seen = loadSeen(storage, scope);
  for (const item of [].concat(items)) if (item?.id) seen[item.id] = stamp(item);
  const keys = Object.keys(seen);
  const trimmed = keys.length > SEEN_CAP ? Object.fromEntries(keys.slice(-SEEN_CAP).map((key) => [key, seen[key]])) : seen;
  write(storage, seenKey(scope), trimmed);
  return trimmed;
}
export function clearSeen(storage, scope) { try { storage?.removeItem(seenKey(scope)); } catch { /* ignore */ } return {}; }

const clean = (filters = {}) => {
  const out = {};
  for (const key of textKeys) if (typeof filters[key] === "string" && filters[key].trim()) out[key] = filters[key].trim().slice(0, 120);
  for (const key of flagKeys) if (filters[key] === true) out[key] = true;
  return out;
};

export function describeSearch(filters = {}) {
  const f = clean(filters);
  const parts = [];
  if (f.q) parts.push(`“${f.q}”`);
  if (f.topic) parts.push(label(f.topic));
  if (f.visaType) parts.push(f.visaType.toUpperCase());
  if (f.legalState) parts.push(f.legalState);
  if (f.sourceId) parts.push(label(f.sourceId));
  if (f.from || f.to) parts.push(`${f.from || "…"} to ${f.to || "…"}`);
  if (f.matchesProfile) parts.push("matches my profile");
  if (f.hasEffectiveDate) parts.push("has an upcoming effective date");
  if (f.unreadOnly) parts.push("not yet seen");
  return parts.join(", ");
}

export function loadSearches(storage, scope) {
  const value = read(storage, searchKey(scope), []);
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry.id === "string" && typeof entry.name === "string" && entry.filters && typeof entry.filters === "object")
    .slice(0, SEARCH_CAP).map((entry) => ({ id: entry.id, name: entry.name.slice(0, 60), filters: clean(entry.filters) }));
}
export function saveSearch(storage, scope, name, filters, makeId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`) {
  const existing = loadSearches(storage, scope);
  const cleaned = clean(filters);
  const title = String(name || "").trim().slice(0, 60) || describeSearch(cleaned).slice(0, 60);
  if (!Object.keys(cleaned).length) throw new Error("Choose a search word or a filter first.");
  if (!title) throw new Error("Give this search a name.");
  if (existing.some((entry) => entry.name.toLowerCase() === title.toLowerCase())) throw new Error("You already have a saved search with that name.");
  if (existing.length >= SEARCH_CAP) throw new Error(`You can keep up to ${SEARCH_CAP} saved searches. Remove one first.`);
  const next = [...existing, { id: makeId(), name: title, filters: cleaned }];
  if (!write(storage, searchKey(scope), next)) throw new Error("This browser would not save the search. Private browsing can block it.");
  return next;
}
export function removeSearch(storage, scope, id) {
  const next = loadSearches(storage, scope).filter((entry) => entry.id !== id);
  write(storage, searchKey(scope), next);
  return next;
}
export function splitFilters(filters = {}) {
  const f = clean(filters);
  return { feed: Object.fromEntries(textKeys.filter((key) => f[key]).map((key) => [key, f[key]])), flags: Object.fromEntries(flagKeys.filter((key) => f[key]).map((key) => [key, true])) };
}
export function mergeFilters(feed = {}, flags = {}) { return clean({ ...feed, ...flags }); }

// Removes this device's seen markers and saved searches, used when the account is deleted.
export function clearNewsDeviceData(storage, scope) {
  try { storage?.removeItem(seenKey(scope)); storage?.removeItem(searchKey(scope)); } catch { /* ignore */ }
}
