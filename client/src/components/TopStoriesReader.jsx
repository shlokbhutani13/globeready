import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { newsImageFor } from "../lib/news-images";

export default function TopStoriesReader({ items = [], savedIds = new Set(), onToggleSave }) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;
  const move = (delta) => setIndex((current) => (current + delta + items.length) % items.length);
  const item = items[index];
  const image = newsImageFor(item);
  return <section className="top-stories" aria-label="Top stories" tabIndex="0" onKeyDown={(event) => {
    if (event.key === "ArrowRight") move(1);
    if (event.key === "ArrowLeft") move(-1);
  }}>
    <img src={image.url} alt={image.alt} onError={(event) => { event.currentTarget.src = newsImageFor({}).url; }} />
    <div className="top-story-copy">
      <span className="eyebrow">Top story · {item.publisher || "Official source"}</span>
      <h2>{item.title || "Untitled update"}</h2>
      <p>{item.shortSummary || item.excerpt || item.sourceExcerpt || "Open this update for verified details from the official source."}</p>
      {item.whyItMatters && <div className="why-it-matters"><strong>Why this matters</strong><span>{item.whyItMatters}</span></div>}
      <div className="top-story-actions">
        <button type="button" aria-label="Previous story" onClick={() => move(-1)}><ChevronLeft /></button>
        <span>{index + 1} of {items.length}</span>
        <button type="button" aria-label="Next story" onClick={() => move(1)}><ChevronRight /></button>
        {onToggleSave && <button type="button" className="button secondary" aria-pressed={savedIds.has(item.id)} aria-label={savedIds.has(item.id) ? `Unsave ${item.title}` : `Save ${item.title}`} onClick={() => onToggleSave(item)}>{savedIds.has(item.id) ? "Saved" : "Save"}</button>}
      </div>
    </div>
  </section>;
}
