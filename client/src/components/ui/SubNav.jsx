import React from "react";
import { NavLink } from "react-router-dom";

// Secondary pages that belong to one section (for example Plan or Updates). Current page is marked with text and an
// underline, not colour alone.
export const planLinks = [
  ["/next", "Next steps"], ["/tasks", "Tasks"], ["/journey", "Journey"], ["/dates", "Key dates"], ["/cases", "Cases"], ["/travel", "Travel"], ["/life", "Life"],
];
// Everyday-life tools live under Plan > Life so the Plan tab bar stays short.
export const lifeLinks = [
  ["/life", "Arrival hub"], ["/life/budget", "Budget"], ["/life/documents", "Documents checklist"], ["/life/emergency-card", "Emergency card"], ["/contacts", "Contacts"], ["/university", "University"], ["/prepare", "Appointment prep"],
];
export const updatesLinks = [["/news", "Updates"], ["/for-you", "For you"], ["/rules", "Rules and forms"], ["/guides", "Guides"], ["/resources", "Safety and life"]];

export default function SubNav({ label, links }) {
  if (!links || links.length < 2) return null;
  return (
    <nav className="subnav" aria-label={label}>
      {links.map(([to, text]) => (
        <NavLink key={to} to={to} end={to === "/news" || to === "/life"}>{text}</NavLink>
      ))}
    </nav>
  );
}
