import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";

// Shows the consent wording the server returned, and records the student's choice through onSave.
// The AI choice is only available once document reading is on, because AI answers read the same documents.
export default function ConsentPanel({ consent, onSave, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState(Boolean(consent?.documents));
  const [aiGeneration, setAiGeneration] = useState(Boolean(consent?.aiGeneration));

  if (!consent) {
    return <p className="muted">Checking your privacy choices…</p>;
  }

  const save = async (next) => {
    setBusy(true);
    setError("");
    try {
      await onSave(next);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`panel consent-panel${compact ? " compact" : ""}`} aria-label="Privacy choices">
      <div className="panel-title"><h2><ShieldCheck size={18} /> Your choices for documents and AI</h2></div>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={documents}
          disabled={busy}
          onChange={(event) => {
            setDocuments(event.target.checked);
            if (!event.target.checked) setAiGeneration(false);
            save({ documents: event.target.checked, aiGeneration: event.target.checked ? aiGeneration : false });
          }}
        />
        Allow GlobeReady to read my documents
      </label>
      <p className="muted">{consent.text?.documents}</p>
      <label className="settings-check">
        <input
          type="checkbox"
          checked={aiGeneration}
          disabled={busy || !documents}
          onChange={(event) => {
            setAiGeneration(event.target.checked);
            save({ documents: true, aiGeneration: event.target.checked });
          }}
        />
        Allow AI-written answers from my document passages
      </label>
      <p className="muted">{consent.text?.aiGeneration}</p>
      <p className="muted">{consent.text?.withdraw}</p>
      {consent.acceptedAt && <p className="muted">Last changed {new Date(consent.acceptedAt).toLocaleDateString()}.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </section>
  );
}
