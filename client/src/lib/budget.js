// A private, manual budget. Amounts are typed by the student in one currency of their choice; nothing is converted, looked
// up or fetched. Money is held as whole cents so totals never drift. The plan lives in this browser only.
export const budgetCategories = [
  { id: "housing", label: "Housing and rent" }, { id: "food", label: "Food" }, { id: "transport", label: "Transport" },
  { id: "phone", label: "Phone and internet" }, { id: "health", label: "Health and insurance" }, { id: "tuition", label: "Tuition and fees" },
  { id: "books", label: "Books and supplies" }, { id: "utilities", label: "Utilities" }, { id: "personal", label: "Personal and leisure" },
  { id: "travel", label: "Travel home" }, { id: "arrival", label: "Arrival and setup" }, { id: "other", label: "Other" },
];
export const frequencies = [{ id: "weekly", label: "Every week" }, { id: "monthly", label: "Every month" }, { id: "yearly", label: "Every year" }];
export const limits = { items: 200, label: 80, note: 200, cents: 100_000_000 };
const key = (scope) => `globeready:budget:v1:${scope || "anon"}`;
const categoryIds = new Set(budgetCategories.map((category) => category.id));
export const categoryLabel = (id) => budgetCategories.find((category) => category.id === id)?.label || "Other";
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/u;
export const thisMonth = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
export const emptyBudget = (now = new Date()) => ({ currency: "USD", startMonth: thisMonth(now), items: [] });

export function parseAmount(input) {
  const text = String(input ?? "").trim().replace(/,/gu, "");
  if (!/^\d+(\.\d{1,2})?$/u.test(text)) throw new Error("Enter an amount such as 1200 or 49.99, with no symbols or negative numbers.");
  const cents = Math.round(Number(text) * 100);
  if (cents > limits.cents) throw new Error("That amount is too large for this planner.");
  return cents;
}
export const formatAmount = (cents, currency = "USD") => `${currency} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plain = (cents) => (cents / 100).toFixed(2);

export function monthlyCents(item) {
  if (item.kind !== "recurring") return 0;
  if (item.frequency === "weekly") return Math.round((item.cents * 52) / 12);
  if (item.frequency === "yearly") return Math.round(item.cents / 12);
  return item.cents;
}

const makeId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export function validItem(input = {}, id = makeId()) {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!label) throw new Error("Give this cost a short name, such as “Rent” or “Phone plan”.");
  if (label.length > limits.label) throw new Error(`The name must be ${limits.label} characters or fewer.`);
  if (!categoryIds.has(input.category)) throw new Error("Choose a category.");
  if (!["recurring", "one-time"].includes(input.kind)) throw new Error("Choose whether this repeats or happens once.");
  const cents = Number.isInteger(input.cents) ? input.cents : parseAmount(input.amount);
  if (cents < 0 || cents > limits.cents) throw new Error("That amount is not usable.");
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > limits.note) throw new Error(`The note must be ${limits.note} characters or fewer.`);
  const item = { id, label, category: input.category, kind: input.kind, cents, note };
  if (input.kind === "recurring") {
    if (!frequencies.some((entry) => entry.id === input.frequency)) throw new Error("Choose how often it repeats.");
    item.frequency = input.frequency;
  } else {
    const month = typeof input.month === "string" ? input.month.trim() : "";
    if (month && !monthPattern.test(month)) throw new Error("Choose a real month, or leave it empty.");
    item.month = month;
  }
  return item;
}

export function cleanBudget(value, now = new Date()) {
  const base = emptyBudget(now);
  if (!value || typeof value !== "object") return base;
  if (/^[A-Z]{3}$/u.test(value.currency)) base.currency = value.currency;
  if (monthPattern.test(value.startMonth)) base.startMonth = value.startMonth;
  for (const item of Array.isArray(value.items) ? value.items.slice(0, limits.items) : []) {
    try { if (typeof item?.id === "string" && /^[a-z0-9]{4,24}$/u.test(item.id)) base.items.push(validItem(item, item.id)); } catch { /* skip a damaged entry */ }
  }
  return base;
}
export function loadBudget(storage, scope, now = new Date()) {
  try { return cleanBudget(JSON.parse(storage?.getItem(key(scope)) || "null"), now); } catch { return emptyBudget(now); }
}
export function saveBudget(storage, scope, budget, now = new Date()) {
  const clean = cleanBudget(budget, now);
  try { storage.setItem(key(scope), JSON.stringify(clean)); } catch { throw new Error("This browser would not save your budget. Private browsing can block it."); }
  return clean;
}
export function clearBudget(storage, scope) { try { storage?.removeItem(key(scope)); } catch { /* ignore */ } }

export function setCurrency(budget, code) {
  const value = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(value)) throw new Error("Use a three-letter currency code, such as USD or EUR.");
  return { ...budget, currency: value };
}
export function setStartMonth(budget, month) {
  if (!monthPattern.test(month || "")) throw new Error("Choose a real start month.");
  return { ...budget, startMonth: month };
}
export function upsertItem(budget, input, id) {
  const existing = id ? budget.items.find((item) => item.id === id) : null;
  if (!existing && budget.items.length >= limits.items) throw new Error(`You can keep up to ${limits.items} costs. Remove one first.`);
  const item = validItem(input, id || undefined);
  return { ...budget, items: existing ? budget.items.map((entry) => (entry.id === id ? item : entry)) : [...budget.items, item] };
}
export const removeItem = (budget, id) => ({ ...budget, items: budget.items.filter((item) => item.id !== id) });

export function addMonths(month, count) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function summarize(budget, { months = 12 } = {}) {
  const categories = Object.fromEntries(budgetCategories.map((category) => [category.id, { id: category.id, label: category.label, monthly: 0, oneTime: 0 }]));
  let monthly = 0; let oneTime = 0; let undated = 0;
  for (const item of budget.items) {
    if (item.kind === "recurring") { const amount = monthlyCents(item); monthly += amount; categories[item.category].monthly += amount; }
    else { oneTime += item.cents; categories[item.category].oneTime += item.cents; if (!item.month) undated += item.cents; }
  }
  const timeline = Array.from({ length: months }, (_, index) => {
    const month = addMonths(budget.startMonth, index);
    const once = budget.items.filter((item) => item.kind === "one-time" && item.month === month).reduce((sum, item) => sum + item.cents, 0);
    return { month, recurring: monthly, oneTime: once, total: monthly + once };
  });
  const scheduledOnce = timeline.reduce((sum, row) => sum + row.oneTime, 0);
  return {
    monthly, oneTime, undated, categories: Object.values(categories).filter((entry) => entry.monthly || entry.oneTime), timeline,
    firstYear: timeline.reduce((sum, row) => sum + row.total, 0) + undated,
    outsideRange: oneTime - undated - scheduledOnce,
  };
}

// CSV safe for spreadsheets: quotes are doubled, and a text cell that could be read as a formula is prefixed with an apostrophe.
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/u.test(text)) text = `'${text}`;
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function budgetCsv(budget, { months = 12 } = {}) {
  const sum = summarize(budget, { months });
  const row = (cells) => cells.map(csvCell).join(",");
  const lines = [row(["Costs"]), row(["Name", "Category", "Type", "How often", "Amount", "Currency", "Month", "Monthly equivalent", "Note"])];
  for (const item of budget.items) lines.push(row([item.label, categoryLabel(item.category), item.kind === "recurring" ? "Repeats" : "One-time", item.kind === "recurring" ? frequencies.find((f) => f.id === item.frequency).label : "", plain(item.cents), budget.currency, item.month || "", item.kind === "recurring" ? plain(monthlyCents(item)) : "", item.note]));
  lines.push("", row(["Category totals"]), row(["Category", "Monthly (repeating)", "One-time", "Currency"]));
  for (const entry of sum.categories) lines.push(row([entry.label, plain(entry.monthly), plain(entry.oneTime), budget.currency]));
  lines.push("", row([`Month by month from ${budget.startMonth}`]), row(["Month", "Repeating", "One-time", "Total", "Currency"]));
  for (const month of sum.timeline) lines.push(row([month.month, plain(month.recurring), plain(month.oneTime), plain(month.total), budget.currency]));
  lines.push("", row(["Totals"]), row(["Repeating per month", plain(sum.monthly), budget.currency]), row(["All one-time costs", plain(sum.oneTime), budget.currency]), row([`Next ${months} months, including one-time costs without a month`, plain(sum.firstYear), budget.currency]));
  return `${lines.join("\r\n")}\r\n`;
}
