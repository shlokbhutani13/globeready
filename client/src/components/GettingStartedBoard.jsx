import React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";

const destinations = [
  ["/", "Home", "See what changed and what to do next."],
  ["/news", "Updates", "Read verified news and understand how it may affect you."],
  ["/documents", "Documents", "Keep important student documents organized."],
  ["/guides", "Guides", "Open trusted practical and official resources."],
  ["/assistant", "Ask GlobeReady", "Ask for a sourced explanation when something is unclear."],
];

export default function GettingStartedBoard({ onDismiss }) {
  return <section className="getting-started" aria-labelledby="getting-started-title">
    <div className="getting-started-heading"><div><span className="eyebrow">Quick orientation</span><h2 id="getting-started-title">Where everything lives</h2><p>Five places are enough to use GlobeReady.</p></div><button aria-label="Dismiss guide" onClick={onDismiss}><X size={18} /></button></div>
    <div className="getting-started-links">{destinations.map(([to, title, description]) => <Link key={title} to={to}><strong>{title}</strong><span>{description}</span></Link>)}</div>
  </section>;
}
