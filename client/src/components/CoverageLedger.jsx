import React, { useState } from "react";

const labels = {
  active: "Active", pending: "Verification pending", disabled: "Disabled",
  delayed: "Delayed", failing: "Latest check failed", "not-checked": "Not checked yet",
  planned: "Planned — not monitored yet",
};

function formatted(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "";
}

// Only an active source has a check to report. lastSuccessAt comes from automated checks (full product);
// lastVerifiedAt is when a person last reviewed the source for the static zero-cost feed.
export function checkLabel(entry) {
  if (entry.status === "planned" || entry.status === "disabled") return "Not monitored";
  if (formatted(entry.lastSuccessAt)) return `Last successful check ${formatted(entry.lastSuccessAt)}`;
  if (entry.status === "active" && formatted(entry.lastVerifiedAt)) return `Last reviewed ${formatted(entry.lastVerifiedAt)}`;
  return "No successful check recorded";
}

export default function CoverageLedger({ ledger, admin = false }) {
  const [open, setOpen] = useState(false);
  if (!ledger || !Array.isArray(ledger.entries)) return null;
  const total = ledger.summary?.total ?? ledger.entries.length;
  const active = ledger.summary?.active ?? ledger.entries.filter(({ status }) => status === "active").length;
  return (
    <section className="panel coverage-ledger" aria-labelledby={admin ? "admin-coverage-title" : "coverage-title"}>
      <div className="panel-title">
        <div>
          <span className="eyebrow">Source coverage</span>
          <h2 id={admin ? "admin-coverage-title" : "coverage-title"}>{active} of {total} sources active</h2>
        </div>
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? "Hide source details" : "Show source details"}
        </button>
      </div>
      <p className="muted">Coverage depends on verified sources and recent successful checks. Missing or delayed checks can mean updates are late.</p>
      {open && <div className="coverage-list">
        {ledger.entries.map((entry) => <div className="coverage-row" key={entry.id}>
          <div><strong>{entry.publisher || entry.name}</strong><small>{labels[entry.status] || entry.status} · {checkLabel(entry)}</small></div>
          <span className={`coverage-state ${entry.status}`}>{labels[entry.status] || entry.status}</span>
          {entry.safeReason && <p>{entry.safeReason}</p>}
          {admin && <small className="coverage-admin-detail">
            Failures: {entry.consecutiveFailures || 0} · Last run: {entry.latestRunStatus || "none"} · Contract: {entry.checklistComplete ? "complete" : "incomplete"} · Onboarding: {entry.onboardingState || "not set"}
          </small>}
        </div>)}
      </div>}
    </section>
  );
}
