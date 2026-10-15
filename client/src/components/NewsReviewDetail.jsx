import React, { useState } from "react";

const confirmationLabels = {
  source: "I checked the official source", title: "I checked the title", dates: "I checked every date",
  legalState: "I checked the legal state", tags: "I checked audience tags", imagePolicy: "I checked the image policy",
};

export default function NewsReviewDetail({ candidate, onDecision = async () => {} }) {
  const [confirmed, setConfirmed] = useState({});
  const [targetId, setTargetId] = useState("");
  const [note, setNote] = useState("");
  const [legalState, setLegalState] = useState("informational");
  const [message, setMessage] = useState({ tone: "", text: "" });
  if (!candidate) return null;
  const evidence = candidate.current || candidate.previous || {};
  const complete = Object.keys(confirmationLabels).every((key) => confirmed[key] === true);
  const record = {
    id: `${candidate.sourceId}-${evidence.externalId || candidate.id.slice(-12)}`, sourceId: candidate.sourceId,
    title: evidence.title, publisher: candidate.sourceId.toUpperCase(), canonicalUrl: evidence.canonicalUrl || candidate.canonicalUrl,
    publishedAt: evidence.publishedAt, updatedAt: evidence.updatedAt, effectiveAt: evidence.effectiveAt,
    sourceExcerpt: evidence.sourceExcerpt, sourceVerified: true, editorialState: "approved", documentType: "notice",
    legalState, topics: evidence.topics || [], visaTypes: evidence.visaTypes || [], urgency: "normal",
  };
  const act = async (decision) => {
    setMessage({ tone: "", text: "" });
    try { await onDecision(candidate, decision); setMessage({ tone: "success", text: "Decision saved." }); }
    catch (error) { setMessage({ tone: "error", text: error.message || "Decision could not be saved." }); }
  };
  const approval = (type) => ({ type, confirmations: Object.fromEntries(Object.keys(confirmationLabels).map((key) => [key, true])), record, reasonCode: type === "correct" ? "source-correction" : "verified-official-source", ...(type === "correct" ? { targetId, publicCorrectionNote: note } : {}) });
  return <section className="panel" aria-labelledby="candidate-detail-title">
    <div className="panel-title"><div><span className="eyebrow">{candidate.changeType}</span><h2 id="candidate-detail-title">Review evidence</h2></div></div>
    <p><a href={candidate.canonicalUrl} target="_blank" rel="noreferrer">Open official source</a></p>
    <p className="muted">Source health: {candidate.sourceHealth?.state || "not supplied"}</p>
    <div className="comparison-grid"><div><h3>Previous</h3><p>{candidate.previous?.title || "No previous record"}</p><small>{candidate.previous?.sourceExcerpt}</small></div><div><h3>Current</h3><p>{candidate.current?.title || "No current record"}</p><small>{candidate.current?.sourceExcerpt}</small></div></div>
    <p className="muted">Image provenance: topic illustration will be used because no reviewed official image is attached.</p>
    <label className="settings-field">Legal state<select value={legalState} onChange={(event) => setLegalState(event.target.value)}><option value="informational">Informational</option><option value="proposed">Proposed</option><option value="final">Final</option><option value="scheduled">Scheduled</option><option value="effective">Effective</option><option value="withdrawn">Withdrawn</option></select></label>
    <fieldset><legend>Approval checks</legend>{Object.entries(confirmationLabels).map(([key, label]) => <label className="settings-check" key={key}><input type="checkbox" checked={Boolean(confirmed[key])} onChange={(event) => setConfirmed((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</fieldset>
    <div className="button-row"><button className="button" disabled={!complete} onClick={() => act(approval("approve"))}>Approve candidate</button><button className="button secondary" onClick={() => act({ type: "reject", reasonCode: "needs-more-evidence", privateNote: "" })}>Reject candidate</button><button className="button secondary" onClick={() => act({ type: "defer", reasonCode: "needs-more-evidence", privateNote: "" })}>Defer candidate</button></div>
    <div className="form-grid"><label>Existing public item ID<input value={targetId} onChange={(event) => setTargetId(event.target.value)} /></label><label>Public correction note<textarea value={note} onChange={(event) => setNote(event.target.value)} /></label></div>
    <div className="button-row"><button className="button secondary" disabled={!complete || !targetId.trim() || !note.trim()} onClick={() => act(approval("correct"))}>Publish correction</button><button className="button secondary" disabled={!targetId.trim() || !note.trim()} onClick={() => act({ type: "archive", targetId, reasonCode: "source-withdrawn", publicCorrectionNote: note })}>Archive public item</button></div>
    {message.text && <p className={message.tone === "error" ? "inline-error" : "success-text"} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p>}
  </section>;
}
