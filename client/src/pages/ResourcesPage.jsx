import React from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { updatesLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import CopyButton from "../components/ui/CopyButton";
import Disclaimer from "../components/Disclaimer";
import { resourceCategories, resourcesIn, scamTips } from "../data/resource-center";

export default function ResourcesPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Updates"
        title="Safety and life resources"
        description="Emergency, scam, health, tax, housing, travel and campus-safety resources from the organizations that run them."
      />
      <SubNav label="Updates sections" links={updatesLinks} />
      <Notice tone="warning">If you or someone else is in immediate danger in the United States, call <a href="tel:911">911</a>. Numbers on this page are U.S. numbers. This list is short and not exhaustive.</Notice>

      <nav className="jump-links" aria-label="Resource categories">
        {resourceCategories.map((category) => <a key={category.id} href={`#${category.id}`}>{category.label}</a>)}
      </nav>

      {resourceCategories.map((category) => (
        <section className="section-block" key={category.id} id={category.id} aria-labelledby={`${category.id}-title`}>
          <h2 id={`${category.id}-title`}>{category.label}</h2>
          <p>{category.blurb}</p>
          {category.id === "scams" && (
            <ul className="tip-list" aria-label="Ways to spot a scam">{scamTips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
          )}
          <ul className="record-list">
            {resourcesIn(category.id).map((entry) => (
              <li className="record" key={entry.id}>
                <div>
                  <h3>{entry.title}</h3>
                  <p>{entry.summary}</p>
                  <div className="record-meta">
                    <span>{entry.agency}</span>
                    {entry.phone && <span><a href={`tel:${entry.phone.replace(/[^+\d]/gu, "")}`}>{entry.phone}</a> <CopyButton value={entry.phone} label={`${entry.title} phone number`} /></span>}
                  </div>
                </div>
                <div className="record-actions">
                  {entry.url && <a className="button secondary" href={entry.url} target="_blank" rel="noreferrer" aria-label={`${entry.title}: official site`}>Official site <ExternalLink size={15} aria-hidden="true" /></a>}
                  {entry.internal && <Link className="button secondary" to={entry.internal}>Open your contacts</Link>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Disclaimer />
    </div>
  );
}
