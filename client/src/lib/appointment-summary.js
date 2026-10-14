import { caseKindLabel, caseStatusLabel, entryTypeLabel } from "./cases";
import { contactRoleLabels } from "../pages/ContactsPage";

// A one-page summary the student can take to an advising appointment. It contains only what the student explicitly
// selects, and never reads document contents. Receipt numbers are masked unless the student chooses to show them.
export const summaryNotice = "Prepared by the student with GlobeReady for an advising appointment. Every date and detail below was typed in by the student and has not been checked. This page is not an official record or legal advice.";

export function maskReceipt(value) {
  const compact = String(value || "").replace(/\s+/gu, "");
  if (!compact) return "";
  return compact.length <= 4 ? "••••" : `${"•".repeat(Math.min(compact.length - 4, 9))}${compact.slice(-4)}`;
}

export function buildSummary({ coverage = {}, profile = {}, selection = {}, data = {}, options = {}, now = new Date() } = {}) {
  const pick = (list, ids) => (list || []).filter((entry) => (ids || []).includes(entry.id));
  const sections = [];
  const header = { title: "Advising appointment summary", university: coverage.name || "", prepared: now.toISOString().slice(0, 10) };

  if (options.includeProfile) {
    const lines = [["Visa type", profile.visaType], ["Journey stage", profile.journeyStage], ["University", coverage.name]].filter(([, value]) => value && String(value).trim());
    if (lines.length) sections.push({ id: "about", heading: "About me", lines: lines.map(([label, value]) => `${label}: ${String(value).trim()}`) });
  }
  const questions = (data.questions || []).filter((question) => (selection.questionIds || []).includes(question.id));
  if (questions.length) sections.push({ id: "questions", heading: "Questions I want to ask", lines: questions.map((question) => question.text) });

  const cases = pick(data.cases, selection.caseIds).map((record) => {
    const lines = [`${caseKindLabel(record.kind)}${record.formNumber ? ` (Form ${record.formNumber})` : ""}; status I recorded: ${caseStatusLabel(record.status)}`];
    if (record.filedOn) lines.push(`Filed on: ${record.filedOn}`);
    if (record.receiptNumber) lines.push(`Receipt number: ${options.revealReceipts ? record.receiptNumber : maskReceipt(record.receiptNumber)}`);
    const upcoming = (record.timeline || []).filter((entry) => ["appointment", "rfe-due"].includes(entry.type) && entry.date >= header.prepared);
    for (const entry of upcoming) lines.push(`${entryTypeLabel(entry.type)}: ${entry.date}`);
    if (options.includeCaseNotes) {
      if (record.notes) lines.push(`My notes: ${record.notes}`);
      for (const entry of (record.timeline || []).filter((item) => item.text)) lines.push(`${entry.date} ${entryTypeLabel(entry.type)}: ${entry.text}`);
    }
    return { title: record.title, lines };
  });
  if (cases.length) sections.push({ id: "cases", heading: "Cases I am tracking", groups: cases });

  const dates = pick(data.dates, selection.dateIds).sort((left, right) => String(left.date).localeCompare(String(right.date)));
  if (dates.length) sections.push({ id: "dates", heading: "Dates I entered", lines: dates.map((entry) => `${entry.label}: ${entry.date}`) });

  const terms = pick(data.terms, selection.termIds);
  if (terms.length) sections.push({ id: "terms", heading: "Term notes I wrote", lines: terms.map((entry) => `${entry.label}${entry.date ? ` (${entry.date})` : ""}${entry.note ? `: ${entry.note}` : ""}`) });

  const contacts = pick(data.contacts, selection.contactIds);
  if (contacts.length) sections.push({ id: "contacts", heading: "Contact details I have", lines: contacts.map((contact) => [`${contact.name} (${contactRoleLabels[contact.role] || "Contact"})`, contact.phone, contact.email].filter(Boolean).join("; ")) });

  return { header, sections, notice: summaryNotice, empty: sections.length === 0 };
}

export function summaryText(summary) {
  const lines = [summary.header.title + (summary.header.university ? ` – ${summary.header.university}` : ""), `Prepared ${summary.header.prepared}`, "", summaryNotice];
  for (const section of summary.sections) {
    lines.push("", section.heading.toUpperCase());
    if (section.groups) for (const group of section.groups) { lines.push(`- ${group.title}`, ...group.lines.map((line) => `    ${line}`)); }
    else lines.push(...section.lines.map((line) => `- ${line}`));
  }
  return lines.join("\n");
}

export function summaryFileName(summary) {
  return `advising-summary-${summary.header.prepared}.txt`;
}
