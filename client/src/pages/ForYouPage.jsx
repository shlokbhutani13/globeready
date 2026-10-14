import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { updatesLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import RelevanceNote from "../components/RelevanceNote";
import Disclaimer from "../components/Disclaimer";
import { comingUp, matchedForProfile, profileSummary } from "../lib/applies";
import { daysUntil } from "../lib/reminders";

export default function ForYouPage({ profile = {}, news = [], newsLoading = false, tasks = [], dates = [], now = new Date() }) {
  const summary = useMemo(() => profileSummary(profile), [profile]);
  const matched = useMemo(() => matchedForProfile({ profile, news }), [profile, news]);
  const upcoming = useMemo(() => comingUp({ tasks, dates, now }), [tasks, dates, now]);
  const noInputs = summary.inputs.every((input) => !input.value);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Updates"
        title="What may apply to you"
        description="Updates and official rules whose published tags match what you told GlobeReady, with the reason shown for each."
        action={<Link className="button secondary" to="/profile">Edit your profile</Link>}
      />
      <SubNav label="Updates sections" links={updatesLinks} />
      <Notice tone="info">These are informational matches, not legal conclusions. A match does not mean an update or rule applies to you, and a missing match does not mean it does not. Confirm anything that affects your status with your designated school official or the official source.</Notice>

      <section className="panel" aria-labelledby="inputs-title">
        <div className="panel-title"><h2 id="inputs-title">What we match on</h2></div>
        <dl className="profile-inputs">
          {summary.inputs.map((input) => (
            <div key={input.id}><dt>{input.label}</dt><dd>{input.value || <span className="muted">Not set</span>}</dd></div>
          ))}
        </dl>
        {!summary.complete && <p className="muted">The more of these you fill in on your <Link to="/profile">profile</Link>, the more precise the matches. Nothing is guessed for fields you leave empty.</p>}
      </section>

      {noInputs ? (
        <EmptyState title="Add a few details to see matches" action={<Link className="button primary" to="/profile">Open your profile</Link>}>
          Choose your visa type, journey stage, university or topics and this page will show what may be relevant.
        </EmptyState>
      ) : (
        <>
          <section className="section-block" aria-labelledby="matched-updates-title">
            <h2 id="matched-updates-title">Updates that may be relevant ({matched.updates.length})</h2>
            {newsLoading && <p className="muted" role="status">Loading reviewed updates…</p>}
            {!newsLoading && matched.updates.length === 0 && <p className="muted">No reviewed update matches your details right now. Browse all <Link to="/news">updates</Link>.</p>}
            <ul className="record-list">
              {matched.updates.map(({ item }) => (
                <li className="record" key={item.id}>
                  <div>
                    <h3><Link to={`/news/${encodeURIComponent(item.id)}`}>{item.title}</Link></h3>
                    <div className="record-meta"><span>{item.publisher}</span>{item.effectiveAt && <span>Effective {item.effectiveAt}</span>}</div>
                    <RelevanceNote item={item} profile={profile} explain />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="section-block" aria-labelledby="matched-rules-title">
            <h2 id="matched-rules-title">Rules and forms that may be relevant ({matched.rules.length})</h2>
            {matched.rules.length === 0 && <p className="muted">Nothing in the library matches your details. Browse <Link to="/rules">all rules and forms</Link>.</p>}
            <ul className="record-list">
              {matched.rules.slice(0, 8).map(({ item }) => (
                <li className="record" key={item.id}>
                  <div>
                    <h3>{item.title}</h3>
                    <div className="record-meta"><span>{item.agency}</span></div>
                    <RelevanceNote item={item} profile={profile} />
                  </div>
                  <div className="record-actions"><a className="button secondary" href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${item.title}: official source`}>Official source</a></div>
                </li>
              ))}
            </ul>
            {matched.rules.length > 8 && <p><Link to="/rules">See all {matched.rules.length} matches in Rules and forms</Link></p>}
          </section>
        </>
      )}

      <section className="section-block" aria-labelledby="coming-up-title">
        <h2 id="coming-up-title">Coming up in the next 30 days</h2>
        {upcoming.length === 0 ? <p className="muted">No tasks, key dates or case dates in the next 30 days.</p> : (
          <ul className="record-list">
            {upcoming.map((row) => {
              const days = daysUntil(row.date, now);
              return (
                <li className="record" key={row.id}>
                  <div><h3><Link to={row.to}>{row.title}</Link></h3><div className="record-meta"><span>{row.kind}</span><span>{row.date}</span><span>{days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</span></div></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Disclaimer />
    </div>
  );
}
