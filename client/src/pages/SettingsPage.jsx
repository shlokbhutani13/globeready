import React, { useState } from "react";
import { Download, ShieldAlert, Trash2 } from "lucide-react";
import ConsentPanel from "../components/ConsentPanel";

export const deletionPhrase = "DELETE MY ACCOUNT";

export default function SettingsPage({ live = true, preferences = {}, onUpdatePreferences, onExport, onDelete, consent, onSaveConsent, onShowGettingStarted, zeroCostMode = false, signInProviders = [] }) {
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const passwordAccount = zeroCostMode && signInProviders.includes("password");
  const googleAccount = zeroCostMode && !passwordAccount && signInProviders.includes("google.com");
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
      await onDelete(zeroCostMode ? { password } : undefined);
    } catch (caught) {
      setError(caught.message);
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Account</span><h1>Settings</h1><p>Control your notifications, export your data, or delete your account.</p></div></header>

      {consent !== undefined && <ConsentPanel consent={consent} onSave={onSaveConsent} aiAvailable={!zeroCostMode} />}

      {zeroCostMode && <section className="panel settings-section" aria-labelledby="free-runtime-title"><div className="panel-title"><h2 id="free-runtime-title">Free public beta availability</h2></div><ul className="availability-list"><li>Original-file backup is unavailable; only extracted text is saved.</li><li>Cloud AI answers are unavailable; Ask GlobeReady returns matching passages from your documents.</li><li>Email and push delivery are unavailable; check the app and official sources for changes.</li></ul></section>}

      <section className="panel settings-section"><div className="panel-title"><h2>Help</h2></div><p className="muted">Reopen the short guide to Home, Updates, Documents, Guides, and Ask GlobeReady.</p><button className="button secondary" onClick={onShowGettingStarted}>Show getting started guide</button></section>

      {!zeroCostMode && <section className="panel settings-section">
        <div className="panel-title"><h2>Email and notifications</h2></div>
        <p className="muted">GlobeReady does not send email yet. Reminders appear in your notification inbox. Your email choices are saved so they apply once email delivery is available.</p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={Boolean(preferences.emailRemindersEnabled)}
            onChange={(event) => onUpdatePreferences({ emailRemindersEnabled: event.target.checked })}
          />
          Save my preference for email reminders (not sent yet)
        </label>
        <label className="settings-field">
          Digest frequency (saved, not sent yet)
          <select value={preferences.digestFrequency || "weekly"} onChange={(event) => onUpdatePreferences({ digestFrequency: event.target.value })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="off">Off</option>
          </select>
        </label>
      </section>}

      <section className="panel settings-section">
        <div className="panel-title"><h2>Your data</h2></div>
        <p className="muted">{zeroCostMode ? "Download your profile, tasks, saved resources, saved updates, and locally extracted document text as a JSON file. Original files are not stored." : "Download your profile, tasks, document text, saved updates, and assistant conversations as a JSON file."}</p>
        <button className="button secondary" onClick={onExport}><Download size={16} /> Export my data</button>
      </section>

      <section className="panel settings-section danger-zone">
        <div className="panel-title"><h2>Delete account</h2></div>
        <p className="muted">{zeroCostMode
          ? "This permanently removes your profile, tasks, saved resources, saved updates, extracted document text, and your sign-in. You confirm your identity first; nothing is deleted until that succeeds. This cannot be undone."
          : "This permanently removes your profile, documents and their extracted text, tasks, saved updates, notifications, and conversations. This cannot be undone."}</p>
        <label className="settings-field">
          Type {deletionPhrase} to confirm
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
        {passwordAccount && <label className="settings-field">
          Current password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
        </label>}
        {googleAccount && <p className="muted">A Google window will ask you to confirm your account before anything is deleted.</p>}
        {error && <p className="inline-error" role="alert"><ShieldAlert size={14} /> {error}</p>}
        <button className="button danger" disabled={confirmation !== deletionPhrase || busy || (passwordAccount && !password)} onClick={remove}>
          <Trash2 size={16} /> Delete my account
        </button>
      </section>
    </div>
  );
}
