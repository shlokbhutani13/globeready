const urgentLevels = new Set(["critical", "urgent"]);
const deadlineWindowMs = 30 * 24 * 60 * 60 * 1000;

function isUpcomingDeadline(item, now) {
  if (typeof item.effectiveAt !== "string" || !item.effectiveAt) return false;
  const target = new Date(`${item.effectiveAt}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return false;
  const diff = target - now.getTime();
  return diff >= 0 && diff <= deadlineWindowMs;
}

const sections = [
  { title: "Urgent updates", match: (item) => urgentLevels.has(item.urgency) },
  { title: "Deadlines approaching", match: (item, now) => isUpcomingDeadline(item, now) },
  { title: "Other verified updates", match: () => true },
];

function summarize(item) {
  return {
    id: item.id,
    title: item.title,
    publisher: item.publisher,
    canonicalUrl: item.canonicalUrl,
    legalState: item.legalState,
    effectiveAt: item.effectiveAt ?? null,
    urgency: item.urgency ?? null,
  };
}

export function buildDigest(items = [], now = new Date(), context = {}) {
  const asOf = now instanceof Date ? now : new Date(now);
  const frequency = context.digestFrequency || context.frequency || "weekly";
  const seen = new Set();
  const grouped = sections.map((section) => ({ title: section.title, items: [] }));

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item.id !== "string" || seen.has(item.id)) continue;
    const sectionIndex = sections.findIndex((section) => section.match(item, asOf));
    if (sectionIndex === -1) continue;
    seen.add(item.id);
    grouped[sectionIndex].items.push(summarize(item));
  }

  for (const group of grouped) group.items = group.items.slice(0, 10);

  return {
    generatedAt: asOf.toISOString(),
    frequency,
    sections: grouped.filter((group) => group.items.length > 0),
    itemCount: seen.size,
  };
}
