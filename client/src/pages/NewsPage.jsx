import React, { useRef, useState } from "react";
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
import NewsDiscovery from "../components/NewsDiscovery";
import { applyDiscovery, discoveryOptions, isUnread, isUpdatedSinceSeen, loadSearches, loadSeen, markSeen, mergeFilters, removeSearch, saveSearch, splitFilters } from "../lib/news-discovery";
import { localDateKey } from "../lib/reminders";
import { capNewsBySource } from "../lib/news-balance";

export const topicOptions = [
  "general", "status", "forms-fees", "employment", "travel-entry",
  "taxes-social-security", "emergency", "campus-life", "university",
];
export const visaTypeOptions = ["f-1", "f-2", "m-1", "m-2", "j-1", "j-2", "h-1b"];
export const legalStateOptions = [
  "proposed", "final", "scheduled", "effective", "delayed", "enjoined",
  "superseded", "withdrawn", "expired", "informational",
];

const remember = (previous, current) => {
  const values = new Map(previous.map((entry) => [entry.id, entry]));
  for (const entry of current) values.set(entry.id, entry);
  return [...values.values()].sort((left, right) => left.label.localeCompare(right.label));
};

export default function NewsPage({
  items = [], loading = false, error = "", onRetry,
  filters = {}, onFilterChange,
  savedIds = new Set(), onToggleSave,
  coverage = null, coverageLedger = null, sourceHealth = null, profile = {},
  preferences = {}, digests = [], onUpdatePreferences,
  onLoadMore, hasMore = false,
  zeroCostMode = false, storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage,
}) {
  const [showPreferences, setShowPreferences] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [flags, setFlags] = useState({});
  const [seen, setSeen] = useState(() => (zeroCostMode ? loadSeen(storage, storageScope) : {}));
  const [searches, setSearches] = useState(() => (zeroCostMode ? loadSearches(storage, storageScope) : []));
  const optionCache = useRef({ scope: storageScope, topics: [], visas: [], sources: [] });
  if (optionCache.current.scope !== storageScope) optionCache.current = { scope: storageScope, topics: [], visas: [], sources: [] };
  const allRanked = rankNewsItems(items, profile);
  const discovered = zeroCostMode ? applyDiscovery(allRanked, flags, { profile, seen, today: localDateKey(new Date()) }) : allRanked;
  const chronological = [...discovered].sort((left, right) => {
    const direction = filters.sort === "oldest" ? 1 : -1;
    return direction * String(left.publishedAt || "").localeCompare(String(right.publishedAt || ""));
  });
  const ranked = savedOnly ? chronological.filter((item) => savedIds.has(item.id)) : chronological;
  const balanceMainView = zeroCostMode && !filters.sourceId && !savedOnly;
  const balanced = balanceMainView && !showAllSources ? capNewsBySource(ranked) : ranked;
  const hasCappedStories = balanced.length < ranked.length;
  const foundOptions = discoveryOptions(items);
  optionCache.current.topics = remember(optionCache.current.topics, foundOptions.topics);
  optionCache.current.visas = remember(optionCache.current.visas, foundOptions.visas);
  optionCache.current.sources = remember(optionCache.current.sources, sourcesFromItems(items));
  const options = optionCache.current;
  const unreadCount = items.filter((item) => isUnread(item, seen) || isUpdatedSinceSeen(item, seen)).length;
  const sourceProblems = (sourceHealth?.sourceReports || []).filter((report) => report.state !== "current");
  const setFlag = (name, value) => setFlags((current) => ({ ...current, [name]: value || undefined }));
  const currentSearch = () => mergeFilters(filters, flags);
  const applySearch = (entry) => { const { feed, flags: saved } = splitFilters(entry.filters); onFilterChange?.(feed); setFlags(saved); };

  const toggleTopic = (topic) => {
    const current = preferences.topics || [];
    const next = current.includes(topic) ? current.filter((value) => value !== topic) : [...current, topic];
    onUpdatePreferences?.({ topics: next });
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Updates and guides"
        title="Official updates"
        description={zeroCostMode ? "Recent updates collected automatically from official and established sector sources, alongside GlobeReady-reviewed records. Open the original source for the full text." : "Verified updates currently available from monitored sources, ranked for your profile. The complete available feed stays visible."}
        action={!zeroCostMode && <button type="button" className="button secondary" onClick={() => setShowPreferences((value) => !value)}>{showPreferences ? "Hide preferences" : "Edit preferences"}</button>}
      />
      <SubNav label="Updates sections" links={updatesLinks} />
      <PageHelp id="news" />

      <NewsToolbar filters={filters} onChange={onFilterChange} sources={zeroCostMode ? options.sources : undefined} />

      {zeroCostMode && sourceHealth?.generatedAt && <p className="muted news-last-updated" role="status">Updated {new Date(sourceHealth.generatedAt).toLocaleString()}</p>}
      {zeroCostMode && sourceProblems.length > 0 && <details className="panel source-coverage-notes"><summary>Source coverage notes ({sourceProblems.length})</summary><ul>{sourceProblems.map((report) => <li key={report.sourceId}><strong>{report.name}</strong>: {report.state}{report.reason || report.error ? ` — ${report.reason || report.error}` : ""}</li>)}</ul></details>}

      {zeroCostMode && (
        <NewsDiscovery
          options={options} filters={filters} onFilter={(next) => onFilterChange?.({ ...filters, ...next })} flags={flags} onFlag={setFlag}
          searches={searches} unreadCount={unreadCount}
          onSave={(name) => setSearches(saveSearch(storage, storageScope, name, currentSearch()))}
          onApply={applySearch} onRemove={(id) => setSearches(removeSearch(storage, storageScope, id))}
          onMarkAllSeen={() => setSeen(markSeen(storage, storageScope, items))}
        />
      )}

      {onToggleSave && <div className="saved-toggle"><button type="button" className={`button secondary ${savedOnly ? "active" : ""}`} aria-pressed={savedOnly} onClick={() => setSavedOnly((value) => !value)}>{savedOnly ? "Showing saved updates" : `Show saved updates (${savedIds.size})`}</button></div>}

      {sourceHealth?.state === "delayed" && (
        <div className="panel" style={{ marginBottom: 18 }} role="status">
          <SourceStatus state="delayed" />
          <small className="muted">{sourceHealth.message || (sourceHealth.delayedPublishers?.length ? `Delayed sources: ${sourceHealth.delayedPublishers.join(", ")}. Updates from these publishers may be missing or late.` : "The automatic feed may be out of date. Check the original sources before relying on it.")}</small>
        </div>
      )}
      {sourceHealth?.state === "degraded" && (
        <div className="panel" style={{ marginBottom: 18 }} role="status">
          <SourceStatus state="failing" />
          <small className="muted">{sourceHealth.message || "Automatic official-source updates are temporarily unavailable. Check the original sources before relying on the feed."}</small>
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

      {loading && <div className="empty-state" role="status"><p>Loading official updates…</p></div>}

      {!loading && error && (
        <div className="inline-error" role="alert">
          <p>{error}</p>
          <button className="button secondary" onClick={onRetry}><RefreshCcw size={15} /> Retry</button>
        </div>
      )}

      {!loading && !error && ranked.length === 0 && (
        <div className="empty-state">
          <h3>{savedOnly ? "No saved updates here" : "No updates match yet"}</h3>
          {savedOnly ? <p>Use the bookmark on an update to keep it here. Saved updates that do not match your current filters are hidden.</p> : <p>No collected or reviewed updates match these filters. This does not mean nothing has changed — check the original sources, try again later, or adjust your filters.</p>}
        </div>
      )}

      {!loading && !error && ranked.length > 0 && (
        <>
          <section className="top-stories-section"><div className="section-heading"><div><span className="eyebrow">Quick briefing</span><h2>Top stories</h2></div></div><TopStoriesReader items={balanced.slice(0, 6)} savedIds={savedIds} onToggleSave={onToggleSave} profile={profile} /></section>
          <NewsArchive items={balanced} totalCount={ranked.length} seen={zeroCostMode ? seen : undefined} profile={profile} savedIds={savedIds} onToggleSave={onToggleSave} onLoadMore={() => hasCappedStories ? setShowAllSources(true) : onLoadMore?.()} hasMore={hasCappedStories || hasMore} loadMoreLabel={hasCappedStories ? `Show all ${ranked.length} stories` : undefined} />
        </>
      )}

      <Disclaimer compact />
    </div>
  );
}
