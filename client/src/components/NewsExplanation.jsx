import React, { useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { explainNewsItem } from "../lib/news-data";

export default function NewsExplanation({ itemId, explain = explainNewsItem }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = async () => {
    setLoading(true); setError("");
    try { setResult(await explain(itemId)); } catch (reason) { setError(reason.message || "AI explanation is temporarily unavailable."); } finally { setLoading(false); }
  };
  return <section className="news-explanation">
    <div><span className="eyebrow">Need a simpler version?</span><h2>AI explanation</h2><p>GlobeReady explains only the verified story shown above and links back to its official source.</p></div>
    {!result && <button className="button primary" disabled={loading} onClick={request}><Sparkles size={16} /> {loading ? "Explaining…" : "Explain with AI"}</button>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    {result && <div className="explanation-result"><p>{result.answer}</p>{result.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} <ExternalLink size={13} /></a>)}<small>{result.disclaimer}</small></div>}
  </section>;
}
