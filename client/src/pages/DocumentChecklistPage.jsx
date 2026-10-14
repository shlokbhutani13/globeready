import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { lifeLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import Disclaimer from "../components/Disclaimer";
import { addCustomDocument, documentRows, limits, loadReadiness, readinessSummary, removeCustomDocument, saveReadiness, setMark, statusChoices } from "../lib/document-readiness";
import { friendlyError } from "../lib/friendly-error";

const dateLine = (row) => {
  if (!row.date) return null;
  const source = row.dateSource === "key-dates" ? "from your Key dates" : "typed by you";
  const when = row.days < 0 ? `${-row.days} day${row.days === -1 ? "" : "s"} ago` : row.days === 0 ? "today" : `in ${row.days} day${row.days === 1 ? "" : "s"}`;
  return `Date you entered: ${row.date} (${when}), ${source}. Check the document itself.`;
};

export default function DocumentChecklistPage({ keyDates = [], storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage, now = new Date() }) {
  const [state, setState] = useState(() => loadReadiness(storage, storageScope));
  const [error, setError] = useState("");
  const [custom, setCustom] = useState("");
  const rows = useMemo(() => documentRows(state, keyDates, now), [state, keyDates, now]);
  const summary = readinessSummary(rows);
  const groups = [...new Set(rows.map((row) => row.group))];

  const commit = (compute) => {
    setError("");
    try { setState(saveReadiness(storage, storageScope, compute())); return true; } catch (reason) { setError(friendlyError(reason)); return false; }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Documents checklist" description="Keep track of which important documents you have, are missing, or want to look at again." />
      <SubNav label="Life sections" links={lifeLinks} />
      <PageHelp id="docReadiness" />
      <Notice tone="info">This list only records what you tell it. GlobeReady does not read, upload or check your documents, and cannot say whether any of them is valid. Saved in this browser only. To read a document’s text on this device, use <Link to="/documents">Documents</Link>.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <p className="progress-line" role="status">{summary.have} of {summary.total} marked as have · {summary.missing} missing · {summary.review} to review{summary.dateSoon ? ` · ${summary.dateSoon} with a date coming up or passed` : ""}</p>

      {groups.map((group, index) => (
        <section className="section-block" key={group} aria-labelledby={`docgroup-${index}`}>
          <h2 id={`docgroup-${index}`}>{group}</h2>
          <ul className="record-list" aria-label={group}>
            {rows.filter((row) => row.group === group).map((row) => (
              <li className="record doc-row" key={row.id}>
                <div>
                  <h3>{row.label}</h3>
                  <fieldset className="status-choice">
                    <legend className="sr-only">Status of {row.label}</legend>
                    {statusChoices.map((choice) => (
                      <label key={choice.id} className={`chip choice ${row.status === choice.id ? "active" : ""}`}>
                        <input type="radio" name={`status-${row.id}`} checked={row.status === choice.id} onChange={() => commit(() => setMark(state, row.id, { status: choice.id }))} /> {choice.label}
                      </label>
                    ))}
                    {row.status && <button type="button" className="button secondary" onClick={() => commit(() => setMark(state, row.id, { status: "" }))} aria-label={`Clear status of ${row.label}`}>Clear</button>}
                  </fieldset>
                  {dateLine(row) && <p className={`muted date-note ${row.dateState}`}>{dateLine(row)}{row.dateState === "soon" ? " It is coming up." : row.dateState === "past" ? " That date has passed." : ""}</p>}
                  {row.hasKeyDateKind && !row.date && <p className="muted">No date entered. <Link to="/dates">Add one in Key dates</Link> to be reminded.</p>}
                  {row.ownExpiry && row.dateSource !== "key-dates" && (
                    <label className="field">Expiry date (optional)<input type="date" value={state.marks[row.id]?.expiry || ""} onChange={(event) => commit(() => setMark(state, row.id, { expiry: event.target.value }))} /></label>
                  )}
                  <label className="field">Note (optional)
                    <input maxLength={limits.note} defaultValue={row.note} aria-label={`Note for ${row.label}`} placeholder="For example, where it is kept" onBlur={(event) => { if (event.target.value.trim() !== row.note) commit(() => setMark(state, row.id, { note: event.target.value })); }} />
                  </label>
                </div>
                {row.custom && <div className="record-actions"><button type="button" className="button secondary" aria-label={`Remove ${row.label}`} onClick={() => commit(() => removeCustomDocument(state, row.id))}><Trash2 size={15} aria-hidden="true" /> Remove</button></div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted">Notes are not a place for passport, visa or ID numbers.</p>

      <form className="panel" aria-label="Add a document" onSubmit={(event) => { event.preventDefault(); if (commit(() => addCustomDocument(state, custom))) setCustom(""); }}>
        <label className="field">Add a document of your own<input value={custom} maxLength={limits.label} onChange={(event) => setCustom(event.target.value)} placeholder="Vaccination card" /></label>
        <div className="form-actions"><button className="button secondary">Add document</button></div>
      </form>
      <Disclaimer />
    </div>
  );
}
