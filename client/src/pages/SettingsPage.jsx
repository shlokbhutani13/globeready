import React, { useState } from "react";
import { Download, ShieldAlert, Trash2 } from "lucide-react";

export const deletionPhrase = "DELETE MY ACCOUNT";

export default function SettingsPage({ live = true, preferences = {}, onUpdatePreferences, onExport, onDelete }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!live) {
    return (
      <div className="page">
        <header className="page-header"><div><span className="eyebrow">Account</span><h1>Settings</h1></div></header>
        <div className="empty-state"><p>Sign in with a GlobeReady account to manage your email settings, export your data, or delete your account.</p></div>
      </div>
    );
  }

  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await onDelete();
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Account</span><h1>Settings</h1><p>Control your notifications, export your data, or delete your account.</p></div></header>

      <section className="panel settings-section">
        <div className="panel-title"><h2>Email and notifications</h2></div>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={Boolean(preferences.emailRemindersEnabled)}
            onChange={(event) => onUpdatePreferences({ emailRemindersEnabled: event.target.checked })}
          />
          Email reminders for tasks and deadlines
        </label>
        <label className="settings-field">
          Digest frequency
          <select value={preferences.digestFrequency || "weekly"} onChange={(event) => onUpdatePreferences({ digestFrequency: event.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="off">Off</option>
          </select>
        </label>
      </section>

      <section className="panel settings-section">
        <div className="panel-title"><h2>Your data</h2></div>
        <p className="muted">Download your profile, tasks, document text, saved updates, and assistant conversations as a JSON file.</p>
        <button className="button secondary" onClick={onExport}><Download size={16} /> Export my data</button>
      </section>

      <section className="panel settings-section danger-zone">
        <div className="panel-title"><h2>Delete account</h2></div>
        <p className="muted">This permanently removes your profile, documents and their extracted text, tasks, saved updates, notifications, and conversations. This cannot be undone.</p>
        <label className="settings-field">
          Type {deletionPhrase} to confirm
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        {error && <p className="inline-error" role="alert"><ShieldAlert size={14} /> {error}</p>}
        <button className="button danger" disabled={confirmation !== deletionPhrase || busy} onClick={remove}>
          <Trash2 size={16} /> Delete my account
        </button>
      </section>
    </div>
  );
}
