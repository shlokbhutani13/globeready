import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { dueStatus } from "../lib/reminders";
import Disclaimer from "../components/Disclaimer";
import GettingStartedBoard from "../components/GettingStartedBoard";

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Home answers three questions: what changed, what is next, and what Ask can help with. Everything else
// lives one tap deeper, so an empty day stays calm instead of filling with cards.
export default function DashboardPage({ profile = {}, tasks = [], topNews = [], unreadNotifications = 0, onToggleTask, showGettingStarted = false, onDismissGettingStarted, zeroCostMode = false, keyDates = [], setup }) {
  const navigate = useNavigate();
  const firstName = profile.fullName?.split(" ")[0] || "there";
  const openTasks = tasks.filter((task) => !task.completed);
  // Soonest deadline first; tasks without a deadline come last.
  const byDeadline = [...openTasks].sort((left, right) => (left.dueDate || "9999").localeCompare(right.dueDate || "9999"));
  const nextTask = byDeadline[0];
  const topUpdate = topNews[0];

  return (
    <div className="page home-page">
      <header className="home-header">
        <h1>{greetingFor()}, {firstName}.</h1>
        {profile.university && <p>{profile.university}</p>}
      </header>

      {zeroCostMode && <section className="panel beta-status" role="status"><strong>Free public beta</strong><p className="muted">Your workspace uses free services and browser-private document reading. There is no guaranteed service level; always confirm time-sensitive decisions with the official source.</p></section>}

      {setup && !setup.complete && <p className="home-quiet setup-nudge" role="status"><Link to="/setup">Finish setting up ({setup.done} of {setup.total})</Link> Next: {setup.next.title.toLowerCase()}.</p>}
      {showGettingStarted && <GettingStartedBoard zeroCostMode={zeroCostMode} onDismiss={onDismissGettingStarted} />}

      {topUpdate && (
        <section className="home-section" aria-labelledby="home-update-title">
          <span className="eyebrow" id="home-update-title">Latest update</span>
          <Link className="home-update" to="/news">
            <strong>{topUpdate.title || "Untitled update"}</strong>
            <small>{topUpdate.publisher}</small>
          </Link>
        </section>
      )}

      <section className="home-section" aria-labelledby="home-next-title">
        <span className="eyebrow" id="home-next-title">Next</span>
        {nextTask ? (
          <div className="home-task">
            <label>
              <input type="checkbox" checked={false} onChange={() => onToggleTask?.(nextTask.id)} />
              <span>{nextTask.title}</span>
            </label>
            {nextTask.dueDate && <time dateTime={nextTask.dueDate}>{dueStatus(nextTask)?.label || nextTask.dueDate}</time>}
          </div>
        ) : (
          <p className="home-quiet">Nothing urgent. You are caught up.</p>
        )}
        <div className="home-links">
          <Link to="/tasks">{openTasks.length > 1 ? `${openTasks.length - 1} more task${openTasks.length === 2 ? "" : "s"}` : "Tasks"}</Link>
          {unreadNotifications > 0 && <Link to="/notifications">{unreadNotifications} reminder{unreadNotifications === 1 ? "" : "s"}</Link>}
          <Link to="/for-you">What may apply to you</Link>
          <Link to="/guides">Guides</Link>
        </div>
      </section>

      {zeroCostMode && (
        <section className="home-section" aria-labelledby="home-dates-title">
          <span className="eyebrow" id="home-dates-title">Key dates</span>
          {keyDates.length > 0 ? (
            <ul className="home-dates">
              {keyDates.map(({ entry, status }) => (
                <li key={entry.id}><Link to="/dates"><strong>{entry.label}</strong><span>{entry.date}</span><span className={`due-status ${status.kind}`}>{status.label}</span></Link></li>
              ))}
            </ul>
          ) : (
            <p className="home-quiet">No dates coming up. <Link to="/dates">Add your passport, visa or I-20 dates</Link> to get reminders.</p>
          )}
          <div className="home-links"><Link to="/next">Your next steps</Link><Link to="/journey">Journey planner</Link><Link to="/cases">Cases</Link><Link to="/travel">Travel readiness</Link><Link to="/university">University</Link><Link to="/contacts">Contacts</Link></div>
        </section>
      )}

      <button className="home-ask" type="button" onClick={() => navigate("/assistant")}>
        <span>{zeroCostMode ? "Search your documents" : "Ask GlobeReady"}</span>
        <small>{zeroCostMode ? "Find exact passages in the documents you saved, with the page they came from" : "Questions about your documents, deadlines, or recent updates"}</small>
      </button>

      <Disclaimer compact />
    </div>
  );
}
