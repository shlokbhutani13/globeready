import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchNewsItem } from "../lib/news-data";
import { newsImageFor } from "../lib/news-images";
import Disclaimer from "../components/Disclaimer";
import NewsExplanation from "../components/NewsExplanation";

export default function NewsDetailPage({ item: supplied, items = [], explanation, localMode = false }) {
  const { id } = useParams();
  const [item, setItem] = useState(supplied || items.find((entry) => entry.id === id) || null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (item || !id || localMode) return;
    fetchNewsItem(id).then(setItem).catch((reason) => setError(reason.message || "Could not load this update."));
  }, [id, item, localMode]);
  if (error) return <div className="page"><div className="inline-error" role="alert">{error}</div><Link to="/news">Back to all news</Link></div>;
  if (!item) return <div className="page"><div className="empty-state">{localMode ? "This update is not in the current reviewed snapshot." : "Loading verified update…"}</div></div>;
  const image = newsImageFor(item);
  return <article className="page news-detail">
    <Link className="back-link" to="/news"><ArrowLeft size={16} /> All news</Link>
    <img className="news-detail-image" src={image.url} alt={image.alt} />
    <header><span className="eyebrow">{item.publisher || "Official source"}</span><h1>{item.title}</h1><div className="news-card-meta">{item.publishedAt && <span>Published {item.publishedAt}</span>}{item.verifiedAt && <span>Verified {item.verifiedAt}</span>}</div></header>
    {(item.shortSummary || item.excerpt || item.sourceExcerpt) && <p className="news-detail-lead">{item.shortSummary || item.excerpt || item.sourceExcerpt}</p>}
    {item.whyItMatters && <section className="news-detail-callout"><h2>Why this matters</h2><p>{item.whyItMatters}</p></section>}
    {(item.detailSections || []).map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
    {explanation || (localMode ? <section className="news-detail-callout"><h2>Need help understanding this?</h2><p>Cloud AI explanation is unavailable in the free public beta. Read the official source and ask your designated school official about your situation.</p></section> : <NewsExplanation itemId={item.id} />)}
    {item.canonicalUrl && <a className="button secondary official-link" href={item.canonicalUrl} target="_blank" rel="noreferrer">Read the official source <ExternalLink size={15} /></a>}
    <Disclaimer compact />
  </article>;
}
