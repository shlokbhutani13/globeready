import React, { useEffect, useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import { guides } from "../data/guides";
import Disclaimer from "../components/Disclaimer";

const noSavedUrls = [];

export default function GuidesPage({ onSave = async () => {}, savedUrls = noSavedUrls }) {
  const [filter, setFilter] = useState("All");
  const [saved, setSaved] = useState(new Set(savedUrls));
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const categories = ["All", ...new Set(guides.map((guide) => guide.category))];
  const shown = filter === "All" ? guides : guides.filter((guide) => guide.category === filter);
  useEffect(() => setSaved(new Set(savedUrls)), [savedUrls]);
  const save = async (guide) => {
    setError("");
    setSaving(guide.id);
    try {
      await onSave(guide);
      setSaved((current) => new Set(current).add(guide.url));
    } catch (reason) {
      setError(reason?.message || "Could not save this resource.");
    } finally {
      setSaving("");
    }
  };
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Trusted resources</span><h1>International student guides</h1><p>Start with official sources, then confirm university-specific requirements.</p></div></header>
      <div className="filter-row">{categories.map((category) => <button className={filter === category ? "active" : ""} onClick={() => setFilter(category)} key={category}>{category}</button>)}</div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <section className="guide-grid">{shown.map((guide) => {
        const isSaved = saved.has(guide.url);
        return <article className="guide-card" key={guide.id}><span className="guide-category">{guide.category}</span><h2>{guide.title}</h2><p>{guide.summary}</p><div className="guide-source"><span>Source</span><strong>{guide.source}</strong><small>Reviewed {guide.reviewed}</small></div><div className="guide-actions"><button disabled={isSaved || saving === guide.id} aria-label={`${isSaved ? "Saved" : "Save"} ${guide.title}`} onClick={() => save(guide)}><Bookmark size={16} /> {isSaved ? "Saved" : saving === guide.id ? "Saving…" : "Save"}</button><a href={guide.url} target="_blank" rel="noreferrer">Official source <ExternalLink size={15} /></a></div></article>;
      })}</section>
      <Disclaimer />
    </div>
  );
}
