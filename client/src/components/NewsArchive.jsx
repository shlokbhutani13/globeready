import React from "react";
import NewsCard from "./NewsCard";
import { seenState } from "../lib/news-discovery";

export default function NewsArchive({ seen, items, savedIds, onToggleSave, onLoadMore, hasMore, profile }) {
  return <section className="news-archive" aria-labelledby="all-news-title">
    <div className="section-heading"><div><span className="eyebrow">Browse every verified update</span><h2 id="all-news-title">All news</h2></div><span>{items.length} stories</span></div>
    <div className="news-grid">{items.map((item) => <NewsCard key={item.id} item={item} saved={savedIds?.has(item.id)} onToggleSave={onToggleSave} profile={profile} seenState={seen ? seenState(item, seen) : undefined} />)}</div>
    {hasMore && <button className="button secondary load-more" onClick={onLoadMore}>Load more</button>}
  </section>;
}
