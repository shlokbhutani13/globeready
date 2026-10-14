import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import CopyButton from "../components/ui/CopyButton";
import { friendlyError } from "../lib/friendly-error";

export const contactRoleLabels = {
  dso: "Designated school official (DSO)", "international-office": "University international office", "campus-safety": "Campus safety",
  insurance: "Health insurance", embassy: "Embassy or consulate", personal: "Trusted personal contact", other: "Other",
};
const blank = { name: "", role: "dso", phone: "", email: "", notes: "" };

export default function ContactsPage({ contacts = [], onCreate, onUpdate, onRemove }) {
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const set = (name) => (event) => { setSaved(""); setForm({ ...form, [name]: event.target.value }); };
  const sorted = [...contacts].sort((left, right) => Object.keys(contactRoleLabels).indexOf(left.role) - Object.keys(contactRoleLabels).indexOf(right.role) || String(left.name).localeCompare(String(right.name)));

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setSaved(""); setBusy(true);
    try {
      if (editing) await onUpdate(editing, form); else await onCreate(form, contacts.length);
      setSaved(editing ? "Contact updated." : "Contact saved.");
      setForm(blank); setEditing(null);
    } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  };
  const edit = (entry) => { setEditing(entry); setError(""); setSaved(""); setForm({ name: entry.name, role: entry.role, phone: entry.phone || "", email: entry.email || "", notes: entry.notes || "" }); };
  const remove = async (entry) => {
    setError("");
    try { await onRemove(entry.id); if (editing?.id === entry.id) { setEditing(null); setForm(blank); } } catch (reason) { setError(friendlyError(reason)); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Contacts" description="Keep your school, safety, insurance, consulate and trusted contacts in one private place. Only you can see them. Copy a number or email with one click." />
      <SubNav label="Plan sections" links={planLinks} />
      <PageHelp id="contacts" />

      <form className="panel" onSubmit={submit} aria-labelledby="contact-form-title">
        <div className="panel-title"><h2 id="contact-form-title">{editing ? "Edit contact" : "Add a contact"}</h2></div>
        <div className="form-grid">
          <label className="field">Name<input required maxLength={120} value={form.name} onChange={set("name")} autoComplete="off" /></label>
          <label className="field">Who they are<select value={form.role} onChange={set("role")}>{Object.entries(contactRoleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="field">Phone<input type="tel" maxLength={40} value={form.phone} onChange={set("phone")} autoComplete="off" /></label>
          <label className="field">Email<input type="email" maxLength={254} value={form.email} onChange={set("email")} autoComplete="off" /></label>
        </div>
        <label className="field" style={{ marginTop: 16 }}>Notes (optional)<textarea maxLength={500} value={form.notes} onChange={set("notes")} placeholder="Office hours, building, after-hours line" /></label>
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">{saved}</Notice>}
        <div className="form-actions">
          <button className="button primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add contact"}</button>
          {editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}
        </div>
      </form>

      {sorted.length === 0 ? (
        <EmptyState title="No contacts yet">Start with your DSO and your international office. In an emergency you will not need to search for them.</EmptyState>
      ) : (
        <ul className="record-list" aria-label="Your contacts">
          {sorted.map((entry) => (
            <li className="record" key={entry.id}>
              <div>
                <h3>{entry.name}</h3>
                <div className="record-meta"><span>{contactRoleLabels[entry.role] || "Contact"}</span></div>
                {entry.phone && <div className="record-meta"><a href={`tel:${entry.phone.replace(/[^+\d]/g, "")}`}>{entry.phone}</a><CopyButton value={entry.phone} label={`${entry.name}'s phone number`} /></div>}
                {entry.email && <div className="record-meta"><a href={`mailto:${entry.email}`}>{entry.email}</a><CopyButton value={entry.email} label={`${entry.name}'s email address`} /></div>}
                {entry.notes && <p className="muted">{entry.notes}</p>}
              </div>
              <div className="record-actions">
                <button type="button" className="button secondary" aria-label={`Edit ${entry.name}`} onClick={() => edit(entry)}><Pencil size={15} aria-hidden="true" /> Edit</button>
                <button type="button" className="button secondary" aria-label={`Delete ${entry.name}`} onClick={() => remove(entry)}><Trash2 size={15} aria-hidden="true" /> Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">For an emergency, call your local emergency number first. GlobeReady is not an emergency service.</p>
    </div>
  );
}
