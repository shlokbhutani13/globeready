import React, { useState } from "react";

const labels = {
  active: "Active", pending: "Verification pending", disabled: "Disabled",
  delayed: "Delayed", failing: "Latest check failed", "not-checked": "Not checked yet",
};

function formatDate(value) {
  if (!value) return "No successful check recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "No successful check recorded" : `Last successful check ${date.toLocaleString()}`;
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
          <div><strong>{entry.publisher || entry.name}</strong><small>{labels[entry.status] || entry.status} · {formatDate(entry.lastSuccessAt || entry.lastVerifiedAt)}</small></div>
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
