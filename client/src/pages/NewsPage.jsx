import React, { useState } from "react";
import { RefreshCcw } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { updatesLinks } from "../components/ui/SubNav";
import SourceStatus from "../components/SourceStatus";
import Disclaimer from "../components/Disclaimer";
import { rankNewsItems } from "../lib/news-data";
import CoverageLedger from "../components/CoverageLedger";
import DigestSettings from "../components/DigestSettings";
import TopStoriesReader from "../components/TopStoriesReader";
import NewsToolbar, { sourcesFromItems } from "../components/NewsToolbar";
import NewsArchive from "../components/NewsArchive";

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
  coverage = null, coverageLedger = null, sourceHealth = null, profile = {},
  preferences = {}, digests = [], onUpdatePreferences,
  onLoadMore, hasMore = false,
  zeroCostMode = false,
}) {
  const [showPreferences, setShowPreferences] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const allRanked = rankNewsItems(items, profile);
  const ranked = savedOnly ? allRanked.filter((item) => savedIds.has(item.id)) : allRanked;

  const toggleTopic = (topic) => {
    const current = preferences.topics || [];
    const next = current.includes(topic) ? current.filter((value) => value !== topic) : [...current, topic];
    onUpdatePreferences?.({ topics: next });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Updates and guides"
        title="Updates for you"
        description={zeroCostMode ? "A reviewed official-source feed stored with the app. Search and filters cover the currently published snapshot." : "Verified updates currently available from monitored sources, ranked for your profile. The complete available feed stays visible."}
        action={!zeroCostMode && <button type="button" className="button secondary" onClick={() => setShowPreferences((value) => !value)}>{showPreferences ? "Hide preferences" : "Edit preferences"}</button>}
      />
      <SubNav label="Updates sections" links={updatesLinks} />
      <PageHelp id="news" />

      <NewsToolbar filters={filters} onChange={onFilterChange} sources={zeroCostMode ? sourcesFromItems(items) : undefined} />

      {onToggleSave && <div className="saved-toggle"><button type="button" className={`button secondary ${savedOnly ? "active" : ""}`} aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)}>{savedOnly ? "Showing saved updates" : `Show saved updates (${savedIds.size})`}</button></div>}

      {sourceHealth?.state === "delayed" && (
        <div className="panel" style={{ marginBottom: 18 }} role="status">
          <SourceStatus state="delayed" />
          <small className="muted">{sourceHealth.delayedPublishers?.length ? `Delayed sources: ${sourceHealth.delayedPublishers.join(", ")}. Updates from these publishers may be missing or late.` : "This reviewed feed may be out of date. Check the official sources before relying on it."}</small>
        </div>
      )}

      {profile.university && coverage && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-title"><div><span className="eyebrow">{profile.university}</span><h2>Coverage status</h2></div></div>
          <SourceStatus state={coverage.state} />
        </div>
      )}

      <CoverageLedger ledger={coverageLedger} />

      {!zeroCostMode && <DigestSettings preferences={preferences} digests={digests} onChange={onUpdatePreferences} />}

      {!zeroCostMode && showPreferences && (
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

      <div className="filter-row news-state-filters" role="group" aria-label="Filter updates">
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
          <h3>{savedOnly ? "No saved updates here" : "No updates match yet"}</h3>
          {savedOnly ? <p>Use the bookmark on an update to keep it here. Saved updates that do not match your current filters are hidden.</p> : <p>GlobeReady has not published a verified update for these filters. This does not mean nothing has changed — check back soon or adjust your filters.</p>}
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <>
          <section className="top-stories-section"><div className="section-heading"><div><span className="eyebrow">Quick briefing</span><h2>Top stories</h2></div></div><TopStoriesReader items={ranked.slice(0, 6)} savedIds={savedIds} onToggleSave={onToggleSave} /></section>
          <NewsArchive items={ranked} profile={profile} savedIds={savedIds} onToggleSave={onToggleSave} onLoadMore={onLoadMore} hasMore={hasMore} />
        </>
      )}

      <Disclaimer compact />
    </div>
  );
}
