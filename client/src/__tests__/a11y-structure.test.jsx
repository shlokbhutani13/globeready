import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import DashboardPage from "../pages/DashboardPage";
import TasksPage from "../pages/TasksPage";
import KeyDatesPage from "../pages/KeyDatesPage";
import ContactsPage from "../pages/ContactsPage";
import JourneyPage from "../pages/JourneyPage";
import TravelPage from "../pages/TravelPage";
import NewsPage from "../pages/NewsPage";
import GuidesPage from "../pages/GuidesPage";
import ProfilePage from "../pages/ProfilePage";
import SettingsPage from "../pages/SettingsPage";
import SearchPage from "../pages/SearchPage";
import NotificationsPage from "../pages/NotificationsPage";
import DocumentsPage from "../pages/DocumentsPage";
import AssistantPage from "../pages/AssistantPage";
import RulesPage from "../pages/RulesPage";
import ResourcesPage from "../pages/ResourcesPage";
import CasesPage from "../pages/CasesPage";
import ForYouPage from "../pages/ForYouPage";
import UniversityPage from "../pages/UniversityPage";

afterEach(cleanup);
const noop = vi.fn(async () => {});
const profile = { fullName: "Maya", visaType: "F-1", startDate: "2026-08-20" };
const story = { id: "n1", title: "Rule", publisher: "DHS", sourceVerified: true, visaTypes: ["f-1"] };
const consent = { documents: true, aiGeneration: false, text: {} };

const pages = {
  Home: <DashboardPage zeroCostMode profile={profile} tasks={[{ id: "1", title: "Task", dueDate: "2026-11-01" }]} topNews={[story]} keyDates={[]} showGettingStarted onDismissGettingStarted={noop} />,
  Tasks: <TasksPage zeroCostMode tasks={[{ id: "1", title: "Task", dueDate: "2026-11-01" }]} onAdd={noop} onToggle={noop} onDelete={noop} onExportCalendar={noop} />,
  "Key dates": <KeyDatesPage dates={[{ id: "d", label: "Passport", kind: "passport", date: "2028-01-01", remindDays: 30 }]} onCreate={noop} onUpdate={noop} onRemove={noop} onExportCalendar={noop} />,
  Contacts: <ContactsPage contacts={[{ id: "c", name: "Dr. Rao", role: "dso", phone: "+1 555 0100", email: "a@b.edu" }]} onCreate={noop} onUpdate={noop} onRemove={noop} />,
  Journey: <JourneyPage profile={profile} tasks={[]} onAddTasks={noop} />,
  Travel: <TravelPage have={[]} custom={[{ id: "c", label: "Adapter" }]} onSaveChecklist={noop} onAddTasks={noop} />,
  Updates: <NewsPage zeroCostMode items={[story]} profile={profile} savedIds={new Set()} onToggleSave={noop} />,
  Guides: <GuidesPage />,
  Profile: <ProfilePage profile={profile} onSave={noop} showTopics />,
  Settings: <SettingsPage live zeroCostMode consent={consent} onSaveConsent={noop} onExport={noop} onDelete={noop} onShowGettingStarted={noop} signInProviders={["password"]} restore={{ uid: "u", existing: {}, store: {} }} />,
  Search: <SearchPage news={[story]} guides={[]} tasks={[]} documents={[]} />,
  Reminders: <NotificationsPage localMode notifications={[{ id: "a", title: "T", body: "B", read: false }]} onMarkRead={noop} onMarkAllRead={noop} />,
  Documents: <DocumentsPage localProcessing consent={consent} onSaveConsent={noop} documents={[]} onAdd={noop} onDelete={noop} onAnalyze={noop} onDeleteAllText={noop} storageAvailable />,
  "Rules and forms": <RulesPage profile={profile} onAddTasks={noop} />,
  "Safety and life": <ResourcesPage />,
  Cases: <CasesPage cases={[{ id: "c", title: "OPT", kind: "opt-ead", status: "filed", timeline: [] }]} onCreate={noop} onUpdate={noop} onAddEntry={noop} onRemoveEntry={noop} onRemove={noop} onAddTasks={noop} />,
  "For you": <ForYouPage profile={profile} news={[story]} />,
  University: <UniversityPage profile={{ university: "Example University", officialUniversityDomain: "example.edu" }} onSaveLink={noop} onRemoveLink={noop} />,
  Ask: <AssistantPage localMode documentsAllowed localChunks={[]} documents={[]} />,
};

// The same markup serves 390 px and desktop; these structural rules hold at every width.
describe.each(Object.entries(pages))("%s page structure", (name, element) => {
  test("has one page title, named controls, unique ids, and no unnamed images", () => {
    const { container } = render(<MemoryRouter>{element}</MemoryRouter>);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    for (const control of [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link"), ...screen.queryAllByRole("textbox"), ...screen.queryAllByRole("combobox"), ...screen.queryAllByRole("checkbox"), ...screen.queryAllByRole("searchbox"), ...screen.queryAllByRole("spinbutton")]) {
      expect(control, `${name}: ${control.outerHTML.slice(0, 120)}`).toHaveAccessibleName();
    }
    const ids = [...container.querySelectorAll("[id]")].map((node) => node.id);
    expect(new Set(ids).size, `${name}: duplicate ids`).toBe(ids.length);
    for (const image of container.querySelectorAll("img")) expect(image.hasAttribute("alt")).toBe(true);
    const levels = [...container.querySelectorAll("h1,h2,h3,h4")].map((node) => Number(node.tagName[1]));
    levels.forEach((level, index) => { if (index > 0) expect(level - levels[index - 1], `${name}: heading levels skip`).toBeLessThanOrEqual(1); });
  });
});
