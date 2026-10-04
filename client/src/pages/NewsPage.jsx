import React, { useState } from "react";
import { RefreshCcw } from "lucide-react";
import NewsCard from "../components/NewsCard";
import SourceStatus from "../components/SourceStatus";
import Disclaimer from "../components/Disclaimer";
import { rankNewsItems } from "../lib/news-data";

export const topicOptions = [
  "general", "status", "forms-fees", "employment", "travel-entry",
  "taxes-social-security", "emergency", "campus-life", "university",
];
export const visaTypeOptions = ["f-1", "f-2", "m-1", "m-2", "j-1", "j-2", "h-1b"];
export const legalStateOptions = [
  "proposed", "final", "scheduled", "effective", "delayed", "enjoined",
  "superseded", "withdrawn", "expired", "informational",
];

export default function NewsPage({
  items = [], loading = false, error = "", onRetry,
  filters = {}, onFilterChange,
  savedIds = new Set(), onToggleSave,
  coverage = null, profile = {},
  preferences = {}, onUpdatePreferences,
}) {
  const [showPreferences, setShowPreferences] = useState(false);
  const ranked = rankNewsItems(items, profile);

  const toggleTopic = (topic) => {
    const current = preferences.topics || [];
    const next = current.includes(topic) ? current.filter((value) => value !== topic) : [...current, topic];
    onUpdatePreferences?.({ topics: next });
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Nationwide updates</span>
          <h1>Updates for you</h1>
          <p>Every verified update affecting international students, ranked for your profile. Nothing is hidden.</p>
        </div>
        <button className="button secondary" onClick={() => setShowPreferences((value) => !value)}>
          {showPreferences ? "Hide preferences" : "Edit preferences"}
        </button>
      </header>

      {profile.university && coverage && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title"><div><span className="eyebrow">{profile.university}</span><h2>Coverage status</h2></div></div>
          <SourceStatus state={coverage.state} />
        </div>
      )}

      {showPreferences && (
        <section className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title"><h2>Topics you care about</h2></div>
          <div className="filter-row">
            {topicOptions.map((topic) => (
              <button
                key={topic}
                type="button"
                className={(preferences.topics || []).includes(topic) ? "active" : ""}
                onClick={() => toggleTopic(topic)}
              >
                {topic.replace(/-/g, " ")}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="filter-row" role="group" aria-label="Filter updates">
        <button type="button" className={!filters.legalState ? "active" : ""} onClick={() => onFilterChange?.({ ...filters, legalState: undefined })}>All</button>
        {legalStateOptions.map((state) => (
          <button
            key={state}
            type="button"
            className={filters.legalState === state ? "active" : ""}
            onClick={() => onFilterChange?.({ ...filters, legalState: state })}
          >
            {state}
          </button>
        ))}
      </div>

      {loading && <div className="empty-state"><p>Loading verified updates…</p></div>}

      {!loading && error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={onRetry}><RefreshCcw size={15} /> Retry</button>
        </div>
      )}

      {!loading && !error && ranked.length === 0 && (
        <div className="empty-state">
          <h3>No updates match yet</h3>
          <p>GlobeReady has not published a verified update for these filters. This does not mean nothing has changed — check back soon or adjust your filters.</p>
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <div className="news-grid">
          {ranked.map((item) => (
            <NewsCard key={item.id} item={item} saved={savedIds.has(item.id)} onToggleSave={onToggleSave} />
          ))}
        </div>
      )}

      <Disclaimer compact />
    </div>
  );
}
