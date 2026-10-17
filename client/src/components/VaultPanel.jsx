import React, { useRef, useState } from "react";
import { Download, HardDriveUpload, ShieldAlert, Trash2 } from "lucide-react";
import * as drive from "../lib/drive-vault";

const sizeLabel = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function VaultPanel({ api = drive, configured = drive.vaultConfigured(), save = (blob, name) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } }) {
  const [token, setToken] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const input = useRef(null);
  if (!configured) return null;

  const run = async (work) => {
    setBusy(true); setError(""); setNote("");
    try { await work(); } catch (caught) { setError(caught.message || "Something went wrong."); }
    setBusy(false);
  };
  const connect = () => run(async () => { const next = await api.requestDriveAccess(); setToken(next); setFiles(await api.listVault(next)); });
  const choose = (event) => run(async () => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const problem = api.validateVaultFile(file, files.length);
    if (problem) throw new Error(problem);
    await api.uploadToVault(token, file);
    setFiles(await api.listVault(token));
    setNote("Saved to your Google Drive vault.");
  });
  const download = (file) => run(async () => save(await api.downloadFromVault(token, file.id), file.name));
  const remove = (file) => run(async () => {
    if (!globalThis.confirm?.(`Delete ${file.name} from your Google Drive vault? This cannot be undone.`)) return;
    await api.deleteFromVault(token, file.id);
    setFiles(await api.listVault(token));
  });

  return <section className="panel settings-section" aria-labelledby="vault-title">
    <div className="panel-title"><h2 id="vault-title">Original-file vault (your Google Drive)</h2></div>
    <p className="muted">Keep the original PDF or photo of a document in a hidden folder in your own Google Drive that only GlobeReady can open. It does not appear in the Drive website, GlobeReady’s servers never receive the files, and you can remove access at any time at myaccount.google.com/permissions. GlobeReady asks Google only for access to that one hidden folder.</p>
    <p className="notice"><ShieldAlert size={16} aria-hidden="true" /> These files are not encrypted by GlobeReady. Anyone who controls your Google account can open them, so protect that account with two-step verification.</p>
    {error && <p className="inline-error" role="alert"><ShieldAlert size={14} aria-hidden="true" /> {error}</p>}
    {note && <p className="success-text" role="status">{note}</p>}
    {!token
      ? <button className="button secondary" type="button" disabled={busy} onClick={connect}>Connect Google Drive</button>
      : <>
        <div className="button-row">
          <button className="button secondary" type="button" disabled={busy} onClick={() => input.current?.click()}><HardDriveUpload size={16} aria-hidden="true" /> Add a file</button>
          <input ref={input} className="visually-hidden" type="file" accept="application/pdf,image/png,image/jpeg" aria-label="Choose a file for the vault" onChange={choose} />
        </div>
        {files.length === 0 ? <p className="muted">The vault is empty.</p> : <ul className="plain-list">
          {files.map((file) => <li key={file.id}>
            <span>{file.name} · {sizeLabel(file.size)}</span>
            <button className="button secondary" type="button" disabled={busy} onClick={() => download(file)} aria-label={`Download ${file.name}`}><Download size={14} aria-hidden="true" /></button>
            <button className="button secondary" type="button" disabled={busy} onClick={() => remove(file)} aria-label={`Delete ${file.name}`}><Trash2 size={14} aria-hidden="true" /></button>
          </li>)}
        </ul>}
      </>}
  </section>;
}
