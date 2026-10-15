import { loadReadiness, documentRows } from "./document-readiness";
import { loadBudget } from "./budget";
import { loadCard } from "./emergency-card";

// What the three private tools can add to "Your next steps". It reads them from this browser, never sends them anywhere,
// and avoids repeating what Key dates, Journey and Contacts already contribute: dates for passport, visa and I-20 come
// from Key dates and already have their own steps, and Journey steps are suggested by Journey.
export { LIFE_EVENT, notifyLifeChanged } from "./life-events";

export function loadLifeSignals(storage, scope, { keyDates = [], now = new Date() } = {}) {
  const rows = documentRows(loadReadiness(storage, scope), keyDates, now);
  const budget = loadBudget(storage, scope, now);
  const card = loadCard(storage, scope);
  return {
    missing: rows.filter((row) => row.status === "missing").map((row) => row.label),
    review: rows.filter((row) => row.status === "review").map((row) => row.label),
    typedDates: rows.filter((row) => row.dateSource === "typed" && row.status !== "missing" && (row.dateState === "soon" || row.dateState === "past")).map((row) => ({ label: row.label, date: row.date, days: row.days, state: row.dateState })),
    budgetEmpty: budget.items.length === 0,
    cardStarted: Object.values(card.include).some(Boolean) || card.contactIds.length > 0,
  };
}

const list = (labels) => (labels.length <= 3 ? labels.join(", ") : `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more`);
const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function lifeSteps(signals) {
  if (!signals) return [];
  const steps = [];
  if (signals.missing.length) steps.push({ id: `life:docs-missing:${signals.missing.join("|")}`, kind: "documents", rank: 3, days: 0, title: `Find ${plural(signals.missing.length, "document")} you marked as missing`, reason: `You marked these as missing: ${list(signals.missing)}. This list only reflects what you entered.`, to: "/life/documents", openLabel: "Open documents checklist" });
  if (signals.review.length) steps.push({ id: `life:docs-review:${signals.review.join("|")}`, kind: "documents", rank: 3, days: 1, title: `Look again at ${plural(signals.review.length, "document")} you marked for review`, reason: `You marked these as needing review: ${list(signals.review)}.`, to: "/life/documents", openLabel: "Open documents checklist" });
  for (const entry of signals.typedDates) {
    const when = entry.days < 0 ? `passed ${plural(-entry.days, "day")} ago` : entry.days === 0 ? "is today" : `is in ${plural(entry.days, "day")}`;
    steps.push({ id: `life:doc-date:${entry.label}:${entry.date}`, kind: "documents", rank: entry.days < 0 ? 1 : entry.days <= 7 ? 2 : 3, days: entry.days, title: `${entry.label}: date you entered`, reason: `The date you entered, ${entry.date}, ${when}. Check the document itself.`, to: "/life/documents", openLabel: "Open documents checklist" });
  }
  if (signals.budgetEmpty) steps.push({ id: "life:budget-empty", kind: "suggestion", rank: 4, days: null, title: "Plan your monthly and arrival costs", reason: "Your private budget is empty. It is a suggestion with no deadline, and nothing is shared.", to: "/life/budget", openLabel: "Open budget" });
  if (!signals.cardStarted) steps.push({ id: "life:card-empty", kind: "suggestion", rank: 4, days: null, title: "Make an emergency information card", reason: "You have not chosen anything for it yet. It is optional, private and has no deadline.", to: "/life/emergency-card", openLabel: "Open emergency card" });
  return steps;
}
