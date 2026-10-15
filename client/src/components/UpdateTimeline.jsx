import React from "react";
import { Link } from "react-router-dom";

const kindText = { published: "Published", effective: "Effective date", rule: "Rule change" };

// Dates in order, each named in words as well as shown, so the order never depends on colour or position alone.
export default function UpdateTimeline({ events = [] }) {
  if (events.length < 2) return null;
  return (
    <section className="update-timeline" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Timeline</h2>
      <ol aria-label="Timeline of this update and related ones">
        {events.map((event) => (
          <li key={`${event.date}-${event.kind}-${event.label}`} aria-current={event.current ? "true" : undefined}>
            <time dateTime={event.date}>{event.date}</time>
            <span className="timeline-kind">{kindText[event.kind]}</span>
            <span className="timeline-label">{event.to ? <Link to={event.to}>{event.label}</Link> : event.label}{event.current && event.kind === "published" ? " (this update)" : ""}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
