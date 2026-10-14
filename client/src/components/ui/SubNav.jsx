import React from "react";
import { NavLink } from "react-router-dom";

// Secondary pages that belong to one section (for example Plan or Updates). Current page is marked with text and an
// underline, not colour alone.
export const planLinks = [
  ["/tasks", "Tasks"], ["/journey", "Journey"], ["/dates", "Key dates"], ["/travel", "Travel"], ["/contacts", "Contacts"],
];
export const updatesLinks = [["/news", "Updates"], ["/guides", "Guides"]];

export default function SubNav({ label, links }) {
  return (
    <nav className="subnav" aria-label={label}>
      {links.map(([to, text]) => (
        <NavLink key={to} to={to} end={to === "/news"}>{text}</NavLink>
      ))}
    </nav>
  );
}
