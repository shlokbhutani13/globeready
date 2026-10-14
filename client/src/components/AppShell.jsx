import React, { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Globe2, Home, Bot, LogOut, Newspaper, Settings, ShieldCheck, FileText, UserRound, Menu } from "lucide-react";

// Four primary destinations. Tasks, guides, and reminders are reached from Home; account controls live in the
// footer. Keeping this list short is deliberate, so the mobile bar and the sidebar stay identical.
const primaryNavigation = [
  ["/", "Home", Home],
  ["/news", "Updates", Newspaper],
  ["/documents", "Vault", FileText],
  ["/assistant", "Ask", Bot],
];

export default function AppShell({ onSignOut, isAdmin = false, zeroCostMode = false }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const location = useLocation();
  useEffect(() => setAccountOpen(false), [location.pathname]);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const close = (event) => { if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [accountOpen]);
  const navigation = isAdmin ? [...primaryNavigation, ["/admin/news", "Admin", ShieldCheck]] : primaryNavigation;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo"><span><Globe2 size={19} /></span> GlobeReady</div>
          <small>{zeroCostMode ? "Free public beta" : "Student workspace"}</small>
        </div>
        <span className="workspace-label">Workspace</span>
        <nav aria-label="Workspace navigation">
          {navigation.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer" aria-label="Account navigation">
          <NavLink to="/profile"><UserRound size={17} /> Profile</NavLink>
          <NavLink to="/settings"><Settings size={17} /> Settings</NavLink>
          <button onClick={onSignOut}><LogOut size={17} /> Sign out</button>
        </div>
      </aside>
      <section className="app-main"><Outlet /></section>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={20} /><span>{label}</span></NavLink>)}
        <div className="mobile-account" ref={accountRef}>
          <button type="button" aria-label="Account" aria-expanded={accountOpen} aria-controls="mobile-account-menu" onClick={() => setAccountOpen((open) => !open)}><Menu size={20} /><span>Account</span></button>
          {accountOpen && (
            <div id="mobile-account-menu" role="group" aria-label="Account menu" className="mobile-account-menu" onKeyDown={(event) => { if (event.key === "Escape") setAccountOpen(false); }}>
              <NavLink to="/profile" autoFocus><UserRound size={17} /> Profile</NavLink>
              <NavLink to="/settings"><Settings size={17} /> Settings</NavLink>
              <button type="button" onClick={onSignOut}><LogOut size={17} /> Sign out</button>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
