import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ListPlus } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { updatesLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import RelevanceNote from "../components/RelevanceNote";
import Disclaimer from "../components/Disclaimer";
import { effectiveLabel, filterRules, relatedRules, rulesFilters, rulesLibrary, supersessionChain } from "../data/rules-library";
import { friendlyError } from "../lib/friendly-error";

const kindLabel = Object.fromEntries(rulesFilters.kinds.map((kind) => [kind.id, kind.label]));
const statusLabel = { current: "Current rule", reference: "Ongoing reference", superseded: "Superseded" };
const blankFilters = { query: "", kind: "", status: "", visa: "", topic: "", hideSuperseded: false };

export default function RulesPage({ profile = {}, onAddTasks, initialFilters = {} }) {
  const [filters, setFilters] = useState({ ...blankFilters, ...initialFilters });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const shown = useMemo(() => filterRules(rulesLibrary, filters), [filters]);
  const filtered = Object.entries(filters).some(([key, value]) => value && value !== blankFilters[key]);
  const set = (name) => (event) => setFilters({ ...filters, [name]: name === "hideSuperseded" ? event.target.checked : event.target.value });

  const addTask = async (entry) => {
    setError(""); setMessage(""); setBusy(entry.id);
    try {
      const created = await onAddTasks([{ title: `Review: ${entry.title}`.slice(0, 200), category: "Rules and forms", priority: "medium", links: [{ type: "rule", id: entry.id }] }]);
      setMessage(created === 0 ? "That task is already in your list." : `Added a task to review “${entry.title}”.`);
    } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(""); }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Updates"
        title="Rules and forms"
        description="Official rules, regulations, forms and agency guidance for international students, each with its source, dates and what replaced it. Always open the official page for the current text."
      />
      <SubNav label="Updates sections" links={updatesLinks} />
      <Notice tone="info">GlobeReady links to official sources and does not copy form editions or fees. “Listed” means when we added the entry, not a legal review. Ask your designated school official about your own situation.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <form className="panel" role="search" aria-label="Search rules and forms" onSubmit={(event) => event.preventDefault()}>
        <div className="form-grid">
          <label className="field">Search<input type="search" value={filters.query} onChange={set("query")} placeholder="Try I-765, OPT, or SEVIS" autoComplete="off" /></label>
          <label className="field">Type<select value={filters.kind} onChange={set("kind")}><option value="">All types</option>{rulesFilters.kinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
          <label className="field">Status<select value={filters.status} onChange={set("status")}><option value="">Any status</option>{rulesFilters.statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label className="field">Visa<select value={filters.visa} onChange={set("visa")}><option value="">Any visa</option>{rulesFilters.visas.map((visa) => <option key={visa.id} value={visa.id}>{visa.label}</option>)}</select></label>
          <label className="field">Topic<select value={filters.topic} onChange={set("topic")}><option value="">All topics</option>{rulesFilters.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label>
        </div>
        <div className="form-actions">
          <label className="check-row"><input type="checkbox" checked={filters.hideSuperseded} onChange={set("hideSuperseded")} /> Hide superseded entries</label>
          {filtered && <button type="button" className="button secondary" onClick={() => setFilters(blankFilters)}>Clear filters</button>}
        </div>
      </form>

      <p className="muted" role="status">{shown.length} of {rulesLibrary.length} entries shown</p>

      {shown.length === 0 ? (
        <EmptyState title="Nothing matches those filters" action={<button type="button" className="button secondary" onClick={() => setFilters(blankFilters)}>Clear filters</button>}>
          Try fewer words, or search by form number such as I-20 or DS-160.
        </EmptyState>
      ) : (
        <ul className="record-list" aria-label="Rules and forms">
          {shown.map((entry) => {
            const chain = supersessionChain(entry.id);
            const replacement = entry.supersededBy && rulesLibrary.find((other) => other.id === entry.supersededBy);
            const replaces = (entry.supersedes || []).map((id) => rulesLibrary.find((other) => other.id === id)).filter(Boolean);
            const related = relatedRules(entry.id, 2);
            return (
              <li className="record rule-record" key={entry.id}>
                <div>
                  <div className="chip-row">
                    <span className="chip">{kindLabel[entry.kind]}</span>
                    <span className={`chip status-${entry.status}`}>{statusLabel[entry.status]}</span>
                  </div>
                  <h2 className="record-title">{entry.title}</h2>
                  <p>{entry.summary}</p>
                  <div className="record-meta">
                    <span>{entry.agency}</span>
                    {entry.citation && <span>{entry.citation}</span>}
                    {entry.publishedAt && <span>Published {entry.publishedAt}</span>}
                    <span>{effectiveLabel(entry)}</span>
                    <span>Listed {entry.listedOn}</span>
                  </div>
                  {replacement && <p className="supersession"><strong>Superseded by:</strong> {replacement.title}{entry.effectiveAt ? ` (from ${entry.effectiveAt})` : ""}.</p>}
                  {replaces.length > 0 && <p className="supersession"><strong>Replaces:</strong> {replaces.map((other) => other.title).join("; ")}.</p>}
                  {chain.length > 1 && <ol className="supersession-chain" aria-label="Replacement history">{chain.map((link) => <li key={link.id}>{link.title}{link.id === entry.id ? " (this entry)" : ""}</li>)}</ol>}
                  <RelevanceNote item={entry} profile={profile} />
                  {(entry.newsIds || []).length > 0 && <p className="record-meta"><Link to={`/news/${encodeURIComponent(entry.newsIds[0])}`}>Read the related update</Link></p>}
                  {related.length > 0 && <p className="record-meta">Related: {related.map((other) => other.title).join("; ")}</p>}
                </div>
                <div className="record-actions">
                  <a className="button secondary" href={entry.sourceUrl} target="_blank" rel="noreferrer">Official source <ExternalLink size={15} aria-hidden="true" /></a>
                  {onAddTasks && entry.status !== "superseded" && (
                    <button type="button" className="button secondary" disabled={busy === entry.id} onClick={() => addTask(entry)} aria-label={`Add a task to review ${entry.title}`}>
                      <ListPlus size={15} aria-hidden="true" /> {busy === entry.id ? "Adding…" : "Add as task"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Disclaimer />
    </div>
  );
}
