import React from "react";

export default function DigestSettings({ preferences = {}, digests = [], onChange }) {
  return <section className="panel digest-settings" aria-labelledby="digest-settings-title">
    <div className="panel-title"><h2 id="digest-settings-title">Update digest</h2></div>
    <label className="settings-field">Digest frequency
      <select value={preferences.digestFrequency || "weekly"} onChange={(event) => onChange?.({ digestFrequency: event.target.value })}>
        <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="off">Off</option>
      </select>
    </label>
    <p className="muted">Email delivery is not connected yet. Digests remain available here in GlobeReady.</p>
    {digests.length > 0 && <div className="digest-history"><strong>Recent digests</strong>{digests.slice(0, 5).map((digest) =>
      <small key={digest.id}>{digest.itemCount || 0} verified updates · {new Date(digest.generatedAt || digest.createdAt).toLocaleDateString()}</small>)}</div>}
  </section>;
}
