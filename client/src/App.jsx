import React, { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import TasksPage from "./pages/TasksPage";
import GuidesPage from "./pages/GuidesPage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";

const initialProfile = { fullName: "Maya Singh", homeCountry: "India", university: "UNC Chapel Hill", program: "Computer Science", visaType: "F-1", journeyStage: "Preparing for arrival" };
const initialTasks = [
  { id: "task-1", title: "Pay the SEVIS I-901 fee", category: "Immigration", priority: "high", dueDate: "2026-08-01", completed: false },
  { id: "task-2", title: "Upload health insurance waiver", category: "Healthcare", priority: "high", dueDate: "2026-08-05", completed: false },
  { id: "task-3", title: "Review airport transportation", category: "Arrival", priority: "medium", dueDate: "2026-08-12", completed: false },
];
const initialDocuments = [
  { id: "doc-1", name: "I-20.pdf", category: "Immigration", storageMode: "safe demo metadata" },
  { id: "doc-2", name: "Insurance policy.pdf", category: "Healthcare", storageMode: "safe demo metadata" },
];

export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [tasks, setTasks] = useState(initialTasks);
  const [documents, setDocuments] = useState(initialDocuments);
  if (!signedIn) return <LoginPage onDemo={() => setSignedIn(true)} />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell onSignOut={() => setSignedIn(false)} />}>
          <Route index element={<DashboardPage profile={profile} tasks={tasks} documents={documents} />} />
          <Route path="documents" element={<DocumentsPage documents={documents} onAdd={(document) => setDocuments([...documents, { ...document, id: crypto.randomUUID(), storageMode: "safe demo metadata" }])} onDelete={(id) => setDocuments(documents.filter((item) => item.id !== id))} />} />
          <Route path="tasks" element={<TasksPage tasks={tasks} onAdd={(title) => setTasks([...tasks, { id: crypto.randomUUID(), title, category: "General", priority: "medium", dueDate: "", completed: false }])} onToggle={(id) => setTasks(tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task))} onDelete={(id) => setTasks(tasks.filter((task) => task.id !== id))} />} />
          <Route path="guides" element={<GuidesPage />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="profile" element={<ProfilePage profile={profile} onSave={setProfile} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
