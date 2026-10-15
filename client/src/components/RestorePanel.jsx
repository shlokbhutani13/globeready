import React, { useRef, useState } from "react";
import Notice from "./ui/Notice";
import { applyRestore, planRestore } from "../lib/restore";
import { friendlyError } from "../lib/friendly-error";

const sectionLabels = { tasks: "tasks", savedResources: "saved guides", savedNews: "saved updates", trackedDates: "key dates", contacts: "contacts", cases: "cases", planner: "checklist lists" };

// Import a GlobeReady export. The file is read in this browser, checked completely, previewed, and written only after
// the student confirms. Existing records are kept; duplicates are skipped.
export default function RestorePanel({ uid, existing, store }) {
  const input = useRef(null);
  const [plan, setPlan] = useState(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async (file) => {
    setPlan(null); setResult(""); setError(""); setProgress(null);
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const next = planRestore(text, { uid, existing });
      if (!next.ok) setError(next.error); else setPlan(next);
    } catch { setError("The file could not be read."); }
    if (input.current) input.current.value = "";
  };
  const confirm = async () => {
    setBusy(true); setError(""); setResult("");
    try {
      const done = await applyRestore(plan, store, { onProgress: setProgress });
      setResult(`Restored ${done.total} item${done.total === 1 ? "" : "s"}. Nothing was overwritten or deleted.`);
      setPlan(null);
    } catch (reason) { setError(reason.done !== undefined ? reason.message : friendlyError(reason)); } finally { setBusy(false); setProgress(null); }
  };

  return (
    <section className="panel settings-section" aria-labelledby="restore-title">
      <div className="panel-title"><h2 id="restore-title">Restore from a GlobeReady export</h2></div>
      <p className="muted">Choose a file you exported from this account. You will see exactly what would be added before anything is saved. Existing data is never replaced or deleted.</p>
      <input ref={input} id="restore-file" className="sr-only" type="file" accept="application/json,.json" onChange={(event) => choose(event.target.files?.[0])} />
      <label className="button secondary" htmlFor="restore-file" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.current?.click(); } }}>Choose export file…</label>
      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="success">{result}</Notice>}
      {plan && (
        <div className="restore-preview" role="region" aria-label="Restore preview">
          <h3>Preview of {fileName}</h3>
          {plan.nothingToRestore ? <p>Everything in this file is already in your account. Nothing would change.</p> : (
            <>
              <ul>
                {Object.entries(plan.counts).filter(([, count]) => count > 0).map(([key, count]) => <li key={key}>Add {count} {sectionLabels[key]}</li>)}
                {Object.keys(plan.profileFill).length > 0 && <li>Fill {Object.keys(plan.profileFill).length} empty profile field{Object.keys(plan.profileFill).length === 1 ? "" : "s"} (filled fields are kept)</li>}
              </ul>
              <p className="muted">About {plan.writes} saves, counted against the free daily limit.</p>
            </>
          )}
          {plan.duplicates > 0 && <p>{plan.duplicates} already in your account and skipped.</p>}
          {plan.capped.map((entry) => <Notice key={entry.section} tone="warning">{entry.skipped} {sectionLabels[entry.section]} would exceed the free beta's limit and will be skipped.</Notice>)}
          {plan.invalid.length > 0 && <Notice tone="warning">{plan.invalid.length} record{plan.invalid.length === 1 ? " is" : "s are"} invalid and will be skipped ({[...new Set(plan.invalid.map((entry) => sectionLabels[entry.section] || entry.section))].join(", ")}).</Notice>}
          {plan.notRestored.map((text) => <p className="muted" key={text}>Not restored: {text}</p>)}
          {progress && <p role="status">Restoring {progress.done} of {progress.total}…</p>}
          <div className="form-actions">
            {!plan.nothingToRestore && <button type="button" className="button primary" disabled={busy} onClick={confirm}>{busy ? "Restoring…" : `Restore ${plan.writes} saves`}</button>}
            <button type="button" className="button secondary" disabled={busy} onClick={() => setPlan(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
