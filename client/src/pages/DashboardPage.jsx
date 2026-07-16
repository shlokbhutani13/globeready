import React from "react";
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock3, FileText, Sparkles } from "lucide-react";
import MetricCard from "../components/MetricCard";
import Disclaimer from "../components/Disclaimer";

export default function DashboardPage({ profile = {}, tasks = [], documents = [] }) {
  const firstName = profile.fullName?.split(" ")[0] || "there";
  const openTasks = tasks.filter((task) => !task.completed);
  return (
    <div className="page">
      <header className="page-header">
        <div><span className="eyebrow">Student dashboard</span><h1>Good morning, {firstName}.</h1><p>{profile.university || "Your journey"} is organized and ready for review.</p></div>
        <button className="button primary"><Sparkles size={17} /> Ask GlobeReady</button>
      </header>
      <section className="metric-grid">
        <MetricCard icon={CheckCircle2} label="Open tasks" value={openTasks.length} detail="Review high-priority work" />
        <MetricCard icon={CalendarDays} label="Next deadline" value={openTasks[0]?.dueDate || "None"} detail={openTasks[0]?.title || "You're caught up"} tone="gold" />
        <MetricCard icon={FileText} label="Documents" value={documents.length} detail="Stored in your vault" tone="green" />
        <MetricCard icon={Clock3} label="Journey stage" value={profile.journeyStage || "Preparing"} detail="Personalizes recommendations" tone="violet" />
      </section>
      <section className="dashboard-grid">
        <article className="panel span-2">
          <div className="panel-title"><div><span className="eyebrow">Plan</span><h2>Upcoming deadlines</h2></div><button>View all <ArrowUpRight size={15} /></button></div>
          <div className="timeline">{openTasks.map((task) => <div className="timeline-row" key={task.id}><span className={`priority ${task.priority}`} /><div><strong>{task.title}</strong><small>{task.priority} priority</small></div><time>{task.dueDate || "No date"}</time></div>)}</div>
        </article>
        <article className="panel">
          <div className="panel-title"><div><span className="eyebrow">Vault</span><h2>Recent documents</h2></div></div>
          <div className="document-mini-list">{documents.map((document) => <div key={document.id}><span><FileText size={17} /></span><div><strong>{document.name}</strong><small>{document.category}</small></div></div>)}</div>
        </article>
        <article className="panel journey-card">
          <span className="eyebrow">Your journey</span><h2>{profile.journeyStage || "Preparing for arrival"}</h2><p>Complete your profile and review your next three actions.</p>
          <div className="progress"><span style={{ width: "68%" }} /></div><small>68% ready</small>
        </article>
        <article className="panel span-2 recommendation">
          <span className="recommendation-icon"><Sparkles size={19} /></span>
          <div><span className="eyebrow">Recommended for you</span><h2>Check your I-20 travel signature</h2><p>Review the signature date before international travel and confirm requirements with your university.</p></div>
          <button className="button secondary">Open guide</button>
        </article>
      </section>
      <Disclaimer compact />
    </div>
  );
}
