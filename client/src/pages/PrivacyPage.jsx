import React from "react";
import PageHeader from "../components/ui/PageHeader";
import Notice from "../components/ui/Notice";
import { notLegalAdvice, privacyIntro, privacySections } from "../data/privacy-notice";

// A standalone page: readable before sign-in, so people can decide before they create an account.
// Contact details are shown only when the owner has set VITE_PRIVACY_CONTACT (an email address).
export function contactLink(value = import.meta.env.VITE_PRIVACY_CONTACT) {
  const address = typeof value === "string" ? value.trim() : "";
  return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(address) ? address : "";
}

export default function PrivacyPage({ contact = contactLink() }) {
  return (
    <main className="privacy-standalone">
      <a className="text-button" href="/">&larr; Back to GlobeReady</a>
      <PageHeader eyebrow="Free public beta" title="Privacy and your data" description={privacyIntro} />
      <Notice tone="info">{notLegalAdvice}</Notice>
      {privacySections.map((section) => (
        <section className="section-block" key={section.id} aria-labelledby={`privacy-${section.id}`}>
          <h2 id={`privacy-${section.id}`}>{section.title}</h2>
          {section.lead && <p>{section.lead}</p>}
          <ul className="tip-list">
            {section.items.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ))}
      <section className="section-block" aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">Questions about your data</h2>
        {contact
          ? <p>Write to <a href={`mailto:${contact}`}>{contact}</a> about access, correction or deletion.</p>
          : <p>Contact details for privacy requests have not been published yet. Until they are, use Settings to export or delete your data yourself.</p>}
      </section>
    </main>
  );
}
