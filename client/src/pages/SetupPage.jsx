import React from "react";
import { Link } from "react-router-dom";
import PageHeader from "../components/ui/PageHeader";
import Notice from "../components/ui/Notice";
import Disclaimer from "../components/Disclaimer";
import { setupProgress, setupSteps } from "../lib/setup-guide";

export default function SetupPage({ profile = {}, dates = [], contacts = [], tasks = [], consent }) {
  const steps = setupSteps({ profile, dates, contacts, tasks, consent });
  const progress = setupProgress(steps);
  return (
    <div className="page">
      <PageHeader eyebrow="Get started" title="Set up in five minutes" description="Five short steps that make GlobeReady useful for you. Do them in any order, skip any, and come back whenever you like." />
      <p role="status" className="setup-progress"><strong>{progress.done} of {progress.total}</strong> steps done</p>
      <progress className="setup-bar" max={progress.total} value={progress.done} aria-label="Setup progress" />
      {progress.complete && <Notice tone="success">You have finished the basics. <Link to="/">Go to Home</Link> or read <Link to="/help">how everything works</Link>.</Notice>}
      <ol className="setup-steps" aria-label="Setup steps">
        {steps.map((step) => (
          <li className={`panel setup-step${step.done ? " done" : ""}`} key={step.id}>
            <div>
              <h2>{step.title}{step.optional ? " (optional)" : ""}</h2>
              <p>{step.why}</p>
              <p className="muted"><span className="status-text">{step.done ? "Done" : "Not started"}</span></p>
            </div>
            <Link className={`button ${step.done ? "secondary" : ""}`} to={step.to} aria-label={`${step.action}: ${step.title}`}>{step.done ? "Review" : step.action}</Link>
          </li>
        ))}
      </ol>
      <Notice tone="info">GlobeReady is informational. Suggested steps and dates are not legal conclusions or official deadlines. Confirm anything about your status with your designated school official.</Notice>
      <Disclaimer />
    </div>
  );
}
