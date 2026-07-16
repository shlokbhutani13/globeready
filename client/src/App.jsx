import React, { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import TasksPage from "./pages/TasksPage";
import GuidesPage from "./pages/GuidesPage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";
import { useAuth } from "./lib/auth-context";
import { apiRequest } from "./lib/api";
import {
  createTask, removeDocument, removeTask, saveProfile, subscribeStudentData,
  toggleTask, uploadDocument,
} from "./lib/student-data";

const initialProfile = { fullName: "Maya Singh", homeCountry: "India", university: "UNC Chapel Hill", program: "Computer Science", visaType: "F-1", journeyStage: "Preparing for arrival" };
const emptyProfile = { fullName: "", homeCountry: "", university: "", program: "", visaType: "F-1", journeyStage: "Preparing for arrival" };
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
  const auth = useAuth();
  const [demo, setDemo] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [tasks, setTasks] = useState(initialTasks);
  const [documents, setDocuments] = useState(initialDocuments);
  const [savedResources, setSavedResources] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    if (!auth.user) return undefined;
    setProfile({ ...emptyProfile, fullName: auth.user.displayName || "" });
    setTasks([]);
    setDocuments([]);
    setSavedResources([]);
    const unsubscribers = subscribeStudentData(auth.user.uid, {
      profile: (value) => setProfile({ ...emptyProfile, fullName: auth.user.displayName || "", ...value }),
      tasks: setTasks,
      documents: setDocuments,
      error: (error) => setAppError(error?.message || "Could not load your workspace."),
    });
    apiRequest("/api/resources")
      .then(setSavedResources)
      .catch((error) => setAppError(error.message));
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [auth.user]);

  if (auth.loading) return <div className="app-loading">Preparing GlobeReady…</div>;
  if (!auth.user && !demo) return <LoginPage onDemo={() => setDemo(true)} auth={auth} />;

  const live = Boolean(auth.user);
  const addTask = async (title) => {
    if (live) {
      setAppError("");
      return createTask(auth.user.uid, title).catch((error) => setAppError(error.message));
    }
    setTasks([...tasks, { id: crypto.randomUUID(), title, category: "General", priority: "medium", dueDate: "", completed: false }]);
  };
  const changeTask = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (live) return toggleTask(auth.user.uid, task).catch((error) => setAppError(error.message));
    setTasks(tasks.map((item) => item.id === id ? { ...item, completed: !item.completed } : item));
  };
  const deleteTask = async (id) => live
    ? removeTask(auth.user.uid, id).catch((error) => setAppError(error.message))
    : setTasks(tasks.filter((task) => task.id !== id));
  const addDocument = async (file) => {
    if (live) {
      setAppError("");
      setUploadProgress(1);
      try {
        await uploadDocument(auth.user.uid, file, setUploadProgress);
      } catch (error) {
        setAppError(error.message);
      }
      finally { setTimeout(() => setUploadProgress(0), 500); }
    } else {
      setDocuments([...documents, { id: crypto.randomUUID(), name: file.name, category: "Other", storageMode: "safe demo metadata" }]);
    }
  };
  const deleteDocument = async (document) => live
    ? removeDocument(auth.user.uid, document).catch((error) => setAppError(error.message))
    : setDocuments(documents.filter((item) => item.id !== document.id));
  const analyzeDocument = async (document) => {
    if (!live) {
      const analysis = {
        summary: "Demo mode does not read file contents. Connect Firebase and Gemini for document analysis.",
      };
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, analysis } : item));
      return;
    }
    setAppError("");
    const analysis = await apiRequest(`/api/documents/${document.id}/analyze`, { method: "POST" })
      .catch((error) => {
        setAppError(error.message);
        return null;
      });
    if (!analysis) return;
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, analysis } : item));
  };
  const updateProfile = async (value) => {
    setProfile(value);
    if (live) await saveProfile(auth.user.uid, value);
  };
  const signOut = async () => {
    if (live) await auth.signOutUser();
    setSavedResources([]);
    setDemo(false);
  };
  const saveGuide = async (guide) => {
    if (!live) return;
    const resource = await apiRequest("/api/resources", {
      method: "POST",
      body: JSON.stringify({
        title: guide.title,
        url: guide.url,
        category: guide.category,
        source: guide.source,
      }),
    });
    setSavedResources((current) => [...current, resource]);
  };

  return (
    <BrowserRouter>
      {appError && <div className="app-error" role="alert"><span>{appError}</span><button onClick={() => setAppError("")}>Dismiss</button></div>}
      <Routes>
        <Route element={<AppShell onSignOut={signOut} />}>
          <Route index element={<DashboardPage profile={profile} tasks={tasks} documents={documents} />} />
          <Route path="documents" element={<DocumentsPage documents={documents} uploadProgress={uploadProgress} onAdd={addDocument} onDelete={deleteDocument} onAnalyze={analyzeDocument} />} />
          <Route path="tasks" element={<TasksPage tasks={tasks} onAdd={addTask} onToggle={changeTask} onDelete={deleteTask} />} />
          <Route path="guides" element={<GuidesPage onSave={saveGuide} savedUrls={savedResources.map((resource) => resource.url)} />} />
          <Route path="assistant" element={<AssistantPage />} />
          <Route path="profile" element={<ProfilePage profile={profile} onSave={updateProfile} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
