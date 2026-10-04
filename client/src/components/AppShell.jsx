import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Bell, BookOpen, Bot, CheckSquare, FileText, Globe2, LayoutDashboard,
  LogOut, Newspaper, Settings, ShieldCheck, UserRound,
} from "lucide-react";

const baseNavigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/news", "Updates", Newspaper],
  ["/tasks", "Tasks", CheckSquare],
  ["/documents", "Documents", FileText],
  ["/assistant", "Assistant", Bot],
  ["/notifications", "Notifications", Bell],
  ["/guides", "Guides", BookOpen],
  ["/profile", "Profile", UserRound],
];
// The bottom mobile nav is capped at 5 items; this is the chosen set and
// should be preserved by later work rather than silently re-sliced.
const mobileNavPaths = new Set(["/", "/news", "/tasks", "/documents", "/assistant"]);

export default function AppShell({ onSignOut, isAdmin = false, unreadNotifications = 0 }) {
  const navigation = isAdmin ? [...baseNavigation, ["/admin/news", "Admin", ShieldCheck]] : baseNavigation;
  const mobileNavigation = navigation.filter(([to]) => mobileNavPaths.has(to));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span><Globe2 size={21} /></span> GlobeReady</div>
        <div className="workspace-label">Student workspace</div>
        <nav>
          {navigation.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={18} />
              <span>{label}</span>
              {to === "/notifications" && unreadNotifications > 0 && <small className="nav-badge">{unreadNotifications}</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer"><NavLink to="/settings"><Settings size={17} /> Settings</NavLink><button onClick={onSignOut}><LogOut size={17} /> Sign out</button></div>
      </aside>
      <section className="app-main"><Outlet /></section>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {mobileNavigation.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={20} /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
