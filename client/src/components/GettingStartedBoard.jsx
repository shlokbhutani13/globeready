import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const fullDestinations = [
  ["/", "Home", "See what changed and what to do next."],
  ["/news", "Updates", "Read verified news and understand how it may affect you."],
  ["/documents", "Documents", "Keep important student documents organized."],
  ["/guides", "Guides", "Open trusted practical and official resources."],
  ["/assistant", "Ask GlobeReady", "Ask for a sourced explanation when something is unclear."],
];

const freeBetaDestinations = [
  ["/", "Home", "See your next deadline and the latest update."],
  ["/tasks", "Tasks", "Track deadlines on a list or calendar."],
  ["/news", "Updates", "Search reviewed official-source news."],
  ["/documents", "Documents", "Read PDFs and printed photos on this device."],
  ["/guides", "Guides", "Open and save trusted official resources."],
  ["/assistant", "Ask", "Find exact passages in your saved documents."],
];

export default function GettingStartedBoard({ onDismiss, zeroCostMode = false }) {
  const destinations = zeroCostMode ? freeBetaDestinations : fullDestinations;
  return <section className="getting-started" aria-labelledby="getting-started-title">
    <div className="getting-started-heading"><div><span className="eyebrow">Quick orientation</span><h2 id="getting-started-title">Where everything lives</h2><p>{zeroCostMode ? "Account actions are under Profile and Settings." : "Five places are enough to use GlobeReady."}</p></div><button aria-label="Dismiss guide" onClick={onDismiss}><X size={18} /></button></div>
    <div className="getting-started-links">{destinations.map(([to, title, description]) => <Link key={title} to={to}><strong>{title}</strong><span>{description}</span></Link>)}</div>
  </section>;
}
