import { rulesForNews } from "../data/rules-library";

const kindOrder = { published: 0, effective: 1, rule: 2 };

// Other reviewed updates about the same matter: the same docket, an explicit link from the reviewed feed, or at least
// two shared topics together with a shared visa type. Never guessed from titles.
export function relatedUpdates(item, items = []) {
  if (!item) return [];
  const topics = new Set(item.topics || []);
  const visas = new Set(item.visaTypes || []);
  return items
    .filter((other) => other.id !== item.id)
    .filter((other) => {
      if (item.docketNumber && other.docketNumber === item.docketNumber) return true;
      if ((item.relatedIds || []).includes(other.id) || (other.relatedIds || []).includes(item.id)) return true;
      const sharedTopics = (other.topics || []).filter((topic) => topics.has(topic)).length;
      const sharedVisa = visas.size === 0 || (other.visaTypes || []).some((visa) => visas.has(visa));
      return sharedTopics >= 2 && sharedVisa;
    })
    .sort((left, right) => String(right.publishedAt || "").localeCompare(String(left.publishedAt || "")));
}

export function updateTimeline(item, items = [], rules = rulesForNews(item?.id)) {
  if (!item) return [];
  const events = [];
  const add = (story, current) => {
    if (story.publishedAt) events.push({ date: story.publishedAt, kind: "published", label: current ? "Published" : story.title, to: current ? "" : `/news/${encodeURIComponent(story.id)}`, current });
    if (story.effectiveAt) events.push({ date: story.effectiveAt, kind: "effective", label: current ? "Takes effect" : `Takes effect: ${story.title}`, to: current ? "" : `/news/${encodeURIComponent(story.id)}`, current });
  };
  add(item, true);
  relatedUpdates(item, items).forEach((story) => add(story, false));
  for (const rule of rules) {
    if (rule.supersedes?.length && rule.effectiveAt) {
      events.push({ date: rule.effectiveAt, kind: "rule", label: `Replaces an earlier practice: ${rule.supersedes.map((id) => rules.find((entry) => entry.id === id)?.title).filter(Boolean).join("; ") || "see Rules and forms"}`, to: "/rules", current: false });
    }
  }
  const seen = new Set();
  return events
    .filter((event) => { const key = `${event.date}|${event.kind}|${event.label}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((left, right) => left.date.localeCompare(right.date) || kindOrder[left.kind] - kindOrder[right.kind]);
}
