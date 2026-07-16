import React, { useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { guides } from "../data/guides";
import Disclaimer from "../components/Disclaimer";

export default function GuidesPage() {
  const [filter, setFilter] = useState("All");
  const categories = ["All", ...new Set(guides.map((guide) => guide.category))];
  const shown = filter === "All" ? guides : guides.filter((guide) => guide.category === filter);
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Trusted resources</span><h1>International student guides</h1><p>Start with official sources, then confirm university-specific requirements.</p></div></header>
      <div className="filter-row">{categories.map((category) => <button className={filter === category ? "active" : ""} onClick={() => setFilter(category)} key={category}>{category}</button>)}</div>
      <section className="guide-grid">{shown.map((guide) => <article className="guide-card" key={guide.id}><span className="guide-category">{guide.category}</span><h2>{guide.title}</h2><p>{guide.summary}</p><div className="guide-source"><span>Source</span><strong>{guide.source}</strong><small>Reviewed {guide.reviewed}</small></div><div className="guide-actions"><button aria-label={`Save ${guide.title}`}><Bookmark size={16} /> Save</button><a href={guide.url} target="_blank" rel="noreferrer">Official source <ExternalLink size={15} /></a></div></article>)}</section>
      <Disclaimer />
    </div>
  );
}
