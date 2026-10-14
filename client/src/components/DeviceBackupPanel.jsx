import React, { useState } from "react";
import { Download, ShieldAlert, Upload } from "lucide-react";
import { applyDeviceRestore, createDeviceBackup, planDeviceRestore, readDeviceData } from "../lib/device-backup";
import { downloadText } from "../lib/download";

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ""));
  reader.onerror = () => reject(new Error("This file could not be read."));
  reader.readAsText(file);
});

export default function DeviceBackupPanel({ uid, storage = globalThis.localStorage, download = downloadText, now = new Date() }) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const exportBackup = () => {
    try {
      const archive = createDeviceBackup({ uid, data: readDeviceData(storage, uid, now), now });
      download(`globeready-device-backup-${archive.exportedAt.slice(0, 10)}.json`, `${JSON.stringify(archive, null, 2)}\n`, "application/json;charset=utf-8");
      setError("");
    } catch (caught) { setError(caught.message); }
  };

  const choose = async (event) => {
    setDone(false); setPlan(null); setError("");
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) { setError("This file is larger than the 1 MB device-backup limit."); return; }
    try {
      const next = planDeviceRestore(await readFile(file), { uid, now });
      if (!next.ok) setError(next.error);
      else setPlan(next);
    } catch (caught) { setError(caught.message || "This file could not be read."); }
  };

  const restore = () => {
    try {
      applyDeviceRestore(plan, storage, uid);
      setPlan(null); setDone(true); setError("");
    } catch (caught) { setError(caught.message); }
  };

  return <section className="panel settings-section" aria-labelledby="device-backup-title">
    <div className="panel-title"><h2 id="device-backup-title">Back up data stored on this device</h2></div>
    <p className="muted">This separate backup covers the private browser-only tools that are not included in your account export. It never uploads the file.</p>
    <p className="notice"><ShieldAlert size={16} aria-hidden="true" /> The JSON file may contain medical, insurance, financial and private notes. It is not encrypted, so keep it somewhere safe.</p>
    <div className="button-row">
      <button className="button secondary" type="button" onClick={exportBackup}><Download size={16} aria-hidden="true" /> Download device backup</button>
      <label className="button secondary" htmlFor="device-backup-file"><Upload size={16} aria-hidden="true" /> Choose a device backup</label>
      <input id="device-backup-file" className="visually-hidden" type="file" accept="application/json,.json" onChange={choose} />
    </div>
    {error && <p className="inline-error" role="alert"><ShieldAlert size={14} aria-hidden="true" /> {error}</p>}
    {done && <p className="success-text" role="status">Your supported browser-only data was restored on this device.</p>}
    {plan && <div className="sub-panel">
      <h3>{plan.sections.length} device-data sections are ready</h3>
      <p><strong>Existing browser data in these sections will be replaced.</strong> Your account data and other browser settings will not be changed.</p>
      <ul>{plan.sections.map((section) => <li key={section.id}>{section.label}: {section.count}</li>)}</ul>
      <div className="button-row">
        <button className="button" type="button" onClick={restore}>Replace device data</button>
        <button className="button secondary" type="button" onClick={() => setPlan(null)}>Cancel</button>
      </div>
    </div>}
  </section>;
}
