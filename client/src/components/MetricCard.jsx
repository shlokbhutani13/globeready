import React from "react";

export default function MetricCard({ icon: Icon, label, value, detail, tone = "blue" }) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}><Icon size={19} /></span>
      <div><span className="metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}
