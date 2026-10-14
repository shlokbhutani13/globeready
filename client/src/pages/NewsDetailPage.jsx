import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, ListPlus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { fetchNewsItem } from "../lib/news-data";
import { newsImageFor } from "../lib/news-images";
import Disclaimer from "../components/Disclaimer";
import RelevanceNote from "../components/RelevanceNote";
import NewsAtAGlance from "../components/NewsAtAGlance";
import NewsExplanation from "../components/NewsExplanation";
import UpdateTimeline from "../components/UpdateTimeline";
import { rulesForNews } from "../data/rules-library";
import { tasksLinkedTo } from "../lib/links";
import { updateTimeline } from "../lib/news-timeline";
import { friendlyError } from "../lib/friendly-error";

export default function NewsDetailPage({ item: supplied, items = [], explanation, localMode = false, loading = false, error: feedError = "", profile, tasks = [], onAddTasks }) {
  const [taskMessage, setTaskMessage] = useState({ tone: "", text: "" });
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
  const connectedRules = rulesForNews(item.id);
  const linkedTasks = tasksLinkedTo(tasks, "news", item.id);
  return <article className="page news-detail">
    <Link className="back-link" to="/news"><ArrowLeft size={16} /> All news</Link>
    <figure className="news-detail-figure"><img className="news-detail-image" src={image.url} alt={image.alt} />{image.credit && <figcaption>{image.credit}</figcaption>}</figure>
    <header><span className="eyebrow">{item.publisher || "Official source"}</span><h1>{item.title}</h1><div className="news-card-meta">{item.publishedAt && <span>Published {item.publishedAt}</span>}{item.verifiedAt && <span>Verified {item.verifiedAt}</span>}</div></header>
    {(item.shortSummary || item.excerpt || item.sourceExcerpt) && <p className="news-detail-lead">{item.shortSummary || item.excerpt || item.sourceExcerpt}</p>}
    {profile && <RelevanceNote item={item} profile={profile} explain />}
    {item.whyItMatters && <section className="news-detail-callout"><h2>Why this matters</h2><p>{item.whyItMatters}</p></section>}
    {(item.detailSections || []).map((section) => <section key={section.heading}><h2>{section.heading}</h2><p>{section.body}</p></section>)}
    <UpdateTimeline events={updateTimeline(item, items)} />
    {explanation || (localMode ? <NewsAtAGlance item={item} /> : <NewsExplanation itemId={item.id} />)}
    {(connectedRules.length > 0 || linkedTasks.length > 0 || onAddTasks) && (
      <section className="connected" aria-labelledby="connected-title">
        <h2 id="connected-title">Connected in GlobeReady</h2>
        {connectedRules.length > 0 && <p>Rules and forms: {connectedRules.map((rule, index) => <React.Fragment key={rule.id}>{index > 0 && "; "}<Link to="/rules">{rule.title}</Link></React.Fragment>)}</p>}
        {linkedTasks.length > 0 && <ul className="chip-row" aria-label="Tasks for this update">{linkedTasks.map((task) => <li key={task.id}><Link className="chip" to="/tasks">{task.completed ? "Done: " : "Task: "}{task.title}</Link></li>)}</ul>}
        {onAddTasks && <button type="button" className="button secondary" onClick={async () => {
          setTaskMessage({ tone: "", text: "" });
          try {
            const created = await onAddTasks([{ title: `Review update: ${item.title}`.slice(0, 200), category: "Updates", priority: item.urgency === "urgent" || item.urgency === "critical" ? "high" : "medium", links: [{ type: "news", id: item.id }] }]);
            setTaskMessage(created === 0 ? { tone: "info", text: "That task is already in your list." } : { tone: "success", text: "Task added. Find it in Tasks." });
          } catch (reason) { setTaskMessage({ tone: "error", text: friendlyError(reason) }); }
        }}><ListPlus size={15} aria-hidden="true" /> Add a task to review this</button>}
        {taskMessage.text && <p className={`inline-notice ${taskMessage.tone}`} role={taskMessage.tone === "error" ? "alert" : "status"}>{taskMessage.text}</p>}
      </section>
    )}
    {item.canonicalUrl && <a className="button secondary official-link" href={item.canonicalUrl} target="_blank" rel="noreferrer">Read the official source <ExternalLink size={15} /></a>}
    <Disclaimer compact />
  </article>;
}
