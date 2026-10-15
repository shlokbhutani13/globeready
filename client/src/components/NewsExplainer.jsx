import React from "react";
import { explainNews } from "../lib/news-explainer";

export default function NewsExplainer({ item }) {
  const explained = explainNews(item);
  return (
    <section className="news-detail-callout news-explainer" aria-labelledby="explainer-title">
      <h2 id="explainer-title">Reading guide</h2>
      <p className="muted">Informational guidance. {explained.basis}</p>
      {explained.sections.map((entry) => (
        <div key={entry.heading}>
          <h3>{entry.heading}</h3>
          {entry.body.length > 1 ? <ul>{entry.body.map((line) => <li key={line}>{line}</li>)}</ul> : <p>{entry.body[0]}</p>}
        </div>
      ))}
    </section>
  );
}
