import React from "react";
import { Bookmark, BookmarkCheck, ExternalLink } from "lucide-react";

const legalStateCopy = {
  proposed: "Proposed", final: "Final", scheduled: "Scheduled", effective: "Effective",
  delayed: "Delayed", enjoined: "Enjoined", superseded: "Superseded", withdrawn: "Withdrawn",
  expired: "Expired", informational: "Informational",
};

export default function NewsCard({ item, saved = false, onToggleSave, compact = false }) {
  const legalLabel = legalStateCopy[item.legalState] || item.legalState || "Informational";
  const summary = item.editorialState === "approved" && item.plainLanguageSummary
    ? item.plainLanguageSummary
    : (item.excerpt || item.sourceExcerpt || "");

  return (
    <article className={`news-card ${compact ? "compact" : ""}`}>
      <div className="news-card-top">
        <span className={`legal-state ${item.legalState || "informational"}`}>{legalLabel}</span>
        {!item.sourceVerified && <span className="legal-state pending">Unverified source</span>}
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
      {!compact && summary && <p className="news-card-summary">{summary}</p>}
      <div className="news-card-meta">
        {item.effectiveAt && <span>Effective {item.effectiveAt}</span>}
        {item.publishedAt && <span>Published {item.publishedAt}</span>}
      </div>
      {item.canonicalUrl && (
        <a href={item.canonicalUrl} target="_blank" rel="noreferrer">
          Read the official source <ExternalLink size={13} />
        </a>
      )}
    </article>
  );
}
