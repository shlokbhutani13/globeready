import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ListPlus, Pencil, Trash2, X } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import CopyButton from "../components/ui/CopyButton";
import { caseKindLabel, caseKinds, caseStatusLabel, caseStatuses, caseSummary, entryTypeLabel, entryTypes, maxCases } from "../lib/cases";
import { localDateKey } from "../lib/reminders";
import { tasksLinkedTo } from "../lib/links";
import { friendlyError } from "../lib/friendly-error";

const officialStatusUrl = "https://egov.uscis.gov/casestatus/landing.do";
const blankCase = { title: "", kind: "opt-ead", formNumber: "", receiptNumber: "", filedOn: "", status: "preparing", notes: "" };

function CaseForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setBusy(true);
    try { await onSubmit(form); } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="case-form" aria-label={submitLabel}>
      <div className="form-grid">
        <label className="field">Case name<input required maxLength={120} value={form.title} onChange={set("title")} placeholder="Post-completion OPT" /></label>
        <label className="field">Kind of case<select value={form.kind} onChange={set("kind")}>{caseKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
        <label className="field">Form number (optional)<input maxLength={40} value={form.formNumber} onChange={set("formNumber")} placeholder="I-765" /></label>
        <label className="field">Receipt number (optional)<input maxLength={40} value={form.receiptNumber} onChange={set("receiptNumber")} autoComplete="off" /></label>
        <label className="field">Date filed (optional)<input type="date" value={form.filedOn} onChange={set("filedOn")} /></label>
        <label className="field">Status you are tracking<select value={form.status} onChange={set("status")}>{caseStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
      </div>
      <label className="field">Notes (private)<textarea maxLength={1000} value={form.notes} onChange={set("notes")} placeholder="Attorney or DSO contact, what you mailed, tracking number" /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions">
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
        {onCancel && <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function EntryForm({ record, onAdd, onClose, today }) {
  const [form, setForm] = useState({ date: today, type: "status", status: record.status, text: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setBusy(true);
    try { await onAdd(record, form); onClose(); } catch (reason) { setError(friendlyError(reason)); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="case-form" aria-label={`Add an update to ${record.title}`}>
      <div className="form-grid">
        <label className="field">What happened<select value={form.type} onChange={set("type")}>{entryTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        <label className="field">Date<input type="date" required value={form.date} onChange={set("date")} /><span className="hint">For appointments and response deadlines, use the date they happen or are due.</span></label>
        {form.type === "status" && <label className="field">New status<select value={form.status} onChange={set("status")}>{caseStatuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>}
      </div>
      <label className="field">Details{form.type === "note" ? "" : " (optional)"}<textarea maxLength={300} value={form.text} onChange={set("text")} placeholder="Time, location, what to bring" /></label>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions">
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save update"}</button>
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export default function CasesPage({ cases = [], tasks = [], onCreate, onUpdate, onAddEntry, onRemoveEntry, onRemove, onAddTasks, now = new Date() }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [entryFor, setEntryFor] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const today = localDateKey(now);
  const ordered = useMemo(() => [...cases].sort((left, right) => Number(caseSummary(right, now).open) - Number(caseSummary(left, now).open) || String(left.title).localeCompare(String(right.title))), [cases, now]);
  const run = async (action, success) => {
    setError(""); setMessage("");
    try { await action(); if (success) setMessage(success); } catch (reason) { setError(friendlyError(reason)); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Application and case tracker" description="Keep your forms, receipts, appointments and evidence requests in one private place, with the dates that matter." action={!adding && <button type="button" className="button primary" onClick={() => setAdding(true)}>Add a case</button>} />
      <SubNav label="Plan sections" links={planLinks} />
      <Notice tone="info">You enter every update yourself. GlobeReady does not contact USCIS or any agency, so the status shown here is only what you last entered and may be out of date. <a href={officialStatusUrl} target="_blank" rel="noreferrer">Check your official case status <ExternalLink size={13} aria-hidden="true" /></a></Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      {adding && (
        <section className="panel" aria-labelledby="new-case-title">
          <div className="panel-title"><h2 id="new-case-title">Add a case</h2></div>
          <CaseForm initial={blankCase} submitLabel="Add case" onCancel={() => setAdding(false)} onSubmit={async (form) => { await onCreate(form, cases.length); setAdding(false); setMessage("Case added. Add updates as things happen."); }} />
        </section>
      )}

      {ordered.length === 0 && !adding ? (
        <EmptyState title="No cases yet" action={<button type="button" className="button primary" onClick={() => setAdding(true)}>Add a case</button>}>
          Track an OPT application, a change of status, or any form you have filed. You can hold up to {maxCases}.
        </EmptyState>
      ) : (
        <ul className="record-list" aria-label="Your cases">
          {ordered.map((record) => {
            const summary = caseSummary(record, now);
            const linked = tasksLinkedTo(tasks, "case", record.id);
            if (editingId === record.id) {
              return (
                <li className="record case-record" key={record.id}>
                  <CaseForm initial={{ title: record.title, kind: record.kind, formNumber: record.formNumber || "", receiptNumber: record.receiptNumber || "", filedOn: record.filedOn || "", status: record.status, notes: record.notes || "" }}
                    submitLabel="Save changes" onCancel={() => setEditingId("")}
                    onSubmit={async (form) => { await onUpdate(record, { ...form, timeline: record.timeline }); setEditingId(""); setMessage("Case updated."); }} />
                </li>
              );
            }
            return (
              <li className="record case-record" key={record.id}>
                <div>
                  <div className="chip-row"><span className="chip">{caseKindLabel(record.kind)}</span><span className={`chip case-status ${summary.open ? "open" : "closed"}`}>{caseStatusLabel(record.status)}</span></div>
                  <h2 className="record-title">{record.title}</h2>
                  <div className="record-meta">
                    {record.formNumber && <span>Form {record.formNumber}</span>}
                    {record.filedOn && <span>Filed {record.filedOn}</span>}
                    {record.receiptNumber && <span>Receipt {record.receiptNumber} <CopyButton value={record.receiptNumber} label={`${record.title} receipt number`} /></span>}
                  </div>
                  <p className="record-meta">
                    {summary.lastEntry ? <span>Last update you entered: {entryTypeLabel(summary.lastEntry.type).toLowerCase()} on {summary.lastEntry.date}</span> : <span>No updates entered yet</span>}
                    {summary.next && <span><strong>Next:</strong> {summary.next.entry.label.split(": ")[1]} on {summary.next.entry.date} ({summary.next.days === 0 ? "today" : summary.next.days === 1 ? "tomorrow" : `in ${summary.next.days} days`})</span>}
                  </p>
                  {record.notes && <p className="task-notes">{record.notes}</p>}
                  {linked.length > 0 && (
                    <ul className="chip-row" aria-label={`Tasks for ${record.title}`}>
                      {linked.map((task) => <li key={task.id}><Link className="chip" to="/tasks">{task.completed ? "Done: " : "Task: "}{task.title}</Link></li>)}
                    </ul>
                  )}
                  {(record.timeline || []).length > 0 && (
                    <details className="case-history">
                      <summary>History ({record.timeline.length})</summary>
                      <ol aria-label={`History of ${record.title}`}>
                        {record.timeline.map((entry, index) => (
                          <li key={`${entry.date}-${entry.type}-${index}`}>
                            <span><strong>{entry.date}</strong> · {entryTypeLabel(entry.type)}{entry.status ? `: ${caseStatusLabel(entry.status)}` : ""}{entry.text ? ` — ${entry.text}` : ""}</span>
                            <button type="button" className="icon-button" aria-label={`Remove the ${entryTypeLabel(entry.type).toLowerCase()} entry from ${entry.date}`} onClick={() => run(() => onRemoveEntry(record, index))}><X size={14} aria-hidden="true" /></button>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {entryFor === record.id && <EntryForm record={record} today={today} onAdd={async (target, entry) => { await onAddEntry(target, entry); setMessage("Update saved."); }} onClose={() => setEntryFor("")} />}
                </div>
                <div className="record-actions">
                  <button type="button" className="button secondary" onClick={() => setEntryFor(entryFor === record.id ? "" : record.id)}>Add an update</button>
                  {onAddTasks && <button type="button" className="button secondary" aria-label={`Add a follow-up task for ${record.title}`} onClick={() => run(async () => { const created = await onAddTasks([{ title: `Follow up: ${record.title}`.slice(0, 200), category: "Cases", priority: "medium", links: [{ type: "case", id: record.id }] }]); if (created === 0) throw new Error("That follow-up task is already in your list."); }, "Follow-up task added.")}><ListPlus size={15} aria-hidden="true" /> Add task</button>}
                  <button type="button" className="button secondary" aria-label={`Edit ${record.title}`} onClick={() => setEditingId(record.id)}><Pencil size={15} aria-hidden="true" /> Edit</button>
                  <button type="button" className="button secondary" aria-label={`Delete ${record.title}`} onClick={() => run(() => onRemove(record.id), "Case deleted.")}><Trash2 size={15} aria-hidden="true" /> Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
