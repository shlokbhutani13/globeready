import React from "react";
import { Link, useNavigate } from "react-router-dom";
import Disclaimer from "../components/Disclaimer";

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Home answers three questions: what changed, what is next, and what Ask can help with. Everything else
// lives one tap deeper, so an empty day stays calm instead of filling with cards.
export default function DashboardPage({ profile = {}, tasks = [], topNews = [], unreadNotifications = 0, onToggleTask }) {
  const navigate = useNavigate();
  const firstName = profile.fullName?.split(" ")[0] || "there";
  const openTasks = tasks.filter((task) => !task.completed);
  const nextTask = openTasks[0];
  const topUpdate = topNews[0];

  return (
    <div className="page home-page">
      <header className="home-header">
        <h1>{greetingFor()}, {firstName}.</h1>
        {profile.university && <p>{profile.university}</p>}
      </header>

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
            {nextTask.dueDate && <time dateTime={nextTask.dueDate}>{nextTask.dueDate}</time>}
          </div>
        ) : (
          <p className="home-quiet">Nothing urgent. You are caught up.</p>
        )}
        <div className="home-links">
          {openTasks.length > 1 && <Link to="/tasks">{openTasks.length - 1} more task{openTasks.length === 2 ? "" : "s"}</Link>}
          {unreadNotifications > 0 && <Link to="/notifications">{unreadNotifications} reminder{unreadNotifications === 1 ? "" : "s"}</Link>}
          <Link to="/guides">Guides</Link>
        </div>
      </section>

      <button className="home-ask" type="button" onClick={() => navigate("/assistant")}>
        <span>Ask GlobeReady</span>
        <small>Questions about your documents, deadlines, or recent updates</small>
      </button>

      <Disclaimer compact />
    </div>
  );
}
