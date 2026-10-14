import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { lifeLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import Disclaimer from "../components/Disclaimer";
import { lifeTopics, resolveLifeLink, topicSteps } from "../data/life-hub";
import { isPlanned } from "../lib/planner";
import { friendlyError } from "../lib/friendly-error";

export default function LifeHubPage({ profile = {}, tasks = [], added = [], onAddTasks }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const add = async (key, steps, done) => {
    setError(""); setMessage(""); setBusy(key);
    try {
      const created = await onAddTasks(steps);
      setMessage(created === 0 ? "Those steps are already in your tasks." : done(created));
    } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(""); }
  };
  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Arrival and daily life" description="Practical steps for settling in, by topic. Add the ones you want to your tasks. Nothing here is a requirement." />
      <SubNav label="Life sections" links={lifeLinks} />
      <PageHelp id="life" />
      <Notice tone="info">These are general suggestions with no deadlines. Your school and city may do things differently, and GlobeReady has not checked local details.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <nav className="jump-links" aria-label="Topics">{lifeTopics.map((topic) => <a key={topic.id} href={`#topic-${topic.id}`}>{topic.label}</a>)}</nav>

      {lifeTopics.map((topic) => {
        const steps = topicSteps(topic, profile.visaType);
        const open = steps.filter((step) => !isPlanned(step, tasks, added));
        const links = (topic.links || []).map(resolveLifeLink).filter(Boolean);
        return (
          <section className="section-block" id={`topic-${topic.id}`} key={topic.id} aria-labelledby={`${topic.id}-title`}>
            <h2 id={`${topic.id}-title`}>{topic.label}</h2>
            <p>{topic.blurb} <span className="progress-line">{steps.length - open.length} of {steps.length} in your tasks</span></p>
            <ul className="record-list" aria-label={`${topic.label} steps`}>
              {steps.map((step) => {
                const planned = isPlanned(step, tasks, added);
                return (
                  <li className="record" key={step.id}>
                    <div><strong>{step.title}</strong>{planned && <div className="record-meta"><span>In your tasks</span></div>}</div>
                    {!planned && <div className="record-actions"><button type="button" className="button secondary" disabled={busy === step.id} onClick={() => add(step.id, [step], () => `Added “${step.title}” to your tasks.`)} aria-label={`Add to tasks: ${step.title}`}>{busy === step.id ? "Adding…" : "Add to tasks"}</button></div>}
                  </li>
                );
              })}
            </ul>
            {open.length > 1 && <div className="form-actions"><button type="button" className="button secondary" disabled={busy === topic.id} onClick={() => add(topic.id, open, (count) => `Added ${count} ${topic.label.toLowerCase()} steps to your tasks.`)} aria-label={`Add all ${open.length} ${topic.label} steps to tasks`}>Add all {open.length}</button></div>}
            {topic.note && <p className="muted">{topic.note}</p>}
            {(links.length > 0 || (topic.tools || []).length > 0) && (
              <ul className="chip-row" aria-label={`${topic.label} links`}>
                {links.map((link) => <li key={link.id}>{link.url ? <a className="chip" href={link.url} target="_blank" rel="noreferrer" aria-label={`${link.label}, ${link.source} (opens the official site)`}>{link.label} <ExternalLink size={13} aria-hidden="true" /></a> : link.phone ? <a className="chip" href={`tel:${link.phone.replace(/[^+\d]/gu, "")}`}>{link.label}: {link.phone}</a> : <Link className="chip" to={link.to}>{link.label}</Link>}</li>)}
                {(topic.tools || []).map(([to, label]) => <li key={to}><Link className="chip" to={to}>{label}</Link></li>)}
              </ul>
            )}
          </section>
        );
      })}
      <Disclaimer />
    </div>
  );
}
