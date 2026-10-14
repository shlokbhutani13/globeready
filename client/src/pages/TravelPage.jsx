import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import { allTravelItems, travelSections } from "../data/travel-checklist";
import { friendlyError } from "../lib/friendly-error";
import { stageProgress } from "../lib/planner";

export default function TravelPage({ have = [], custom = [], onSaveChecklist, onAddTasks }) {
  const items = useMemo(() => allTravelItems(custom), [custom]);
  const [departure, setDeparture] = useState("");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const haveSet = new Set(have);
  const missing = items.filter((item) => !haveSet.has(item.id));
  const sections = [...travelSections.map((section) => ({ id: section.id, label: section.label })), ...(custom.length ? [{ id: "custom", label: "My own items" }] : [])];

  const run = async (work) => {
    setError(""); setMessage(""); setBusy(true);
    try { await work(); } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  };
  const toggle = (id) => run(() => onSaveChecklist({ have: haveSet.has(id) ? have.filter((value) => value !== id) : [...have, id], custom }));
  const addCustom = (event) => {
    event.preventDefault();
    const label = newItem.trim();
    if (!label) return;
    run(async () => { await onSaveChecklist({ have, custom: [...custom, { id: `custom-${Date.now().toString(36)}`, label }] }); setNewItem(""); });
  };
  const removeCustom = (id) => run(() => onSaveChecklist({ have: have.filter((value) => value !== id), custom: custom.filter((item) => item.id !== id) }));
  const addMissing = () => run(async () => {
    const created = await onAddTasks(missing.map((item) => ({ title: item.label, category: "Travel", priority: "high" })), { dueDate: departure });
    setMessage(created === 0 ? "Everything missing is already in your tasks." : `Added ${created} task${created === 1 ? "" : "s"} for the items you do not have yet.`);
  });
  const progress = stageProgress(items, have);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Plan"
        title="Travel readiness"
        description="Check what you have before a trip. Anything you are missing can become a task with your departure date as the deadline."
        action={<button type="button" className="button primary" disabled={busy || missing.length === 0} onClick={addMissing}>Add {missing.length} missing to Tasks</button>}
      />
      <SubNav label="Plan sections" links={planLinks} />
      <PageHelp id="travel" />
      <Notice tone="info">This is a general reminder list, not a statement of what any border officer or consulate will require. Check the official sources and ask your DSO about your trip. Details for emergencies can go on your <Link to="/life/emergency-card">Emergency card</Link>.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <div className="panel">
        <div className="form-grid">
          <label className="field">Departure date (optional)<input type="date" value={departure} onChange={(event) => setDeparture(event.target.value)} /><span className="hint">Used as the due date for tasks you add.</span></label>
          <p className="progress-line" role="status">{progress.done} of {progress.total} ready</p>
        </div>
      </div>

      {sections.map((section) => {
        const sectionItems = items.filter((item) => item.section === section.id);
        if (sectionItems.length === 0) return null;
        return (
          <section className="section-block" key={section.id} aria-labelledby={`travel-${section.id}`}>
            <h2 id={`travel-${section.id}`}>{section.label}</h2>
            <ul className="record-list">
              {sectionItems.map((item) => (
                <li className="record" key={item.id}>
                  <div className="check-row">
                    <input id={`have-${item.id}`} type="checkbox" checked={haveSet.has(item.id)} disabled={busy} onChange={() => toggle(item.id)} />
                    <label htmlFor={`have-${item.id}`}>{item.label}</label>
                  </div>
                  {item.custom && <button type="button" className="icon-button" aria-label={`Remove ${item.label}`} disabled={busy} onClick={() => removeCustom(item.id)}><Trash2 size={16} aria-hidden="true" /></button>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <form className="panel" onSubmit={addCustom}>
        <div className="panel-title"><h2>Add your own item</h2></div>
        <div className="form-grid">
          <label className="field">Item<input value={newItem} maxLength={120} onChange={(event) => setNewItem(event.target.value)} placeholder="Bring phone charger and adapter" /></label>
          <div><button className="button secondary" disabled={busy || !newItem.trim() || custom.length >= 40}>Add item</button></div>
        </div>
        {custom.length >= 40 && <p className="muted">You have reached the free beta's limit of 40 custom items.</p>}
      </form>
    </div>
  );
}
