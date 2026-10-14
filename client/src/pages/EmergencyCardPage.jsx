import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer, Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { lifeLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import CopyButton from "../components/ui/CopyButton";
import Disclaimer from "../components/Disclaimer";
import { buildCard, cardFields, cardFileName, cardOptions, cardText, clearCard, loadCard, saveCard, setInclude, setOption, setValue, toggleContact } from "../lib/emergency-card";
import { downloadText } from "../lib/download";
import { contactRoleLabels } from "./ContactsPage";
import { friendlyError } from "../lib/friendly-error";

const sections = ["About me", "Health", "Insurance", "Embassy", "Campus"];

export default function EmergencyCardPage({ profile = {}, contacts = [], storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage, now = new Date(), download = downloadText, print = () => window.print() }) {
  const [card, setCard] = useState(() => loadCard(storage, storageScope));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const built = buildCard({ card, profile, contacts, now });
  const text = cardText(built);
  const commit = (compute, done = "") => {
    setError(""); setMessage("");
    try { setCard(saveCard(storage, storageScope, compute())); if (done) setMessage(done); } catch (reason) { setError(friendlyError(reason)); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Emergency card" description="Pick exactly what goes on a card you can print, download or copy. Nothing is on it until you tick it." />
      <SubNav label="Life sections" links={lifeLinks} />
      <PageHelp id="emergencyCard" />
      <Notice tone="warning">What you type is saved in this browser only, and is not in your account. Anyone who sees a printed or downloaded card can read what you put on it, so keep it somewhere safe. For an emergency, call your local emergency number first. This card is not medical advice or an official record.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      {sections.map((section) => (
        <section className="section-block" key={section} aria-labelledby={`card-${section.replace(/\s/gu, "")}`}>
          <h2 id={`card-${section.replace(/\s/gu, "")}`}>{section}</h2>
          {cardFields.filter((field) => field.section === section).map((field) => (
            <div className="card-field" key={field.id}>
              <label className="field">{field.label}
                {field.long
                  ? <textarea rows={2} maxLength={field.max} defaultValue={card.values[field.id] || ""} onBlur={(event) => { if (event.target.value.trim() !== (card.values[field.id] || "")) commit(() => setValue(card, field.id, event.target.value)); }} />
                  : <input maxLength={field.max} defaultValue={card.values[field.id] || ""} onBlur={(event) => { if (event.target.value.trim() !== (card.values[field.id] || "")) commit(() => setValue(card, field.id, event.target.value)); }} />}
              </label>
              <label className="check-row"><input type="checkbox" checked={card.include[field.id] === true} disabled={!card.values[field.id]} onChange={(event) => commit(() => setInclude(card, field.id, event.target.checked))} aria-label={`Put “${field.label}” on the card`} /> Put on the card{field.sensitive ? " (this is sensitive)" : ""}</label>
            </div>
          ))}
          {section === "About me" && cardOptions.filter((option) => option.id === "university").map((option) => <label className="check-row" key={option.id}><input type="checkbox" checked={card.options[option.id] === true} disabled={!profile.university} onChange={(event) => commit(() => setOption(card, option.id, event.target.checked))} /> {option.label}{profile.university ? ` (${profile.university})` : " (add it in Profile first)"}</label>)}
          {section === "Campus" && cardOptions.filter((option) => option.id === "usNumber").map((option) => <label className="check-row" key={option.id}><input type="checkbox" checked={card.options[option.id] === true} onChange={(event) => commit(() => setOption(card, option.id, event.target.checked))} /> {option.label}</label>)}
        </section>
      ))}

      <section className="section-block" aria-labelledby="card-contacts">
        <h2 id="card-contacts">Contacts</h2>
        {contacts.length === 0 ? <p className="muted">No contacts saved yet. <Link to="/contacts">Add your DSO, campus safety or a trusted person</Link>, then pick them here.</p> : (
          <fieldset className="question-group"><legend>Pick contacts to list (up to 8)</legend>
            {contacts.map((contact) => <label className="check-row" key={contact.id}><input type="checkbox" checked={card.contactIds.includes(contact.id)} onChange={() => commit(() => toggleContact(card, contact.id))} /> {contact.name} ({contactRoleLabels[contact.role] || "Contact"})</label>)}
          </fieldset>
        )}
      </section>

      <section className="section-block" aria-labelledby="card-preview-title">
        <h2 id="card-preview-title">Your card</h2>
        <div className="panel summary-preview" aria-label="Card preview">
          {built.empty ? <p className="muted">Fill in and tick something above to see it here.</p> : built.sections.map((section) => (
            <div key={section.heading}><h3>{section.heading}</h3><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="button" disabled={built.empty} onClick={() => download(cardFileName(built), text)}><Download size={15} aria-hidden="true" /> Download as text</button>
          <button type="button" className="button secondary" disabled={built.empty} onClick={print}><Printer size={15} aria-hidden="true" /> Print</button>
          {!built.empty && <CopyButton value={text} label="the emergency card" />}
        </div>
        <div className="form-actions">
          {confirm
            ? <><span role="alert">Erase everything typed on this page from this device?</span><button type="button" className="button secondary" onClick={() => { clearCard(storage, storageScope); setCard(loadCard(storage, storageScope)); setConfirm(false); setMessage("Erased from this device."); }}>Yes, erase it</button><button type="button" className="button secondary" onClick={() => setConfirm(false)}>Keep it</button></>
            : <button type="button" className="button secondary" onClick={() => setConfirm(true)}><Trash2 size={15} aria-hidden="true" /> Erase this card</button>}
        </div>
      </section>

      <section className="print-only summary-print" aria-hidden="true">
        <h2>{built.header.title}</h2>
        <p>Prepared {built.header.prepared}. {built.notice}</p>
        {built.sections.map((section) => <div key={section.heading}><h3>{section.heading}</h3><ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>)}
      </section>
      <Disclaimer />
    </div>
  );
}
