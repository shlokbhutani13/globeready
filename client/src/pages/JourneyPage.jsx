import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import { journeyDisclaimer, journeyItemsFor, journeyStages } from "../data/journey-templates";
import { friendlyError } from "../lib/friendly-error";
import { stageProgress, suggestedDueDate, tasksFromItems } from "../lib/planner";

export default function JourneyPage({ profile = {}, tasks = [], added = [], onAddTasks }) {
  const items = useMemo(() => journeyItemsFor(profile.visaType), [profile.visaType]);
  const taskTitles = useMemo(() => new Set(tasks.map((task) => task.title.trim().toLowerCase())), [tasks]);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inTasks = (item) => added.includes(item.id) || taskTitles.has(item.title.trim().toLowerCase());
  const toggle = (id) => { setMessage(""); setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const missingDates = !profile.startDate && !profile.graduationDate;

  const addSelected = async (chosen) => {
    setError(""); setMessage(""); setBusy(true);
    try {
      const created = await onAddTasks(chosen);
      setMessage(created === 0 ? "Those items are already in your tasks." : `Added ${created} task${created === 1 ? "" : "s"}.`);
      setSelected(new Set());
    } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  };
  const chosenItems = items.filter((item) => selected.has(item.id) && !inTasks(item));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Plan"
        title="Journey planner"
        description={`Common steps for ${/j-?1/i.test(profile.visaType || "") ? "J-1" : /f-?1/i.test(profile.visaType || "") ? "F-1" : "international"} students, from arrival to life after your program. Choose the steps you want and add them to your tasks.`}
        action={<button type="button" className="button primary" disabled={busy || chosenItems.length === 0} onClick={() => addSelected(chosenItems)}>Add {chosenItems.length || ""} selected to Tasks</button>}
      />
      <SubNav label="Plan sections" links={planLinks} />
      <Notice tone="info">{journeyDisclaimer}</Notice>
      {missingDates && <Notice tone="warning">Add your program start and graduation dates in <Link to="/profile">Profile</Link> to get suggested due dates. Without them, tasks are added with no due date.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      {journeyStages.map((stage) => {
        const stageItems = items.filter((item) => item.stage === stage.id);
        const progress = stageProgress(stageItems, stageItems.filter(inTasks).map((item) => item.id));
        const open = stageItems.filter((item) => !inTasks(item));
        return (
          <section className="section-block" key={stage.id} aria-labelledby={`stage-${stage.id}`}>
            <h2 id={`stage-${stage.id}`}>{stage.label}</h2>
            <p>{stage.blurb} <span className="progress-line">{progress.done} of {progress.total} in your tasks</span></p>
            <ul className="record-list">
              {stageItems.map((item) => {
                const due = suggestedDueDate(item, profile);
                const added = inTasks(item);
                return (
                  <li className="record" key={item.id}>
                    <div className="check-row">
                      <input id={`pick-${item.id}`} type="checkbox" disabled={added} checked={added || selected.has(item.id)} onChange={() => toggle(item.id)} />
                      <label htmlFor={`pick-${item.id}`}>{item.title}
                        <span className="record-meta"><span>{item.priority} priority</span>{due && <span>Suggested due {due}</span>}{added && <span>In your tasks</span>}</span>
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
            {open.length > 1 && <div className="form-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => addSelected(open)}>Add all {open.length} {stage.label.toLowerCase()} steps</button></div>}
          </section>
        );
      })}
    </div>
  );
}
