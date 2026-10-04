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
import SettingsPage from "./pages/SettingsPage";
import NewsPage from "./pages/NewsPage";
import NotificationsPage from "./pages/NotificationsPage";
import NewsAdminPage from "./pages/NewsAdminPage";
import { useAuth } from "./lib/auth-context";
import { apiDownload, apiRequest } from "./lib/api";
import { deleteAccountWithReauth } from "./lib/account-deletion";
import { fetchConsent, saveConsent } from "./lib/consent";
import { demoMode, localUserMode, storageAvailable } from "./lib/firebase";
import {
  createTask, removeDocument, removeTask, saveResource, subscribeStudentData,
  toggleTask, uploadDocument,
} from "./lib/student-data";
import {
  fetchUniversityCoverage, markAllNotificationsRead, markNotificationRead, rankNewsItems,
  saveNews, subscribeNews, subscribeNewsPreferences, subscribeNotifications, subscribeSavedNews,
  syncNotifications, universityIdFor, unsaveNews, updateNewsPreferences,
} from "./lib/news-data";

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

  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsFilters, setNewsFilters] = useState({});
  const [newsRetryToken, setNewsRetryToken] = useState(0);
  const [savedNews, setSavedNews] = useState([]);
  const [newsPreferences, setNewsPreferences] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [sourceHealth, setSourceHealth] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [consent, setConsent] = useState(null);

  // Reminders are created by the API when a task is due. The check runs at sign-in, every 15 minutes, when the
  // window regains focus, and after the task list changes, so a task that becomes due mid-session is reminded
  // without a reload. The server is idempotent per task and due date, so repeated checks never duplicate.
  useEffect(() => {
    if (!auth.user) return undefined;
    const check = () => { syncNotifications().catch(() => {}); };
    check();
    const timer = setInterval(check, 15 * 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [auth.user?.uid]);

  // Consent is loaded before any early return, so every render calls the same hooks in the same order.
  useEffect(() => {
    if (!auth.user) return;
    fetchConsent().then(setConsent).catch(() => setConsent(null));
  }, [auth.user?.uid]);

  useEffect(() => {
    if (!auth.user || tasks.length === 0) return;
    syncNotifications().catch(() => {});
  }, [tasks]);

  useEffect(() => {
    if (!auth.user) return undefined;
    setProfile({ ...emptyProfile, fullName: auth.user.displayName || "" });
    setTasks([]);
    setDocuments([]);
    setSavedResources([]);
    setNewsItems([]);
    setNewsLoading(true);
    setSavedNews([]);
    setNewsPreferences({});
    setNotifications([]);
    setIsAdmin(false);

    const unsubscribers = subscribeStudentData(auth.user.uid, {
      profile: (value) => setProfile({ ...emptyProfile, fullName: auth.user.displayName || "", ...value }),
      tasks: setTasks,
      documents: setDocuments,
      savedResources: setSavedResources,
      error: (error) => setAppError(error?.message || "Could not load your workspace."),
    });

    const stopNews = subscribeNews(
      newsFilters,
      (items, meta) => { setNewsItems(items); setSourceHealth(meta.sourceHealth); setNewsLoading(false); setNewsError(""); },
      (error) => { setNewsLoading(false); setNewsError(error?.message || "Could not load updates."); },
    );
    const stopSavedNews = subscribeSavedNews(auth.user.uid, setSavedNews, () => {});
    const stopPreferences = subscribeNewsPreferences(auth.user.uid, setNewsPreferences, () => {});
    const stopNotifications = subscribeNotifications(auth.user.uid, setNotifications, () => {});

    apiRequest("/api/admin/news/health").then(() => setIsAdmin(true)).catch(() => setIsAdmin(false));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      stopNews();
      stopSavedNews();
      stopPreferences();
      stopNotifications();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, JSON.stringify(newsFilters), newsRetryToken]);

  useEffect(() => {
    const universityId = universityIdFor(profile.university);
    if (!auth.user || !universityId) { setCoverage(null); return; }
    fetchUniversityCoverage(universityId).then(setCoverage).catch(() => setCoverage(null));
  }, [auth.user, profile.university]);

  if (auth.loading) return <div className="app-loading">Preparing GlobeReady…</div>;
  if (!auth.user && !demo) return <LoginPage onDemo={() => setDemo(true)} auth={auth} localUser={localUserMode} demoAvailable={demoMode} />;

  const live = Boolean(auth.user);
  const savedNewsIds = new Set(savedNews.map((item) => item.id));
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const topNews = rankNewsItems(newsItems, profile).slice(0, 2);

  const addTask = async (input) => {
    const details = typeof input === "string" ? { title: input, dueDate: "", priority: "medium" } : input;
    if (live) {
      setAppError("");
      return createTask(auth.user.uid, details).catch((error) => setAppError(error.message));
    }
    setTasks([...tasks, {
      id: crypto.randomUUID(), title: details.title, category: "General",
      priority: details.priority || "medium", dueDate: details.dueDate || "", completed: false,
    }]);
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
      if (!storageAvailable) {
        setAppError("Document uploads are not enabled for this deployment.");
        return;
      }
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
    ? removeDocument(
      auth.user.uid,
      document,
      () => apiRequest(`/api/documents/${document.id}`, { method: "DELETE" }),
    ).catch((error) => setAppError(error.message))
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
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, analysisStatus: "indexing" } : item));
    const analysis = await apiRequest(`/api/documents/${document.id}/index`, { method: "POST" })
      .catch((error) => {
        setDocuments((current) => current.map((item) => item.id === document.id
          ? { ...item, analysisStatus: "index_failed", analysisError: { message: error.message, retryable: true } }
          : item));
        return null;
      });
    if (!analysis) return;
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, analysis, analysisStatus: "indexed" } : item));
  };
  const updateProfile = async (value) => {
    setProfile(value);
    if (!live) return;
    setAppError("");
    await apiRequest("/api/profile", { method: "PUT", body: JSON.stringify(value) })
      .catch((error) => setAppError(error.message));
  };
  const saveConsentChoice = async (choice) => {
    const next = await saveConsent({ version: consent?.version, ...choice });
    setConsent(next);
  };
  const deleteAccount = async () => {
    await deleteAccountWithReauth({
      removeAccount: () => apiRequest("/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }) }),
      hasGoogleProvider: auth.hasGoogleProvider,
      reauthenticateGoogle: auth.reauthenticateGoogle,
    });
    await auth.signOutUser().catch(() => {});
    setDemo(false);
  };
  const signOut = async () => {
    if (live) await auth.signOutUser();
    setSavedResources([]);
    setDemo(false);
  };
  const saveGuide = async (guide) => {
    if (!live) return;
    await saveResource(auth.user.uid, guide);
  };
  const toggleSaveNews = async (item) => {
    if (!live) return;
    try {
      if (savedNewsIds.has(item.id)) await unsaveNews(item.id);
      else await saveNews(item.id);
    } catch (error) {
      setAppError(error.message);
    }
  };
  const updatePreferences = async (input) => {
    if (!live) return;
    try {
      await updateNewsPreferences(input);
    } catch (error) {
      setAppError(error.message);
    }
  };
  const markRead = async (notification) => {
    if (!live) return;
    markNotificationRead(auth.user.uid, notification.id).catch((error) => setAppError(error.message));
  };
  const markAllRead = async () => {
    if (!live) return;
    markAllNotificationsRead(auth.user.uid, notifications).catch((error) => setAppError(error.message));
  };

  return (
    <BrowserRouter>
      {appError && <div className="app-error" role="alert"><span>{appError}</span><button onClick={() => setAppError("")}>Dismiss</button></div>}
      <Routes>
        <Route element={<AppShell onSignOut={signOut} isAdmin={isAdmin} unreadNotifications={unreadNotifications} />}>
          <Route index element={<DashboardPage profile={profile} tasks={tasks} documents={documents} topNews={topNews} unreadNotifications={unreadNotifications} />} />
          <Route path="news" element={(
            <NewsPage
              items={newsItems}
              loading={newsLoading}
              error={newsError}
              onRetry={() => setNewsRetryToken((value) => value + 1)}
              filters={newsFilters}
              onFilterChange={setNewsFilters}
              savedIds={savedNewsIds}
              onToggleSave={toggleSaveNews}
              coverage={coverage}
              sourceHealth={sourceHealth}
              profile={profile}
              preferences={newsPreferences}
              onUpdatePreferences={updatePreferences}
            />
          )} />
          <Route path="documents" element={<DocumentsPage consent={live ? consent : undefined} onSaveConsent={saveConsentChoice} documents={documents} uploadProgress={uploadProgress} storageAvailable={!live || storageAvailable} onAdd={addDocument} onDelete={deleteDocument} onAnalyze={analyzeDocument} />} />
          <Route path="tasks" element={<TasksPage tasks={tasks} onAdd={addTask} onToggle={changeTask} onDelete={deleteTask} />} />
          <Route path="guides" element={<GuidesPage onSave={saveGuide} savedUrls={savedResources.map((resource) => resource.url)} />} />
          <Route path="assistant" element={<AssistantPage documents={documents.filter((document) => document.analysisStatus === "indexed")} />} />
          <Route path="notifications" element={<NotificationsPage notifications={notifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />} />
          <Route path="profile" element={<ProfilePage profile={profile} onSave={updateProfile} />} />
          <Route path="settings" element={(
            <SettingsPage
              live={live}
              consent={live ? consent : undefined}
              onSaveConsent={saveConsentChoice}
              preferences={newsPreferences}
              onUpdatePreferences={updatePreferences}
              onExport={() => apiDownload("/api/account/export", "globeready-account-export.json").catch((error) => setAppError(error.message))}
              onDelete={deleteAccount}
            />
          )} />
          <Route path="admin/news" element={isAdmin ? <NewsAdminPage isAdmin={isAdmin} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
