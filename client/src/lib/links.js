import { rulesLibrary } from "../data/rules-library";
import { guides } from "../data/guides";

// Connections between a task and the things it came from: an update, a rule or form, a case, a key date or a guide.
// A link stores only the kind and ID, so nothing is copied and nothing leaves the student's account.
export const linkTypeLabels = { news: "Update", rule: "Rule or form", case: "Case", date: "Key date", guide: "Guide" };

export function resolveLink(link, { news = [], cases = [], dates = [] } = {}) {
  if (!link || typeof link.id !== "string") return null;
  const id = encodeURIComponent(link.id);
  if (link.type === "news") {
    const item = news.find((entry) => entry.id === link.id);
    return { ...link, label: item?.title || "Update", to: `/news/${id}`, found: Boolean(item) };
  }
  if (link.type === "rule") {
    const entry = rulesLibrary.find((rule) => rule.id === link.id);
    return { ...link, label: entry?.title || "Rule or form", to: "/rules", found: Boolean(entry) };
  }
  if (link.type === "case") {
    const entry = cases.find((item) => item.id === link.id);
    return { ...link, label: entry?.title || "Case", to: "/cases", found: Boolean(entry) };
  }
  if (link.type === "date") {
    const entry = dates.find((item) => item.id === link.id);
    return { ...link, label: entry?.label || "Key date", to: "/dates", found: Boolean(entry) };
  }
  if (link.type === "guide") {
    const entry = guides.find((guide) => guide.id === link.id);
    return { ...link, label: entry?.title || "Guide", to: "/guides", found: Boolean(entry) };
  }
  return null;
}

export function resolveLinks(links = [], context = {}) {
  return (Array.isArray(links) ? links : []).map((link) => resolveLink(link, context)).filter(Boolean);
}

// Tasks, as a reverse lookup: which tasks point at this item.
export function tasksLinkedTo(tasks = [], type, id) {
  return tasks.filter((task) => Array.isArray(task.links) && task.links.some((link) => link.type === type && link.id === id));
}
