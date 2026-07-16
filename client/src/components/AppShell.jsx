import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BookOpen, Bot, CheckSquare, FileText, Globe2, LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";

const navigation = [
  ["/", "Dashboard", LayoutDashboard],
  ["/documents", "Documents", FileText],
  ["/tasks", "Tasks", CheckSquare],
  ["/guides", "Guides", BookOpen],
  ["/assistant", "Assistant", Bot],
  ["/profile", "Profile", UserRound],
];

export default function AppShell({ onSignOut }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo"><span><Globe2 size={21} /></span> GlobeReady</div>
        <div className="workspace-label">Student workspace</div>
        <nav>{navigation.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"}><Icon size={18} /><span>{label}</span></NavLink>)}</nav>
        <div className="sidebar-footer"><button><Settings size={17} /> Settings</button><button onClick={onSignOut}><LogOut size={17} /> Sign out</button></div>
      </aside>
      <section className="app-main"><Outlet /></section>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.slice(0, 5).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={20} /><span>{label}</span></NavLink>)}
      </nav>
    </div>
  );
}
