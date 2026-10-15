import React, { useMemo, useState } from "react";

const unique = (values) => [...new Set(values.filter(Boolean))].sort();

export default function NewsReviewQueue({ candidates = [], loading = false, error = "", onRetry, onSelect = () => {} }) {
  const [filters, setFilters] = useState({ source: "", change: "", topic: "", visa: "", state: "", from: "" });
  const set = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));
  const options = useMemo(() => ({
    sources: unique(candidates.map((item) => item.sourceId)), changes: unique(candidates.map((item) => item.changeType)),
    topics: unique(candidates.flatMap((item) => item.current?.topics || item.previous?.topics || [])),
    visas: unique(candidates.flatMap((item) => item.current?.visaTypes || item.previous?.visaTypes || [])),
    states: unique(candidates.map((item) => item.publicationState)),
  }), [candidates]);
  const shown = candidates.filter((item) => (!filters.source || item.sourceId === filters.source)
    && (!filters.change || item.changeType === filters.change)
    && (!filters.topic || (item.current?.topics || item.previous?.topics || []).includes(filters.topic))
    && (!filters.visa || (item.current?.visaTypes || item.previous?.visaTypes || []).includes(filters.visa))
    && (!filters.state || item.publicationState === filters.state)
    && (!filters.from || String(item.collectedAt || "").slice(0, 10) >= filters.from));
  if (loading) return <p role="status">Loading review candidates…</p>;
  if (error) return <div><p className="inline-error" role="alert">{error}</p>{onRetry && <button className="button secondary" onClick={onRetry}>Retry</button>}</div>;
  return <section className="panel" aria-labelledby="candidate-queue-title">
    <div className="panel-title"><h2 id="candidate-queue-title">Official-source candidates</h2><span className="chip">{shown.length}</span></div>
    <div className="filter-grid">
      <label>Source<select value={filters.source} onChange={set("source")}><option value="">All</option>{options.sources.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Change type<select value={filters.change} onChange={set("change")}><option value="">All</option>{options.changes.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Topic<select value={filters.topic} onChange={set("topic")}><option value="">All</option>{options.topics.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Visa<select value={filters.visa} onChange={set("visa")}><option value="">All</option>{options.visas.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Review state<select value={filters.state} onChange={set("state")}><option value="">All</option>{options.states.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Collected from<input type="date" value={filters.from} onChange={set("from")} /></label>
    </div>
    {shown.length === 0 ? <p className="muted">No candidates match these filters.</p> : <ul className="record-list">{shown.map((item) => <li className="record" key={item.id}><div><strong>{item.current?.title || item.previous?.title}</strong><div className="record-meta"><span>{item.sourceId}</span><span>{item.changeType}</span><span>{String(item.collectedAt).slice(0, 10)}</span></div></div><button className="button secondary" onClick={() => onSelect(item)}>Review evidence</button></li>)}</ul>}
  </section>;
}
