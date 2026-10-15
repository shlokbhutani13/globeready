import React from "react";
import { localDateKey } from "../lib/reminders";

const legalMeaning = {
  proposed: "Proposed: this is not in force. It can still change or be dropped.",
  final: "Final: the rule is published. Check its effective date for when it applies.",
  scheduled: "Scheduled: it is set to take effect on a future date.",
  effective: "Effective: this is currently in force.",
  delayed: "Delayed: its start was pushed back. Check the official source for the new date.",
  enjoined: "Enjoined: a court has paused it. Check the official source for the current status.",
  superseded: "Superseded: a newer action replaced it.",
  withdrawn: "Withdrawn: the agency pulled it back.",
  expired: "Expired: it no longer applies.",
  informational: "Informational: guidance or news, not a new requirement.",
};

const documentTypes = {
  "final-rule": "Final rule", "proposed-rule": "Proposed rule", notice: "Notice", guidance: "Guidance", alert: "Alert",
};

function effectiveLine(effectiveAt, now) {
  if (!effectiveAt) return "";
  const days = Math.round((Date.parse(`${effectiveAt}T00:00:00Z`) - Date.parse(`${localDateKey(now)}T00:00:00Z`)) / 86_400_000);
  if (Number.isNaN(days)) return effectiveAt;
  if (days > 0) return `${effectiveAt} (in ${days} day${days === 1 ? "" : "s"})`;
  if (days === 0) return `${effectiveAt} (today)`;
  return `${effectiveAt} (${-days} day${days === -1 ? "" : "s"} ago)`;
}

// A plain-language reading aid built only from the reviewed record. It states no conclusions about the student's case.
export default function NewsAtAGlance({ item, now = new Date() }) {
  const rows = [
    ["Status", legalMeaning[item.legalState] || legalMeaning.informational],
    ["Type", documentTypes[item.documentType] || item.documentType],
    ["Published", item.publishedAt],
    ["Takes effect", effectiveLine(item.effectiveAt, now)],
    ["Reference", item.docketNumber],
    ["Reviewed", item.verifiedAt],
  ].filter(([, value]) => value);
  return <section className="news-detail-callout" aria-labelledby="glance-heading">
    <h2 id="glance-heading">At a glance</h2>
    <dl className="glance-list">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>This summary comes from GlobeReady's reviewed record of the official source. It does not say how the update applies to you. Confirm with your designated school official or the official source.</p>
  </section>;
}
