import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Printer, Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { lifeLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import CopyButton from "../components/ui/CopyButton";
import Disclaimer from "../components/Disclaimer";
import { questionGroups } from "../data/office-questions";
import { addCustomQuestion, addTermNote, allQuestions, limits, loadWorkspace, removeCustomQuestion, removeTermNote, saveWorkspace, setQuestion } from "../lib/university-workspace";
import { buildSummary, summaryFileName, summaryNotice, summaryText } from "../lib/appointment-summary";
import { universityCoverage } from "../lib/university";
import { caseKindLabel } from "../lib/cases";
import { contactRoleLabels } from "./ContactsPage";
import { friendlyError } from "../lib/friendly-error";

const groupLabel = Object.fromEntries([...questionGroups, { id: "mine", label: "My own questions" }].map((group) => [group.id, group.label]));
const blankTerm = { label: "", date: "", note: "" };

function toggle(list, id) { return list.includes(id) ? list.filter((value) => value !== id) : [...list, id]; }

export default function AdvisingPrepPage({ profile = {}, news = [], contacts = [], cases = [], dates = [], storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage, now = new Date(), download = defaultDownload, print = () => window.print() }) {
  const coverage = useMemo(() => universityCoverage(profile, news), [profile, news]);
  const [workspace, setWorkspace] = useState(() => loadWorkspace(storage, storageScope));
  const [customText, setCustomText] = useState("");
  const [term, setTerm] = useState(blankTerm);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [selection, setSelection] = useState({ questionIds: [], caseIds: [], dateIds: [], termIds: [], contactIds: [] });
  const [options, setOptions] = useState({ includeProfile: false, includeCaseNotes: false, revealReceipts: false });

  const commit = (next, message = "") => {
    setError(""); setSaved("");
    try { setWorkspace(saveWorkspace(storage, storageScope, next)); if (message) setSaved(message); return true; } catch (reason) { setError(friendlyError(reason)); return false; }
  };
  const questions = allQuestions(workspace);
  const asked = questions.filter((question) => workspace.questions[question.id]?.ask);
  const summary = buildSummary({ coverage, profile, selection, options, now, data: { questions, cases, dates, terms: workspace.terms, contacts } });
  const text = summaryText(summary);
  const pickToggle = (name) => (id) => setSelection((current) => ({ ...current, [name]: toggle(current[name], id) }));
  const setOption = (name) => (event) => setOptions((current) => ({ ...current, [name]: event.target.checked }));

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Prepare for an advising appointment" description="Collect your questions, note what your university told you, and make a one-page summary to take with you. You choose what goes in it." />
      <SubNav label="Life sections" links={lifeLinks} />
      <PageHelp id="prepare" />
      <Notice tone="info">What you type on this page is saved on this device only. It is not uploaded and is not part of your account, so it will not appear on another device. It is your own notes, not information GlobeReady has reviewed.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">{saved}</Notice>}

      <section className="section-block" aria-labelledby="questions-title">
        <h2 id="questions-title">Questions for the international office</h2>
        <p className="muted">Tick the ones you want to ask. After the appointment, write down what you were told in your own words.</p>
        {[...questionGroups.map((group) => group.id), "mine"].map((groupId) => {
          const inGroup = questions.filter((question) => question.group === groupId);
          if (!inGroup.length) return null;
          return (
            <fieldset className="question-group" key={groupId}>
              <legend>{groupLabel[groupId]}</legend>
              {inGroup.map((question) => {
                const state = workspace.questions[question.id] || { ask: false, answer: "" };
                return (
                  <div className="question-row" key={question.id}>
                    <label className="check-row"><input type="checkbox" checked={state.ask} onChange={(event) => commit(setQuestion(workspace, question.id, { ask: event.target.checked }))} /> <span>{question.text}</span></label>
                    {state.ask && (
                      <label className="field">What I was told (optional)
                        <textarea rows={2} maxLength={limits.answer} defaultValue={state.answer} aria-label={`What I was told: ${question.text}`} onBlur={(event) => { if (event.target.value.trim() !== state.answer) commit(setQuestion(workspace, question.id, { answer: event.target.value })); }} />
                      </label>
                    )}
                    {question.custom && <button type="button" className="button secondary" aria-label={`Remove my question: ${question.text}`} onClick={() => commit(removeCustomQuestion(workspace, question.id))}><Trash2 size={15} aria-hidden="true" /> Remove</button>}
                  </div>
                );
              })}
            </fieldset>
          );
        })}
        <form className="panel" aria-label="Add your own question" onSubmit={(event) => { event.preventDefault(); try { if (commit(addCustomQuestion(workspace, customText))) setCustomText(""); } catch (reason) { setError(reason.message); } }}>
          <label className="field">Add your own question<input value={customText} maxLength={limits.question} onChange={(event) => setCustomText(event.target.value)} /></label>
          <div className="form-actions"><button className="button secondary">Add question</button></div>
        </form>
      </section>

      <section className="section-block" aria-labelledby="terms-title">
        <h2 id="terms-title">Term and orientation notes</h2>
        <p className="muted">Dates your university gave you, such as orientation or when classes start. These are typed by you. GlobeReady has not checked them.</p>
        <form className="panel" aria-label="Add a term note" onSubmit={(event) => { event.preventDefault(); try { if (commit(addTermNote(workspace, term), "Note saved on this device.")) setTerm(blankTerm); } catch (reason) { setError(reason.message); } }}>
          <div className="form-grid">
            <label className="field">Name<input value={term.label} maxLength={limits.label} onChange={(event) => setTerm({ ...term, label: event.target.value })} placeholder="Orientation" /></label>
            <label className="field">Date (optional)<input type="date" value={term.date} onChange={(event) => setTerm({ ...term, date: event.target.value })} /></label>
            <label className="field">Note (optional)<input value={term.note} maxLength={limits.note} onChange={(event) => setTerm({ ...term, note: event.target.value })} /></label>
          </div>
          <div className="form-actions"><button className="button secondary">Add note</button></div>
        </form>
        {workspace.terms.length === 0 ? <p className="muted">No term notes yet.</p> : (
          <ul className="record-list" aria-label="Your term notes">
            {workspace.terms.map((entry) => (
              <li className="record" key={entry.id}>
                <div><h3>{entry.label}</h3><div className="record-meta"><span>Entered by you</span>{entry.date && <span>{entry.date}</span>}</div>{entry.note && <p>{entry.note}</p>}</div>
                <div className="record-actions"><button type="button" className="button secondary" aria-label={`Remove note ${entry.label}`} onClick={() => commit(removeTermNote(workspace, entry.id))}><Trash2 size={15} aria-hidden="true" /> Remove</button></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section-block" aria-labelledby="summary-title">
        <h2 id="summary-title">One-page summary</h2>
        <p className="muted">Nothing is included unless you tick it. The summary never contains your documents. Downloading, printing or copying happens on this device only; nothing is uploaded or published.</p>
        <fieldset className="question-group"><legend>Questions</legend>
          {asked.length === 0 ? <p className="muted">Tick questions above to choose from them here.</p> : asked.map((question) => <label className="check-row" key={question.id}><input type="checkbox" checked={selection.questionIds.includes(question.id)} onChange={() => pickToggle("questionIds")(question.id)} /> {question.text}</label>)}
        </fieldset>
        <fieldset className="question-group"><legend>Cases</legend>
          {cases.length === 0 ? <p className="muted">No cases. <Link to="/cases">Add one</Link> if you want to bring it.</p> : cases.map((record) => <label className="check-row" key={record.id}><input type="checkbox" checked={selection.caseIds.includes(record.id)} onChange={() => pickToggle("caseIds")(record.id)} /> {record.title} ({caseKindLabel(record.kind)})</label>)}
        </fieldset>
        <fieldset className="question-group"><legend>Dates I entered</legend>
          {dates.length === 0 ? <p className="muted">No key dates. <Link to="/dates">Add one</Link>.</p> : dates.map((entry) => <label className="check-row" key={entry.id}><input type="checkbox" checked={selection.dateIds.includes(entry.id)} onChange={() => pickToggle("dateIds")(entry.id)} /> {entry.label}: {entry.date}</label>)}
        </fieldset>
        <fieldset className="question-group"><legend>Term notes</legend>
          {workspace.terms.length === 0 ? <p className="muted">No term notes.</p> : workspace.terms.map((entry) => <label className="check-row" key={entry.id}><input type="checkbox" checked={selection.termIds.includes(entry.id)} onChange={() => pickToggle("termIds")(entry.id)} /> {entry.label}{entry.date ? ` (${entry.date})` : ""}</label>)}
        </fieldset>
        <fieldset className="question-group"><legend>Contact details</legend>
          {contacts.length === 0 ? <p className="muted">No contacts. <Link to="/contacts">Add one</Link>.</p> : contacts.map((contact) => <label className="check-row" key={contact.id}><input type="checkbox" checked={selection.contactIds.includes(contact.id)} onChange={() => pickToggle("contactIds")(contact.id)} /> {contact.name} ({contactRoleLabels[contact.role] || "Contact"})</label>)}
        </fieldset>
        <fieldset className="question-group"><legend>More options (all off by default)</legend>
          <label className="check-row"><input type="checkbox" checked={options.includeProfile} onChange={setOption("includeProfile")} /> Include my visa type, journey stage and university</label>
          <label className="check-row"><input type="checkbox" checked={options.includeCaseNotes} onChange={setOption("includeCaseNotes")} /> Include my notes for the cases I ticked</label>
          <label className="check-row"><input type="checkbox" checked={options.revealReceipts} onChange={setOption("revealReceipts")} /> Show full receipt numbers (otherwise only the last four characters)</label>
        </fieldset>

        <div className="panel summary-preview" aria-label="Summary preview">
          <h3>{summary.header.title}{summary.header.university ? `: ${summary.header.university}` : ""}</h3>
          <p className="muted">{summaryNotice}</p>
          {summary.empty ? <p className="muted">Tick something above to see it here.</p> : summary.sections.map((section) => (
            <div key={section.id}>
              <h4>{section.heading}</h4>
              {section.groups ? section.groups.map((group) => <div key={group.title}><strong>{group.title}</strong><ul>{group.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>) : <ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
            </div>
          ))}
        </div>
        <div className="form-actions">
          <button type="button" className="button" disabled={summary.empty} onClick={() => download(summaryFileName(summary), text)}><Download size={15} aria-hidden="true" /> Download as text</button>
          <button type="button" className="button secondary" disabled={summary.empty} onClick={print}><Printer size={15} aria-hidden="true" /> Print</button>
          {!summary.empty && <CopyButton value={text} label="the summary" />}
        </div>
      </section>

      <section className="print-only summary-print" aria-hidden="true">
        <h2>{summary.header.title}{summary.header.university ? `: ${summary.header.university}` : ""}</h2>
        <p>Prepared {summary.header.prepared}. {summaryNotice}</p>
        {summary.sections.map((section) => (
          <div key={section.id}><h3>{section.heading}</h3>{section.groups ? section.groups.map((group) => <div key={group.title}><strong>{group.title}</strong><ul>{group.lines.map((line) => <li key={line}>{line}</li>)}</ul></div>) : <ul>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul>}</div>
        ))}
      </section>
      <Disclaimer />
    </div>
  );
}

function defaultDownload(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
