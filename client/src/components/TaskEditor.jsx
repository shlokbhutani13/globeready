import React, { useState } from "react";
import { X } from "lucide-react";
import Notice from "./ui/Notice";
import { recurrenceLabels } from "../lib/recurrence";
import { friendlyError } from "../lib/friendly-error";
import { linkTypeLabels } from "../lib/links";

// Inline editor for one task. Values the student typed stay in the form if saving fails.
export default function TaskEditor({ task, linkItems = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    title: task.title || "", dueDate: task.dueDate || "", priority: task.priority || "medium", category: task.category && task.category !== "General" ? task.category : "",
    notes: task.notes || "", recurrence: task.recurrence || "none", remindOn: task.remindOn || "", links: Array.isArray(task.links) ? task.links : [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (name) => (event) => setForm({ ...form, [name]: event.target.value });
  const id = `edit-${task.id}`;

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setBusy(true);
    try {
      await onSave(task, { ...form, category: form.category.trim() || "General" });
      onCancel();
    } catch (reason) { setError(friendlyError(reason)); setBusy(false); }
  };

  return (
    <form className="task-editor" onSubmit={submit} aria-label={`Edit ${task.title}`}>
      <div className="form-grid">
        <label className="field">Task<input required maxLength={200} value={form.title} onChange={set("title")} /></label>
        <label className="field">Due date<input type="date" value={form.dueDate} onChange={set("dueDate")} /></label>
        <label className="field">Priority<select value={form.priority} onChange={set("priority")}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        <label className="field">Category<input maxLength={80} value={form.category} onChange={set("category")} placeholder="General" /></label>
        <label className="field">Repeat<select value={form.recurrence} onChange={set("recurrence")}>{Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          {form.recurrence !== "none" && <span className="hint">When you finish it, the next one is added automatically. Needs a due date.</span>}</label>
        <label className="field">Remind me on<input type="date" value={form.remindOn} onChange={set("remindOn")} /><span className="hint">Shows in your reminders while the app is open.</span></label>
      </div>
      <label className="field" htmlFor={`${id}-notes`}>Notes (private)<textarea id={`${id}-notes`} maxLength={1000} value={form.notes} onChange={set("notes")} placeholder="Receipt number, what to bring, who you spoke to" /></label>
      {form.links.length > 0 && (
        <div className="field">
          <span>Connected to</span>
          <ul className="chip-row" aria-label="Connected items">
            {form.links.map((link) => {
              const item = linkItems.find((entry) => entry.type === link.type && entry.id === link.id);
              return (
                <li key={`${link.type}:${link.id}`} className="chip">
                  {linkTypeLabels[link.type]}: {item?.label || link.id}
                  <button type="button" className="chip-remove" aria-label={`Remove connection to ${item?.label || link.id}`} onClick={() => setForm({ ...form, links: form.links.filter((other) => other !== link) })}><X size={13} aria-hidden="true" /></button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="form-actions">
        <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="button secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
