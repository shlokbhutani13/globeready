import React, { useState } from "react";
import { Trash2 } from "lucide-react";

// Extra controls for the reviewed feed: topic and visa, three yes/no narrowing options, and saved searches that stay on this device.
export default function NewsDiscovery({ options, filters, onFilter, flags, onFlag, searches, onSave, onApply, onRemove, onMarkAllSeen, unreadCount }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const submit = (event) => {
    event.preventDefault();
    setError(""); setSaved("");
    try { onSave(name); setName(""); setSaved("Search saved on this device."); } catch (reason) { setError(reason.message); }
  };
  return (
    <section className="panel news-discovery" aria-label="Find updates">
      <div className="form-grid">
        <label className="field">Topic<select value={filters.topic || ""} onChange={(event) => onFilter({ topic: event.target.value || undefined })}><option value="">All topics</option>{options.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.label}</option>)}</select></label>
        <label className="field">Visa<select value={filters.visaType || ""} onChange={(event) => onFilter({ visaType: event.target.value || undefined })}><option value="">Any visa</option>{options.visas.map((visa) => <option key={visa.id} value={visa.id}>{visa.label}</option>)}</select></label>
      </div>
      <div className="check-group">
        <label className="check-row"><input type="checkbox" checked={Boolean(flags.matchesProfile)} onChange={(event) => onFlag("matchesProfile", event.target.checked)} /> May be relevant to my profile</label>
        <label className="check-row"><input type="checkbox" checked={Boolean(flags.hasEffectiveDate)} onChange={(event) => onFlag("hasEffectiveDate", event.target.checked)} /> Has an upcoming effective date</label>
        <label className="check-row"><input type="checkbox" checked={Boolean(flags.unreadOnly)} onChange={(event) => onFlag("unreadOnly", event.target.checked)} /> New or changed since I last looked ({unreadCount})</label>
      </div>
      <p className="muted">“Relevant” compares an update’s tags with your profile and is not a decision about you. An effective date is the date in the reviewed record, not a deadline for you.</p>
      <div className="form-actions">
        <button type="button" className="button secondary" onClick={onMarkAllSeen} disabled={unreadCount === 0}>Mark all as seen</button>
      </div>
      <form className="saved-search-form" onSubmit={submit} aria-label="Save this search">
        <label className="field">Save this search as<input value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setError(""); setSaved(""); }} placeholder="Optional name" /></label>
        <button type="submit" className="button secondary">Save search</button>
      </form>
      {error && <p className="inline-notice error" role="alert">{error}</p>}
      {saved && <p className="inline-notice success" role="status">{saved}</p>}
      {searches.length > 0 && (
        <ul className="chip-row saved-searches" aria-label="Saved searches">
          {searches.map((entry) => (
            <li key={entry.id}>
              <button type="button" className="chip" onClick={() => onApply(entry)}>{entry.name}</button>
              <button type="button" className="icon-button" aria-label={`Remove saved search ${entry.name}`} onClick={() => onRemove(entry.id)}><Trash2 size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
