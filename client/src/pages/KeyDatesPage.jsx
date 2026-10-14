import React, { useState } from "react";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import { friendlyError } from "../lib/friendly-error";
import { keyDateKinds, keyDateStatus, kindLabel } from "../lib/key-dates";

const blank = { label: "", kind: "passport", date: "", remindDays: "30", notes: "" };

export default function KeyDatesPage({ dates = [], onCreate, onUpdate, onRemove, onExportCalendar, now = new Date() }) {
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const set = (name) => (event) => { setSaved(""); setForm({ ...form, [name]: event.target.value }); };
  const sorted = [...dates].sort((left, right) => String(left.date).localeCompare(String(right.date)));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaved("");
    setBusy(true);
    try {
      const input = { ...form, remindDays: Number(form.remindDays) };
      if (editing) await onUpdate(editing, input);
      else await onCreate(input);
      setSaved(editing ? "Date updated." : "Date saved.");
      setForm(blank);
      setEditing(null);
    } catch (reason) {
      // The form keeps what was typed so a fixable mistake or a dropped connection costs nothing.
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  };
  const edit = (entry) => {
    setEditing(entry);
    setError("");
    setSaved("");
    setForm({ label: entry.label, kind: entry.kind, date: entry.date, remindDays: String(entry.remindDays ?? 30), notes: entry.notes || "" });
  };
  const remove = async (entry) => {
    setError("");
    try { await onRemove(entry.id); if (editing?.id === entry.id) { setEditing(null); setForm(blank); } } catch (reason) { setError(friendlyError(reason)); }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Plan"
        title="Key dates"
        description="Type in the dates from your own documents, such as your passport, visa and I-20. GlobeReady reminds you before they arrive. It never reads dates from documents for you."
        action={onExportCalendar && <button type="button" className="button secondary" onClick={onExportCalendar}><CalendarPlus size={16} aria-hidden="true" /> Download calendar (.ics)</button>}
      />
      <SubNav label="Plan sections" links={planLinks} />

      <form className="panel" onSubmit={submit} aria-labelledby="date-form-title">
        <div className="panel-title"><h2 id="date-form-title">{editing ? "Edit date" : "Add a date"}</h2></div>
        <div className="form-grid">
          <label className="field">Label<input required maxLength={120} value={form.label} onChange={set("label")} placeholder="Passport expires" /></label>
          <label className="field">Type<select value={form.kind} onChange={set("kind")}>{keyDateKinds.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}</select></label>
          <label className="field">Date<input required type="date" value={form.date} onChange={set("date")} /></label>
          <label className="field">Remind me this many days before<input type="number" min="0" max="365" inputMode="numeric" value={form.remindDays} onChange={set("remindDays")} /></label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>Notes (optional)<textarea maxLength={500} value={form.notes} onChange={set("notes")} /></label>
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
        <div className="form-actions">
          <button className="button primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add date"}</button>
          {editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}
        </div>
      </form>

      {sorted.length === 0 ? (
        <EmptyState title="No key dates yet">Add the dates you do not want to miss. Reminders appear on Home and in Reminders while GlobeReady is open.</EmptyState>
      ) : (
        <ul className="record-list" aria-label="Your key dates">
          {sorted.map((entry) => {
            const status = keyDateStatus(entry, now);
            return (
              <li className="record" key={entry.id}>
                <div>
                  <h3>{entry.label}</h3>
                  <div className="record-meta">
                    <span>{kindLabel(entry.kind)}</span>
                    <time dateTime={entry.date}>{entry.date}</time>
                    {status && <span className={`due-status ${status.kind}`}>{status.label}</span>}
                    <span>Reminder {entry.remindDays} days before</span>
                  </div>
                  {entry.notes && <p className="muted">{entry.notes}</p>}
                </div>
                <div className="record-actions">
                  <button type="button" className="button secondary" aria-label={`Edit ${entry.label}`} onClick={() => edit(entry)}><Pencil size={15} aria-hidden="true" /> Edit</button>
                  <button type="button" className="button secondary" aria-label={`Delete ${entry.label}`} onClick={() => remove(entry)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
