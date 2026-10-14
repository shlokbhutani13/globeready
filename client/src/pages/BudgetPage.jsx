import React, { useState } from "react";
import { Download, Pencil, Trash2 } from "lucide-react";
import PageHelp from "../components/PageHelp";
import PageHeader from "../components/ui/PageHeader";
import SubNav, { lifeLinks } from "../components/ui/SubNav";
import Notice from "../components/ui/Notice";
import EmptyState from "../components/ui/EmptyState";
import Disclaimer from "../components/Disclaimer";
import { budgetCategories, budgetCsv, categoryLabel, formatAmount, frequencies, limits, loadBudget, monthlyCents, removeItem, saveBudget, setCurrency, setStartMonth, summarize, upsertItem } from "../lib/budget";
import { downloadText } from "../lib/download";
import { localDateKey } from "../lib/reminders";
import { friendlyError } from "../lib/friendly-error";

const blank = { label: "", category: "housing", kind: "recurring", frequency: "monthly", amount: "", month: "", note: "" };

export default function BudgetPage({ storageScope = "", storage = typeof localStorage === "undefined" ? undefined : localStorage, now = new Date(), download = downloadText }) {
  const [budget, setBudget] = useState(() => loadBudget(storage, storageScope, now));
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const summary = summarize(budget);
  const money = (cents) => formatAmount(cents, budget.currency);
  const set = (name) => (event) => { setMessage(""); setForm({ ...form, [name]: event.target.value }); };

  const commit = (next, done = "") => {
    setError(""); setMessage("");
    try { setBudget(saveBudget(storage, storageScope, next, now)); if (done) setMessage(done); return true; } catch (reason) { setError(friendlyError(reason)); return false; }
  };
  const submit = (event) => {
    event.preventDefault();
    try {
      if (commit(upsertItem(budget, form, editing || undefined), editing ? "Cost updated." : "Cost added.")) { setForm(blank); setEditing(null); }
    } catch (reason) { setError(reason.message); setMessage(""); }
  };
  const edit = (item) => { setEditing(item.id); setError(""); setMessage(""); setForm({ label: item.label, category: item.category, kind: item.kind, frequency: item.frequency || "monthly", amount: (item.cents / 100).toFixed(2), month: item.month || "", note: item.note }); };
  const guarded = (action) => { try { action(); } catch (reason) { setError(reason.message); setMessage(""); } };

  return (
    <div className="page">
      <PageHeader eyebrow="Plan" title="Budget planner" description="Plan your monthly costs and one-time arrival costs by hand. Everything stays on this device." action={<button type="button" className="button secondary" disabled={budget.items.length === 0} onClick={() => download(`globeready-budget-${localDateKey(now)}.csv`, budgetCsv(budget), "text/csv;charset=utf-8", { bom: true })}><Download size={15} aria-hidden="true" /> Export CSV</button>} />
      <SubNav label="Life sections" links={lifeLinks} />
      <PageHelp id="budget" />
      <Notice tone="info">Saved in this browser only, so it will not appear on another device and is not in your account export. Export a CSV to keep a copy. Amounts are what you type, in one currency. GlobeReady does not convert currencies or connect to any bank.</Notice>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}

      <section className="panel" aria-label="Plan settings">
        <div className="form-grid">
          <label className="field">Currency (a label only)<input value={budget.currency} maxLength={3} onChange={(event) => guarded(() => commit(setCurrency(budget, event.target.value)))} aria-describedby="currency-hint" /><span className="hint" id="currency-hint">Three letters, such as USD. Enter every amount in this currency.</span></label>
          <label className="field">First month of the plan<input type="month" value={budget.startMonth} onChange={(event) => { if (event.target.value) guarded(() => commit(setStartMonth(budget, event.target.value))); }} /></label>
        </div>
      </section>

      <form className="panel" onSubmit={submit} aria-label={editing ? "Edit a cost" : "Add a cost"}>
        <div className="form-grid">
          <label className="field">Name<input value={form.label} maxLength={limits.label} onChange={set("label")} placeholder="Rent" /></label>
          <label className="field">Category<select value={form.category} onChange={set("category")}>{budgetCategories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
          <label className="field">Type<select value={form.kind} onChange={set("kind")}><option value="recurring">Repeats</option><option value="one-time">Happens once</option></select></label>
          {form.kind === "recurring"
            ? <label className="field">How often<select value={form.frequency} onChange={set("frequency")}>{frequencies.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            : <label className="field">Month (optional)<input type="month" value={form.month} onChange={set("month")} /></label>}
          <label className="field">Amount<input inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0.00" /></label>
          <label className="field">Note (optional)<input value={form.note} maxLength={limits.note} onChange={set("note")} /></label>
        </div>
        <div className="form-actions">
          <button className="button primary">{editing ? "Save changes" : "Add cost"}</button>
          {editing && <button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(blank); }}>Cancel edit</button>}
        </div>
      </form>

      {budget.items.length === 0 ? (
        <EmptyState title="No costs yet">Start with rent and food, then add one-time costs such as a deposit, a phone, bedding or a flight.</EmptyState>
      ) : (
        <>
          <section className="section-block" aria-labelledby="totals-title">
            <h2 id="totals-title">Totals</h2>
            <dl className="glance-list">
              <div><dt>Repeating, per month</dt><dd>{money(summary.monthly)}</dd></div>
              <div><dt>One-time costs</dt><dd>{money(summary.oneTime)}</dd></div>
              <div><dt>Next 12 months</dt><dd>{money(summary.firstYear)}</dd></div>
            </dl>
            {summary.undated > 0 && <p className="muted">{money(summary.undated)} of one-time costs have no month, so they appear in the 12-month total but not in a specific month.</p>}
            {summary.outsideRange > 0 && <p className="muted">{money(summary.outsideRange)} of one-time costs fall after the 12 months shown.</p>}
          </section>

          <section className="section-block" aria-labelledby="cats-title">
            <h2 id="cats-title">By category</h2>
            <div className="table-scroll"><table className="plain-table"><thead><tr><th scope="col">Category</th><th scope="col">Per month</th><th scope="col">One-time</th></tr></thead>
              <tbody>{summary.categories.map((entry) => <tr key={entry.id}><th scope="row">{entry.label}</th><td>{money(entry.monthly)}</td><td>{money(entry.oneTime)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="section-block" aria-labelledby="months-title">
            <h2 id="months-title">Month by month</h2>
            <div className="table-scroll"><table className="plain-table"><thead><tr><th scope="col">Month</th><th scope="col">Repeating</th><th scope="col">One-time</th><th scope="col">Total</th></tr></thead>
              <tbody>{summary.timeline.map((row) => <tr key={row.month}><th scope="row">{row.month}</th><td>{money(row.recurring)}</td><td>{money(row.oneTime)}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div>
          </section>

          <section className="section-block" aria-labelledby="costs-title">
            <h2 id="costs-title">Your costs</h2>
            <ul className="record-list" aria-label="Your costs">
              {budget.items.map((item) => (
                <li className="record" key={item.id}>
                  <div>
                    <h3>{item.label}</h3>
                    <div className="record-meta"><span>{categoryLabel(item.category)}</span><span>{money(item.cents)} {item.kind === "recurring" ? frequencies.find((entry) => entry.id === item.frequency).label.toLowerCase() : item.month ? `in ${item.month}` : "once"}</span>{item.kind === "recurring" && item.frequency !== "monthly" && <span>About {money(monthlyCents(item))} a month</span>}</div>
                    {item.note && <p className="muted">{item.note}</p>}
                  </div>
                  <div className="record-actions">
                    <button type="button" className="button secondary" aria-label={`Edit ${item.label}`} onClick={() => edit(item)}><Pencil size={15} aria-hidden="true" /> Edit</button>
                    <button type="button" className="button secondary" aria-label={`Delete ${item.label}`} onClick={() => commit(removeItem(budget, item.id))}><Trash2 size={15} aria-hidden="true" /> Delete</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="form-actions">
              {confirmClear
                ? <><span role="alert">Remove every cost from this device?</span><button type="button" className="button secondary" onClick={() => { if (commit({ ...budget, items: [] }, "Budget cleared.")) setConfirmClear(false); }}>Yes, remove all</button><button type="button" className="button secondary" onClick={() => setConfirmClear(false)}>Keep them</button></>
                : <button type="button" className="button secondary" onClick={() => setConfirmClear(true)}>Remove all costs</button>}
            </div>
          </section>
        </>
      )}
      <Disclaimer />
    </div>
  );
}
