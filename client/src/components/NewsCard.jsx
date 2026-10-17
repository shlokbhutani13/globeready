import React from "react";
import { Bookmark, BookmarkCheck, ExternalLink } from "lucide-react";
import RelevanceNote from "./RelevanceNote";
import UpdateLifecycle from "./UpdateLifecycle";
import { newsImageFor } from "../lib/news-images";
import { newsTopicLabel } from "../lib/news-topics";

const legalStateCopy = {
  proposed: "Proposed", final: "Final", scheduled: "Scheduled", effective: "Effective",
  delayed: "Delayed", enjoined: "Enjoined", superseded: "Superseded", withdrawn: "Withdrawn",
  expired: "Expired", informational: "Informational",
};
const updateTypeCopy = { "proposed-rule": "Proposed rule", "final-rule": "Final rule", announcement: "Announcement", "court-development": "Court development", guidance: "Guidance" };

export default function NewsCard({ item, saved = false, onToggleSave, compact = false, profile, seenState }) {
  const legalLabel = legalStateCopy[item.legalState] || item.legalState || "Informational";
  const summary = item.editorialState === "approved" && item.plainLanguageSummary
    ? item.plainLanguageSummary
    : (item.excerpt || item.sourceExcerpt || "");

  const image = newsImageFor(item);
  return (
    <article className={`news-card ${compact ? "compact" : ""}`}>
      {!compact && <img className="news-card-image" src={image.url} alt={image.alt} onError={image.fallbackUrl ? (event) => { event.currentTarget.onerror = null; event.currentTarget.src = image.fallbackUrl; } : undefined} />}
      <div className="news-card-top">
        <span className={`legal-state ${item.legalState || "informational"}`}>{legalLabel}</span>
        {item.updateType && <span className="legal-state informational">{updateTypeCopy[item.updateType] || item.updateType}</span>}
        {(seenState === "new" || seenState === "updated") && <span className="legal-state pending">{seenState === "new" ? "New" : "Updated"}</span>}
        {item.autoIngested ? <span className="legal-state pending">{item.trustLabel || "From official source — not yet reviewed by GlobeReady"}</span> : !item.sourceVerified && <span className="legal-state pending">Unverified source</span>}
        {item.editorialState === "archived" && <span className="legal-state withdrawn">Archived update</span>}
        {item.correctionNote && item.editorialState !== "archived" && <span className="legal-state pending">Corrected</span>}
        {onToggleSave && (
          <button
            className="icon-button"
            aria-label={saved ? `Unsave ${item.title}` : `Save ${item.title}`}
            onClick={() => onToggleSave(item)}
          >
            {saved ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
        )}
      </div>
      <h3>{item.title || "Untitled update"}</h3>
      <p className="news-card-publisher">{item.publisher}</p>
      {Array.isArray(item.topics) && item.topics.length > 0 && (
        <div className="news-topic-list" aria-label="Story topics">
          {item.topics.map((topic) => <span className="chip" key={topic}>{newsTopicLabel(topic)}</span>)}
        </div>
      )}
      <UpdateLifecycle item={item} />
      {profile && <RelevanceNote item={item} profile={profile} />}
      {!compact && summary && <p className="news-card-summary">{summary}</p>}
      <div className="news-card-meta">
        {item.effectiveAt && <span>Effective {item.effectiveAt}</span>}
        {item.publishedAt && <span>Published {item.publishedAt}</span>}
      </div>
      {item.relatedStoryIds?.length > 0 && <p className="muted">Also reported in {item.relatedStoryIds.length} related source stor{item.relatedStoryIds.length === 1 ? "y" : "ies"}.</p>}
      {item.id && <a href={`/news/${item.id}`}>{item.autoIngested ? "View story" : "Read details"}</a>}
      {item.canonicalUrl && (
        <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
          {item.autoIngested ? "Read more" : "Read the official source"} <ExternalLink size={13} />
        </a>
      )}
    </article>
  );
}
