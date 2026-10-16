import React from "react";
import { relevanceFor } from "../lib/relevance";

// "May be relevant" label with the matching fields spelled out. Informational only; never says an update applies.
export default function RelevanceNote({ item, profile, explain = false }) {
  if (item?.autoIngested) return null;
  const relevance = relevanceFor(item, profile);
  if (!relevance) return null;
  return (
    <div className="relevance">
      <span className="chip relevance-chip">{relevance.label}</span>
      {explain ? <p className="relevance-note">{relevance.explanation}</p> : <p className="relevance-note">Matched on {relevance.matches.map((match) => match.label).join(", ")}.</p>}
    </div>
  );
}
