import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Globe2, Home, Bot, LogOut, Newspaper, Settings, ShieldCheck, FileText, UserRound } from "lucide-react";

// Four primary destinations. Tasks, guides, and reminders are reached from Home; account controls live in the
// footer. Keeping this list short is deliberate, so the mobile bar and the sidebar stay identical.
const primaryNavigation = [
  ["/", "Home", Home],
  ["/news", "Updates", Newspaper],
  ["/documents", "Vault", FileText],
  ["/assistant", "Ask", Bot],
];

export default function AppShell({ onSignOut, isAdmin = false }) {
  const navigation = isAdmin ? [...primaryNavigation, ["/admin/news", "Admin", ShieldCheck]] : primaryNavigation;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span><Globe2 size={21} /></span> GlobeReady</div>
        <nav>
          {navigation.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/profile"><UserRound size={17} /> Profile</NavLink>
          <NavLink to="/settings"><Settings size={17} /> Settings</NavLink>
          <button onClick={onSignOut}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
      <section className="app-main"><Outlet /></section>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={20} /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
