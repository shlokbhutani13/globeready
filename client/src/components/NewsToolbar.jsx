import React from "react";
import { Search, X } from "lucide-react";

// Calendar dates in the student's own time zone. toISOString() would use UTC and shift evening dates to tomorrow.
export const iso = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
export function rangeFor(kind, now = new Date()) {
  const from = new Date(now);
  if (kind === "week") from.setDate(now.getDate() - 7);
  if (kind === "month") from.setMonth(now.getMonth() - 1);
  if (kind === "year") from.setFullYear(now.getFullYear() - 1);
  return kind === "all" ? { from: undefined, to: undefined } : { from: iso(from), to: iso(now) };
}

export default function NewsToolbar({ filters = {}, onChange }) {
  const update = (next) => onChange?.({ ...filters, ...next });
  return <section className="news-toolbar" aria-label="Search and filter news">
    <label className="news-search"><Search size={17} /><span className="sr-only">Search updates</span><input type="search" aria-label="Search updates" placeholder="Search rules, OPT, travel…" value={filters.q || ""} onChange={(e) => update({ q: e.target.value || undefined })} /></label>
    <div className="news-range" role="group" aria-label="Publication period">
      <button type="button" onClick={() => update(rangeFor("week"))}>This week</button>
      <button type="button" onClick={() => update(rangeFor("month"))}>This month</button>
      <button type="button" onClick={() => update(rangeFor("year"))}>This year</button>
      <button type="button" onClick={() => update(rangeFor("all"))}>All time</button>
    </div>
    <div className="news-custom-range">
      <label>From<input type="date" value={filters.from || ""} onChange={(e) => update({ from: e.target.value || undefined })} /></label>
      <label>To<input type="date" value={filters.to || ""} onChange={(e) => update({ to: e.target.value || undefined })} /></label>
      <label>Source<select value={filters.sourceId || ""} onChange={(e) => update({ sourceId: e.target.value || undefined })}><option value="">All official sources</option><option value="federal-register">Federal Register</option><option value="uscis">USCIS</option><option value="ice-sevp">SEVP</option><option value="state-visa-news">Department of State</option></select></label>
      <button className="news-reset" type="button" onClick={() => onChange?.({})}><X size={15} /> Reset</button>
    </div>
  </section>;
}
