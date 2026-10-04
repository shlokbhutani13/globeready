import React, { useEffect, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { apiRequest } from "../lib/api";

export default function NewsAdminPage({ isAdmin = false }) {
  const [sources, setSources] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    Promise.all([
      apiRequest("/api/admin/news/sources"),
      apiRequest("/api/admin/news/review"),
      apiRequest("/api/admin/news/health"),
    ])
      .then(([sourcesData, reviewData, healthData]) => {
        setSources(sourcesData.items || []);
        setReviewQueue(reviewData.items || []);
        setHealth(healthData);
      })
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const decide = async (review, decision) => {
    try {
      await apiRequest(`/api/admin/news/review/${review.id}`, { method: "PATCH", body: JSON.stringify({ decision }) });
      load();
    } catch (caught) {
      setError(caught.message);
    }
  };

  const toggleSource = async (source) => {
    if (!source.verified) return;
    try {
      await apiRequest(`/api/admin/news/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      load();
    } catch (caught) {
      setError(caught.message);
    }
  };

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="empty-state">
          <ShieldAlert size={28} />
          <h3>Admin access required</h3>
          <p>This area is limited to GlobeReady editorial administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Editorial review</span>
          <h1>Source health and review queue</h1>
          <p>Approve generated explanations only against the current source revision. Nothing publishes automatically.</p>
        </div>
      </header>

      {error && <div className="inline-error" role="alert">{error}</div>}
      {loading && <div className="empty-state"><p>Loading…</p></div>}

      {!loading && (
        <>
          {health && (
            <section className="metric-grid" style={{ marginBottom: 18 }}>
              <div className="metric-card"><div><span className="metric-label">Registered sources</span><strong>{health.sourceCount}</strong></div></div>
              <div className="metric-card"><div><span className="metric-label">Sync runs recorded</span><strong>{health.runCount}</strong></div></div>
              <div className="metric-card"><div><span className="metric-label">Pending review</span><strong>{reviewQueue.filter((review) => review.status === "pending").length}</strong></div></div>
            </section>
          )}

          <section className="panel" style={{ marginBottom: 18 }}>
            <div className="panel-title"><h2>Review queue</h2></div>
            {reviewQueue.filter((review) => review.status === "pending").length === 0 ? (
              <p className="muted">Nothing is waiting on review.</p>
            ) : reviewQueue.filter((review) => review.status === "pending").map((review) => (
              <div className="task-row" key={review.id}>
                <div>
                  <strong>{review.type === "source-suggestion" ? "Source suggestion" : "News explanation"}</strong>
                  <small>{review.canonicalUrl || review.newsItemId}</small>
                </div>
                <div className="action-row">
                  {review.type === "source-suggestion" ? (
                    <>
                      <button className="button secondary" onClick={() => decide(review, "resolve")}><Check size={15} /> Resolve</button>
                      <button className="button secondary" onClick={() => decide(review, "reject")}><X size={15} /> Reject</button>
                    </>
                  ) : (
                    <>
                      <button className="button secondary" onClick={() => decide(review, "approve")}><Check size={15} /> Approve</button>
                      <button className="button secondary" onClick={() => decide(review, "reject")}><X size={15} /> Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </section>

          <section className="panel">
            <div className="panel-title"><h2>Source health</h2></div>
            {sources.map((source) => (
              <div className="task-row" key={source.id}>
                <div>
                  <strong>{source.publisher}</strong>
                  <small>{source.verified ? "Verified" : "Unverified"} · {source.enabled ? "Enabled" : "Disabled"}</small>
                </div>
                <button
                  className="button secondary"
                  disabled={!source.verified}
                  onClick={() => toggleSource(source)}
                >
                  {source.enabled ? "Disable" : "Enable"}
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
