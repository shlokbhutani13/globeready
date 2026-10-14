import React, { useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Notice from "../components/ui/Notice";
import Disclaimer from "../components/Disclaimer";
import EmptyState from "../components/ui/EmptyState";
import { glossary, searchGlossary } from "../data/glossary";
import { helpOrder, pageHelp, pageHelpTitles } from "../data/page-help";

const routes = { tasks: "/tasks", journey: "/journey", dates: "/dates", cases: "/cases", travel: "/travel", contacts: "/contacts", university: "/university", news: "/news", forYou: "/for-you", rules: "/rules", resources: "/resources", guides: "/guides", life: "/life", budget: "/life/budget", docReadiness: "/life/documents", prepare: "/prepare", nextSteps: "/next" };

export default function HelpPage({ zeroCostMode = false }) {
  const [query, setQuery] = useState("");
  const terms = searchGlossary(query);
  const topics = helpOrder.filter((id) => zeroCostMode || ["news", "forYou", "rules", "resources", "guides", "university"].includes(id));
  return (
    <div className="page">
      <PageHeader eyebrow="Help" title="Help and glossary" description="How each part of GlobeReady works, what it keeps, and what the common terms mean." />
      <Notice tone="info">GlobeReady is an organizer and reader, not a lawyer or your school. It never decides what applies to you. Your designated school official is the authority on your record.</Notice>

      <section className="section-block" aria-labelledby="stored-title">
        <h2 id="stored-title">What is stored and what is not</h2>
        {zeroCostMode ? (
          <>
            <ul className="tip-list">
              <li><strong>Saved in your private account:</strong> your profile, tasks, key dates, contacts, cases you track, saved links and news, checklist choices, and extracted document text. Extracted document text can be saved in your private account when document reading is on. Turning document reading off stops search but does not delete text already saved.</li>
              <li><strong>Stays on this device:</strong> original files are never uploaded. News seen markers, saved searches, snoozes, and appointment-preparation notes stay only in this browser.</li>
              <li><strong>Not retrieved automatically:</strong> GlobeReady does not obtain your immigration case status or personal records from any agency. Avoid putting passport or ID numbers into free-text notes.</li>
              <li><strong>Your control:</strong> export, restore or delete your data in <Link to="/settings">Settings</Link> at any time.</li>
            </ul>
          </>
        ) : (
          <p>Your data is stored in your account. See <Link to="/settings">Settings</Link> for export and deletion, and the privacy notice for details.</p>
        )}
      </section>

      <section className="section-block" aria-labelledby="how-title">
        <h2 id="how-title">How each part works</h2>
        <ul className="record-list">
          {topics.map((id) => (
            <li className="record" key={id}>
              <div>
                <h3>{pageHelpTitles[id]}</h3>
                <p>{pageHelp[id].what}</p>
                <p className="muted"><strong>What it does not do:</strong> {pageHelp[id].not}</p>
              </div>
              <div className="record-actions"><Link className="button secondary" to={routes[id]} aria-label={`Open ${pageHelpTitles[id]}`}>Open</Link></div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section-block" aria-labelledby="glossary-title">
        <h2 id="glossary-title">Glossary</h2>
        <p className="muted">Plain-language meanings. They are general and may not describe your situation exactly.</p>
        <form role="search" aria-label="Search the glossary" onSubmit={(event) => event.preventDefault()}>
          <label className="field">Search terms<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try OPT or I-20" autoComplete="off" /></label>
        </form>
        <p className="muted" role="status">{terms.length} of {glossary.length} terms shown</p>
        {terms.length === 0 ? <EmptyState title="No terms match">Try fewer letters, or ask your designated school official.</EmptyState> : (
          <dl className="glossary-list">
            {terms.map((entry) => (
              <div key={entry.id} id={entry.id}>
                <dt>{entry.term}</dt>
                <dd>{entry.meaning}{entry.to && <> <Link to={entry.to}>Find the official source in Rules and forms</Link></>}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <Disclaimer />
    </div>
  );
}
