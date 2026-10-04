import {
  collection, doc, onSnapshot, orderBy, query, updateDoc,
} from "firebase/firestore";
import { apiRequest } from "./api";
import { db } from "./firebase";

const rankWeights = { university: 8, visaType: 6, nationality: 5, topic: 4, urgent: 3, effectiveSoon: 2 };
const urgentLevels = new Set(["critical", "urgent"]);
const deadlineWindowMs = 30 * 24 * 60 * 60 * 1000;

// A small, intentionally bounded map of common study-abroad nationalities to
// ISO country codes. Unmapped countries simply receive no nationality boost;
// this never blocks or hides an update.
const countryCodesByName = {
  india: "IN", china: "CN", "south korea": "KR", korea: "KR", canada: "CA",
  vietnam: "VN", taiwan: "TW", japan: "JP", nigeria: "NG", "saudi arabia": "SA",
  brazil: "BR", mexico: "MX", "united kingdom": "GB", uk: "GB", germany: "DE",
  france: "FR", "hong kong": "HK", indonesia: "ID", pakistan: "PK",
  bangladesh: "BD", nepal: "NP", turkey: "TR", iran: "IR", thailand: "TH",
  ghana: "GH", kenya: "KE", colombia: "CO", spain: "ES", italy: "IT",
  "sri lanka": "LK", malaysia: "MY", ukraine: "UA", egypt: "EG",
};

export function universityIdFor(name) {
  if (typeof name !== "string") return "";
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.slice(0, 128);
}

export function countryCodeFor(name) {
  if (typeof name !== "string") return null;
  return countryCodesByName[name.trim().toLowerCase()] || null;
}

function isUpcoming(item) {
  if (typeof item.effectiveAt !== "string" || !item.effectiveAt) return false;
  const target = new Date(`${item.effectiveAt}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return false;
  const diff = target - Date.now();
  return diff >= 0 && diff <= deadlineWindowMs;
}

export function rankNewsItems(items, profile = {}) {
  const universityId = universityIdFor(profile.university);
  const visaType = typeof profile.visaType === "string" ? profile.visaType.toLowerCase() : "";
  const nationality = countryCodeFor(profile.homeCountry);

  const scored = (Array.isArray(items) ? items : []).map((item, index) => {
    let score = 0;
    if (universityId && item.universityIds?.includes(universityId)) score += rankWeights.university;
    if (visaType && item.visaTypes?.includes(visaType)) score += rankWeights.visaType;
    if (nationality && item.nationalities?.includes(nationality)) score += rankWeights.nationality;
    if (profile.topics?.some((topic) => item.topics?.includes(topic))) score += rankWeights.topic;
    if (urgentLevels.has(item.urgency)) score += rankWeights.urgent;
    if (isUpcoming(item)) score += rankWeights.effectiveSoon;
    return { item, score, index };
  });

  return scored
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.item);
}

export function subscribeNews(filters, onData, onError, { intervalMs = 120_000 } = {}) {
  const params = new URLSearchParams();
  if (filters?.topic) params.set("topic", filters.topic);
  if (filters?.visaType) params.set("visaType", filters.visaType);
  if (filters?.legalState) params.set("legalState", filters.legalState);
  if (filters?.universityId) params.set("universityId", filters.universityId);
  const query_ = params.toString();

  let cancelled = false;
  const load = async () => {
    try {
      const data = await apiRequest(`/api/news${query_ ? `?${query_}` : ""}`);
      if (!cancelled) onData(data.items || [], { nextCursor: data.nextCursor || null });
    } catch (error) {
      if (!cancelled) onError?.(error);
    }
  };
  load();
  const interval = setInterval(load, intervalMs);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

export function saveNews(itemId) {
  return apiRequest(`/api/news/${itemId}/save`, { method: "POST" });
}

export function unsaveNews(itemId) {
  return apiRequest(`/api/news/${itemId}/save`, { method: "DELETE" });
}

export function updateNewsPreferences(input) {
  return apiRequest("/api/news/preferences", { method: "PUT", body: JSON.stringify(input) });
}

export function fetchUniversityCoverage(universityId) {
  if (!universityId) return Promise.resolve({ state: "no-verified-source", sources: [] });
  return apiRequest(`/api/news/university-coverage?universityId=${encodeURIComponent(universityId)}`);
}

export function subscribeNewsPreferences(uid, handler, onError) {
  return onSnapshot(
    doc(db, "users", uid, "newsPreferences", "profile"),
    (snapshot) => handler(snapshot.exists() ? snapshot.data() : {}),
    onError,
  );
}

export function subscribeSavedNews(uid, handler, onError) {
  const cache = new Map();
  const savedRef = query(collection(db, "users", uid, "savedNews"), orderBy("createdAt", "desc"));
  return onSnapshot(savedRef, async (snapshot) => {
    const records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    const details = await Promise.all(records.map(async (record) => {
      if (cache.has(record.newsItemId)) return cache.get(record.newsItemId);
      try {
        const item = await apiRequest(`/api/news/${record.newsItemId}`);
        cache.set(record.newsItemId, item);
        return item;
      } catch {
        return null;
      }
    }));
    handler(details.filter(Boolean));
  }, onError);
}

export function subscribeNotifications(uid, handler, onError) {
  const notificationsRef = query(collection(db, "users", uid, "notifications"), orderBy("createdAt", "desc"));
  return onSnapshot(
    notificationsRef,
    (snapshot) => handler(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export function markNotificationRead(uid, id) {
  return updateDoc(doc(db, "users", uid, "notifications", id), { read: true });
}

export function markAllNotificationsRead(uid, notifications) {
  return Promise.all(
    notifications.filter((notification) => !notification.read)
      .map((notification) => markNotificationRead(uid, notification.id)),
  );
}

export function syncNotifications() {
  return apiRequest("/api/notifications/sync", { method: "POST" });
}
