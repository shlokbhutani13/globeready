import React from "react";
import { AlertTriangle, CheckCircle2, Clock3, HelpCircle } from "lucide-react";

const stateCopy = {
  covered: { label: "Covered", detail: "Verified official sources are being monitored.", icon: CheckCircle2, tone: "covered" },
  partial: { label: "Partially covered", detail: "Some official sources are still pending verification.", icon: Clock3, tone: "partial" },
  "verification-pending": { label: "Verification pending", detail: "A submitted source has not been verified yet.", icon: Clock3, tone: "pending" },
  "no-verified-source": { label: "No verified source yet", detail: "GlobeReady has not verified an official source for this school.", icon: HelpCircle, tone: "pending" },
  delayed: { label: "Source check delayed", detail: "The last check did not complete. This does not mean nothing has changed.", icon: AlertTriangle, tone: "delayed" },
};

export default function SourceStatus({ state, compact = false }) {
  const copy = stateCopy[state] || stateCopy["no-verified-source"];
  const Icon = copy.icon;
  return (
    <div className={`source-status ${copy.tone} ${compact ? "compact" : ""}`} role="status">
      <Icon size={compact ? 14 : 16} />
      <div>
        <strong>{copy.label}</strong>
        {!compact && <small>{copy.detail}</small>}
      </div>
    </div>
  );
}
