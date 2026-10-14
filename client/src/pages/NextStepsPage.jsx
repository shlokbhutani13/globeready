import React, { useState } from "react";
import { Link } from "react-router-dom";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { planLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import CopyButton from "../components/ui/CopyButton";
import Disclaimer from "../components/Disclaimer";
import { buildNextSteps, loadSnoozes, snoozeChoices, snoozeItem, splitSnoozed, unsnoozeItem, weeklySummary, weeklyText } from "../lib/next-steps";
import { friendlyError } from "../lib/friendly-error";

const kindLabel = { overdue: "Past your date", task: "Task", reminder: "Reminder", date: "Key date", case: "Case date", suggestion: "Suggestion" };

export default function NextStepsPage({ tasks = [], dates = [], journeyHave = [], profile = {}, now = new Date(), onToggleTask, onAddTasks, storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage }) {
  const [snoozes, setSnoozes] = useState(() => loadSnoozes(storage, storageScope, now));
  const [view, setView] = useState("list");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const steps = buildNextSteps({ tasks, dates, journeyHave, profile, now });
  const { active, snoozed } = splitSnoozed(steps, snoozes);
  const week = weeklySummary({ tasks, dates, now });

  const run = async (id, action, success) => {
    setError(""); setMessage(""); setBusy(id);
    try { await action(); setMessage(success); } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(""); }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Your next steps" description="What to look at next, in order, and why. It is built from the tasks, dates and cases you entered, plus a few common steps for international students." />
      <SubNav label="Plan sections" links={planLinks} />
      <PageHelp id="nextSteps" />
      <Notice tone="info">This is informational. Dates come from what you entered, and suggestions have no deadline. Neither is a legal deadline or a decision about what you must do. Confirm anything about your status with your designated school official.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <div className="filter-row" role="group" aria-label="View">
        <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>Next steps</button>
        <button type="button" className={view === "week" ? "active" : ""} aria-pressed={view === "week"} onClick={() => setView("week")}>This week</button>
      </div>

      {view === "list" ? (
        <>
          {active.length === 0 ? (
            <EmptyState title="Nothing needs your attention right now" action={<Link className="button secondary" to="/tasks">Add a task</Link>}>
              No tasks or dates you entered are due soon. Add key dates and tasks to see them here.
            </EmptyState>
          ) : (
            <ol className="record-list next-steps" aria-label="Next steps in order">
              {active.map((step, index) => (
                <li className="record" key={step.id}>
                  <div>
                    <div className="chip-row"><span className="chip">{index + 1}</span><span className={`chip status-${step.kind}`}>{kindLabel[step.kind]}</span></div>
                    <h2 className="record-title">{step.title}</h2>
                    <p>{step.reason}</p>
                  </div>
                  <div className="record-actions">
                    {step.task && onToggleTask && <button type="button" className="button" disabled={busy === step.id} onClick={() => run(step.id, () => onToggleTask(step.task.id), `Marked “${step.task.title}” done.`)} aria-label={`Mark done: ${step.title}`}>Mark done</button>}
                    {step.item && onAddTasks && <button type="button" className="button" disabled={busy === step.id} onClick={() => run(step.id, () => onAddTasks([step.item]), `Added “${step.title}” to your tasks.`)} aria-label={`Add as task: ${step.title}`}>Add as task</button>}
                    <Link className="button secondary" to={step.to} aria-label={`${step.openLabel}: ${step.title}`}>{step.openLabel}</Link>
                    <label className="snooze-pick">
                      <span className="sr-only">Snooze {step.title}</span>
                      <select value="" onChange={(event) => { if (event.target.value) setSnoozes(snoozeItem(storage, storageScope, step.id, Number(event.target.value), now)); }} aria-label={`Snooze: ${step.title}`}>
                        <option value="">Snooze…</option>
                        {snoozeChoices.map((choice) => <option key={choice.days} value={choice.days}>{choice.label}</option>)}
                      </select>
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {snoozed.length > 0 && (
            <section className="section-block" aria-labelledby="snoozed-title">
              <h2 id="snoozed-title">Snoozed ({snoozed.length})</h2>
              <ul className="record-list">
                {snoozed.map((step) => (
                  <li className="record" key={step.id}>
                    <div><strong>{step.title}</strong><p className="muted">Hidden until {step.until}.</p></div>
                    <div className="record-actions"><button type="button" className="button secondary" onClick={() => setSnoozes(unsnoozeItem(storage, storageScope, step.id, now))} aria-label={`Show again: ${step.title}`}>Show again</button></div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <section aria-labelledby="week-title" className="week-summary">
          <h2 id="week-title">This week</h2>
          <p className="muted" role="status">{week.total} item{week.total === 1 ? "" : "s"} in the next 7 days{week.overdue.length ? `, and ${week.overdue.length} past a date you entered` : ""}.</p>
          {week.overdue.length > 0 && <div className="panel"><h3>Past a date you entered</h3><ul>{week.overdue.map((item) => <li key={`${item.kind}${item.title}${item.date}`}>{item.title} ({item.date})</li>)}</ul></div>}
          {week.days.map((day) => (
            <div className="panel week-day" key={day.date}>
              <h3>{day.label}</h3>
              {day.items.length ? <ul>{day.items.map((item) => <li key={`${item.kind}${item.title}`}><span className="chip">{item.kind}</span> {item.title}</li>)}</ul> : <p className="muted">Nothing entered.</p>}
            </div>
          ))}
          <CopyButton value={weeklyText(week)} label="this week’s summary" />
        </section>
      )}
      <Disclaimer />
    </div>
  );
}
