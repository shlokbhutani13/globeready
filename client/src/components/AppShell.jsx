import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Bell, Bot, FileText, Globe2, Home, ListChecks, LogOut, Menu, Newspaper, Search, HelpCircle, Settings, ShieldCheck, UserRound } from "lucide-react";

const planPaths = ["/tasks", "/journey", "/dates", "/cases", "/travel", "/contacts", "/university"];
const updatesPaths = ["/news", "/for-you", "/rules", "/guides", "/resources"];

// Five predictable destinations. Plan and Updates each open a short tab bar for the pages that belong to them, so
// every feature is one step from a main destination. Account actions live in the footer (desktop) and Account menu (phone).
const primaryNavigation = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/tasks", label: "Plan", Icon: ListChecks, paths: planPaths },
  { to: "/news", label: "Updates", Icon: Newspaper, paths: updatesPaths },
  { to: "/documents", label: "Documents", Icon: FileText },
  { to: "/assistant", label: "Ask", Icon: Bot },
];

const isActivePath = (item, pathname) => (item.paths ? item.paths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) : item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get("q") || "");
  return (
    <form className="topbar-search" role="search" onSubmit={(event) => { event.preventDefault(); if (value.trim()) navigate(`/search?q=${encodeURIComponent(value.trim())}`); }}>
      <label className="sr-only" htmlFor="global-search">Search updates, rules, resources, cases, guides, tasks and document names</label>
      <Search size={16} aria-hidden="true" />
      <input id="global-search" type="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search updates, rules, tasks…" />
    </form>
  );
}

export default function AppShell({ onSignOut, isAdmin = false, zeroCostMode = false, unreadNotifications = 0 }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef(null);
  const location = useLocation();
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => setAccountOpen(false), [location.pathname]);
  useEffect(() => {
    if (!accountOpen) return undefined;
    const close = (event) => { if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [accountOpen]);
  const remindersLabel = unreadNotifications > 0 ? `Reminders (${unreadNotifications} unread)` : "Reminders";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo"><span><Globe2 size={19} aria-hidden="true" /></span> GlobeReady</div>
          <small>{zeroCostMode ? "Free public beta" : "Student workspace"}</small>
        </div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {primaryNavigation.map((item) => (
            <Link key={item.to} to={item.to} className={isActivePath(item, location.pathname) ? "active" : ""} aria-current={isActivePath(item, location.pathname) ? "page" : undefined}>
              <item.Icon size={18} aria-hidden="true" /><span>{item.label}</span>
            </Link>
          ))}
          {isAdmin && <NavLink to="/admin/news"><ShieldCheck size={18} aria-hidden="true" /><span>Admin</span></NavLink>}
        </nav>
        <div className="sidebar-footer" role="group" aria-label="Account">
          <NavLink to="/notifications"><Bell size={17} aria-hidden="true" /> {remindersLabel}</NavLink>
          <NavLink to="/profile"><UserRound size={17} aria-hidden="true" /> Profile</NavLink>
          <NavLink to="/help"><HelpCircle size={17} aria-hidden="true" /> Help</NavLink>
          <NavLink to="/settings"><Settings size={17} aria-hidden="true" /> Settings</NavLink>
          <button type="button" onClick={onSignOut}><LogOut size={17} aria-hidden="true" /> Sign out</button>
        </div>
      </aside>
      <main className="app-main" id="main-content" tabIndex={-1}>
        <div className="topbar">
          <SearchBox />
          <NavLink className="topbar-reminders" to="/notifications" aria-label={remindersLabel}>
            <Bell size={18} aria-hidden="true" />{unreadNotifications > 0 && <span className="count-badge">{unreadNotifications}</span>}
          </NavLink>
        </div>
        {!online && <div className="offline-banner" role="status">You are offline. You can read what is already loaded, but changes will not be saved or synchronized until you reconnect.</div>}
        <Outlet />
      </main>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {primaryNavigation.map((item) => (
          <Link key={item.to} to={item.to} aria-label={item.label} className={isActivePath(item, location.pathname) ? "active" : ""} aria-current={isActivePath(item, location.pathname) ? "page" : undefined}>
            <item.Icon size={20} aria-hidden="true" /><span>{item.label}</span>
          </Link>
        ))}
        <div className="mobile-account" ref={accountRef}>
          <button type="button" aria-label="Account" aria-expanded={accountOpen} aria-controls="mobile-account-menu" onClick={() => setAccountOpen((open) => !open)}><Menu size={20} aria-hidden="true" /><span>Account</span></button>
          {accountOpen && (
            <div id="mobile-account-menu" role="group" aria-label="Account menu" className="mobile-account-menu" onKeyDown={(event) => { if (event.key === "Escape") setAccountOpen(false); }}>
              <NavLink to="/notifications" autoFocus><Bell size={17} aria-hidden="true" /> {remindersLabel}</NavLink>
              <NavLink to="/profile"><UserRound size={17} aria-hidden="true" /> Profile</NavLink>
              <NavLink to="/help"><HelpCircle size={17} aria-hidden="true" /> Help</NavLink>
              <NavLink to="/settings"><Settings size={17} aria-hidden="true" /> Settings</NavLink>
              {isAdmin && <NavLink to="/admin/news"><ShieldCheck size={17} aria-hidden="true" /> Admin</NavLink>}
              <button type="button" onClick={onSignOut}><LogOut size={17} aria-hidden="true" /> Sign out</button>
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
