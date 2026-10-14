import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchNewsItem } from "../lib/news-data";
import { newsImageFor } from "../lib/news-images";
import Disclaimer from "../components/Disclaimer";
import NewsAtAGlance from "../components/NewsAtAGlance";
import NewsExplanation from "../components/NewsExplanation";

export default function NewsDetailPage({ item: supplied, items = [], explanation, localMode = false, loading = false, error: feedError = "" }) {
  const { id } = useParams();
  // The story is derived on every render, so a feed that finishes loading after this page opened still resolves.
  const listed = supplied || items.find((entry) => entry.id === id) || null;
  const [fetched, setFetched] = useState(null);
  const [fetchError, setFetchError] = useState("");
  useEffect(() => {
    if (listed || !id || localMode) return;
    fetchNewsItem(id).then(setFetched).catch((reason) => setFetchError(reason.message || "Could not load this update."));
  }, [id, listed, localMode]);
  const item = listed || (fetched?.id === id ? fetched : null);
  const error = item ? "" : fetchError || (localMode ? feedError : "");
  if (error) return <div className="page"><div className="inline-error" role="alert">{error}</div><Link to="/news">Back to all news</Link></div>;
  if (!item) return <div className="page"><div className="empty-state" role="status">{localMode && !loading ? "This update is not in the current reviewed snapshot." : "Loading verified update…"}</div><Link to="/news">Back to all news</Link></div>;
  const image = newsImageFor(item);
  return <article className="page news-detail">
    <Link className="back-link" to="/news"><ArrowLeft size={16} /> All news</Link>
    <img className="news-detail-image" src={image.url} alt={image.alt} />
    <header><span className="eyebrow">{item.publisher || "Official source"}</span><h1>{item.title}</h1><div className="news-card-meta">{item.publishedAt && <span>Published {item.publishedAt}</span>}{item.verifiedAt && <span>Verified {item.verifiedAt}</span>}</div></header>
    {(item.shortSummary || item.excerpt || item.sourceExcerpt) && <p className="news-detail-lead">{item.shortSummary || item.excerpt || item.sourceExcerpt}</p>}
    {item.whyItMatters && <section className="news-detail-callout"><h2>Why this matters</h2><p>{item.whyItMatters}</p></section>}
    {(item.detailSections || []).map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
    {explanation || (localMode ? <NewsAtAGlance item={item} /> : <NewsExplanation itemId={item.id} />)}
    {item.canonicalUrl && <a className="button secondary official-link" href={item.canonicalUrl} target="_blank" rel="noreferrer">Read the official source <ExternalLink size={15} /></a>}
    <Disclaimer compact />
  </article>;
}
