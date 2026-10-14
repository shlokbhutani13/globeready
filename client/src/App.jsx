import React, { useEffect, useMemo, useRef, useState } from "react";
import { friendlyError } from "./lib/friendly-error";
import { createReminderReadStore, deriveReminders } from "./lib/reminders";
import { deriveDateReminders, upcomingDates } from "./lib/key-dates";
import { useZeroCostRecords } from "./lib/use-zero-cost-records";
import { buildIcs, downloadIcs } from "./lib/ics";
import { tasksFromItems } from "./lib/planner";
import { guides } from "./data/guides";
import KeyDatesPage from "./pages/KeyDatesPage";
import ContactsPage from "./pages/ContactsPage";
import JourneyPage from "./pages/JourneyPage";
import TravelPage from "./pages/TravelPage";
import SearchPage from "./pages/SearchPage";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentsPage from "./pages/DocumentsPage";
import TasksPage from "./pages/TasksPage";
import GuidesPage from "./pages/GuidesPage";
import RulesPage from "./pages/RulesPage";
import AssistantPage from "./pages/AssistantPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import NewsPage from "./pages/NewsPage";
import NotificationsPage from "./pages/NotificationsPage";
import NewsAdminPage from "./pages/NewsAdminPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import { useAuth } from "./lib/auth-context";
import { apiDownload, apiRequest } from "./lib/api";
import { deleteAccountWithReauth } from "./lib/account-deletion";
import { fetchConsent, saveConsent } from "./lib/consent";
import { db, demoMode, localUserMode, storageAvailable, zeroCostPublicMode } from "./lib/firebase";
import {
  createTask, removeDocument, removeTask, saveResource, subscribeStudentData,
  toggleTask, uploadDocument,
} from "./lib/student-data";
import {
  fetchCoverageLedger, fetchNewsDigests, fetchUniversityCoverage, markAllNotificationsRead, markNotificationRead, rankNewsItems,
  saveNews, subscribeNews, subscribeNewsPreferences, subscribeNotifications, subscribeSavedNews,
  syncNotifications, universityIdFor, unsaveNews, updateNewsPreferences,
} from "./lib/news-data";
import { createZeroCostDataStore, nextDocumentSlot } from "./lib/zero-cost-data";
import { extractLocalDocument } from "./lib/local-documents/extract";
import { loadStaticCoverage, subscribeStaticNews } from "./lib/static-news";
import { deleteZeroCostAccount, downloadZeroCostExport, exportZeroCostAccount } from "./lib/zero-cost-account";

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
const zeroCostConsentText = {
  documents: "GlobeReady extracts text on this device, then saves only the text and document metadata to your account.",
  aiGeneration: "Cloud AI is unavailable in the free public beta. Ask GlobeReady uses deterministic passage matching in your browser.",
  withdraw: "You can turn document reading off at any time. Ask stops searching your saved text immediately, and you can delete all saved document text from the Vault.",
};

export default function App() {
  const auth = useAuth();
  const [demo, setDemo] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [tasks, setTasks] = useState(initialTasks);
  const [documents, setDocuments] = useState(initialDocuments);
  const [savedResources, setSavedResources] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  // Browser-only processing state for the zero-cost beta: { percent, label } while a file is being read.
  const [processing, setProcessing] = useState(null);
  const processingController = useRef(null);
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
  const [coverageLedger, setCoverageLedger] = useState(null);
  const [newsDigests, setNewsDigests] = useState([]);
  const [sourceHealth, setSourceHealth] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [consent, setConsent] = useState(null);
  const guideKey = `globeready:getting-started:${auth.user?.uid || "demo"}`;
  const [showGettingStarted, setShowGettingStarted] = useState(() => localStorage.getItem("globeready:getting-started:demo") !== "dismissed");

  useEffect(() => { setShowGettingStarted(localStorage.getItem(guideKey) !== "dismissed"); }, [guideKey]);
  const dismissGettingStarted = () => { localStorage.setItem(guideKey, "dismissed"); setShowGettingStarted(false); };

  // Reminders are created by the API when a task is due. The check runs at sign-in, every 15 minutes, when the
  // window regains focus, and after the task list changes, so a task that becomes due mid-session is reminded
  // without a reload. The server is idempotent per task and due date, so repeated checks never duplicate.
  useEffect(() => {
    if (!auth.user || zeroCostPublicMode) return undefined;
    const check = () => { syncNotifications().catch(() => {}); };
    check();
    const timer = setInterval(check, 15 * 60_000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [auth.user?.uid]);

  // Free beta: reminders are worked out in this browser from the student's own tasks. They exist only while the app
  // is open (checked every 15 minutes and when the window regains focus); nothing runs in the background and nothing
  // is sent by email or push. Read state is kept on this device only.
  const [reminderClock, setReminderClock] = useState(() => new Date());
  const [readReminderIds, setReadReminderIds] = useState(() => new Set());
  useEffect(() => {
    if (!auth.user || !zeroCostPublicMode) return undefined;
    setReadReminderIds(createReminderReadStore(auth.user.uid).read());
    const tick = () => setReminderClock(new Date());
    const timer = setInterval(tick, 15 * 60_000);
    window.addEventListener("focus", tick);
    return () => { clearInterval(timer); window.removeEventListener("focus", tick); };
  }, [auth.user?.uid]);
  const records = useZeroCostRecords({ firestore: db, uid: auth.user?.uid, enabled: Boolean(auth.user) && zeroCostPublicMode, onError: (error) => setAppError(friendlyError(error)) });
  const localReminders = useMemo(
    () => (zeroCostPublicMode
      ? [...deriveReminders(tasks, reminderClock), ...deriveDateReminders(records.dates, reminderClock)].map((reminder) => ({ ...reminder, read: readReminderIds.has(reminder.id) }))
      : []),
    [tasks, records.dates, reminderClock, readReminderIds],
  );

  // Consent is loaded before any early return, so every render calls the same hooks in the same order.
  useEffect(() => {
    if (!auth.user) return;
    if (zeroCostPublicMode) return;
    fetchConsent().then(setConsent).catch(() => setConsent(null));
  }, [auth.user?.uid]);

  useEffect(() => {
    if (!auth.user || zeroCostPublicMode || tasks.length === 0) return;
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
    setCoverageLedger(null);
    setNewsDigests([]);
    setIsAdmin(false);

    const unsubscribers = subscribeStudentData(auth.user.uid, {
      profile: (value) => {
        const { consent: storedConsent, ...profileValue } = value;
        setProfile({ ...emptyProfile, fullName: auth.user.displayName || "", ...profileValue });
        if (zeroCostPublicMode) setConsent({ documents: false, aiGeneration: false, ...storedConsent, text: zeroCostConsentText });
      },
      tasks: setTasks,
      documents: setDocuments,
      savedResources: setSavedResources,
      error: (error) => setAppError(friendlyError(error, "Could not load your workspace.")),
    });

    const stopNews = (zeroCostPublicMode ? subscribeStaticNews : subscribeNews)(
      newsFilters,
      (items, meta) => { setNewsItems(items); setSourceHealth(meta.sourceHealth); setNewsLoading(false); setNewsError(""); },
      (error) => { setNewsLoading(false); setNewsError(error?.message || "Could not load updates."); },
    );
    const stopSavedNews = zeroCostPublicMode
      ? createZeroCostDataStore({ firestore: db, uid: auth.user.uid }).subscribeSavedNewsIds((ids) => setSavedNews(ids.map((id) => ({ id }))), () => {})
      : subscribeSavedNews(auth.user.uid, setSavedNews, () => {});
    const stopPreferences = zeroCostPublicMode ? () => {} : subscribeNewsPreferences(auth.user.uid, setNewsPreferences, () => {});
    const stopNotifications = zeroCostPublicMode ? () => {} : subscribeNotifications(auth.user.uid, setNotifications, () => {});

    if (zeroCostPublicMode) {
      loadStaticCoverage().then(setCoverageLedger).catch(() => setCoverageLedger(null));
    } else {
      apiRequest("/api/admin/news/health").then(() => setIsAdmin(true)).catch(() => setIsAdmin(false));
      fetchCoverageLedger().then(setCoverageLedger).catch(() => setCoverageLedger(null));
      fetchNewsDigests().then((items) => setNewsDigests(Array.isArray(items) ? items : [])).catch(() => setNewsDigests([]));
    }

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
    if (!auth.user || zeroCostPublicMode || !universityId) { setCoverage(null); return; }
    fetchUniversityCoverage(universityId).then(setCoverage).catch(() => setCoverage(null));
  }, [auth.user, profile.university]);

  if (auth.loading) return <div className="app-loading">Preparing GlobeReady…</div>;
  if (!auth.user && !demo) return <LoginPage onDemo={() => setDemo(true)} auth={auth} localUser={localUserMode} demoAvailable={demoMode} zeroCost={zeroCostPublicMode} />;
  // The zero-cost rules accept writes only from verified email addresses (Google accounts arrive verified).
  if (auth.user && zeroCostPublicMode && !auth.emailVerified) return <VerifyEmailPage auth={auth} />;

  const live = Boolean(auth.user);
  const zeroCostStore = live && zeroCostPublicMode ? createZeroCostDataStore({ firestore: db, uid: auth.user.uid }) : null;
  const keyDateUpcoming = zeroCostPublicMode ? upcomingDates(records.dates, reminderClock) : [];
  // Tasks created from a template, always through the same validated path as a task typed by hand.
  const addTasksFromItems = async (items, { dueDate } = {}) => {
    if (!zeroCostStore) throw new Error("Sign in to add tasks.");
    const planned = tasksFromItems(items, tasks, profile, { dueDate });
    for (const details of planned) await zeroCostStore.createTask(details);
    const ids = items.filter((item) => item.id).map((item) => item.id);
    if (ids.length && planned.length) {
      const journey = records.planner.journey;
      await zeroCostStore.savePlanner("journey", { have: [...new Set([...journey.have, ...ids])], custom: journey.custom });
    }
    return planned.length;
  };
  const exportCalendar = () => {
    const result = buildIcs({ tasks, dates: zeroCostPublicMode ? records.dates : [] });
    if (result.count === 0) { setAppError("There is nothing to export yet. Add a due date to a task or a key date first."); return; }
    setAppError("");
    downloadIcs(result);
  };
  const restoreContext = zeroCostStore ? {
    uid: auth.user.uid,
    store: zeroCostStore,
    existing: {
      profile, tasks, savedResources, savedNews: savedNews.map((entry) => entry.id), trackedDates: records.dates, contacts: records.contacts, planner: records.planner,
    },
  } : undefined;
  const savedNewsIds = new Set(savedNews.map((item) => item.id));
  const shownNotifications = zeroCostPublicMode ? localReminders : notifications;
  const unreadNotifications = shownNotifications.filter((notification) => !notification.read).length;
  const topNews = rankNewsItems(newsItems, profile).slice(0, 2);
  // Ask searches stored text only while document reading is on; withdrawing consent stops it immediately.
  const localChunks = zeroCostPublicMode && consent?.documents === true
    ? documents.flatMap((document) => (document.chunks || []).map((chunk) => ({ ...chunk, documentId: document.id, documentName: document.name })))
    : [];

  const addTask = async (input) => {
    const details = typeof input === "string" ? { title: input, dueDate: "", priority: "medium" } : input;
    if (live) {
      setAppError("");
      if (zeroCostStore) return zeroCostStore.createTask(details).catch((error) => setAppError(friendlyError(error)));
      return createTask(auth.user.uid, details).catch((error) => setAppError(friendlyError(error)));
    }
    setTasks([...tasks, {
      id: crypto.randomUUID(), title: details.title, category: "General",
      priority: details.priority || "medium", dueDate: details.dueDate || "", completed: false,
    }]);
  };
  const changeTask = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    if (live) return (zeroCostStore ? zeroCostStore.toggleTask(task) : toggleTask(auth.user.uid, task)).catch((error) => setAppError(friendlyError(error)));
    setTasks(tasks.map((item) => item.id === id ? { ...item, completed: !item.completed } : item));
  };
  const deleteTask = async (id) => live
    ? (zeroCostStore ? zeroCostStore.removeTask(id) : removeTask(auth.user.uid, id)).catch((error) => setAppError(friendlyError(error)))
    : setTasks(tasks.filter((task) => task.id !== id));
  const addDocument = async (file) => {
    if (live) {
      setAppError("");
      if (zeroCostStore) {
        if (processingController.current) return;
        const controller = new AbortController();
        processingController.current = controller;
        setProcessing({ percent: 0, label: "Starting" });
        try {
          const id = nextDocumentSlot(documents.map((document) => document.id));
          await extractLocalDocument(file, {
            id,
            signal: controller.signal,
            onProgress: (update) => setProcessing((current) => (current ? update : current)),
            persist: (result) => zeroCostStore.saveLocalDocument(result),
          });
        } catch (error) {
          if (error?.name !== "AbortError") setAppError(friendlyError(error));
        } finally {
          processingController.current = null;
          setProcessing(null);
        }
        return;
      }
      if (!storageAvailable) {
        setAppError("Document uploads are not enabled for this deployment.");
        return;
      }
      setUploadProgress(1);
      try {
        await uploadDocument(auth.user.uid, file, setUploadProgress);
      } catch (error) {
        setAppError(friendlyError(error));
      }
      finally { setTimeout(() => setUploadProgress(0), 500); }
    } else {
      setDocuments([...documents, { id: crypto.randomUUID(), name: file.name, category: "Other", storageMode: "safe demo metadata" }]);
    }
  };
  const cancelProcessing = () => processingController.current?.abort();
  const deleteAllDocumentText = async () => {
    if (!zeroCostStore) return;
    setAppError("");
    await zeroCostStore.removeAllLocalDocuments().catch((error) => setAppError(friendlyError(error)));
  };
  const deleteDocument = async (document) => live
    ? (zeroCostStore ? zeroCostStore.removeLocalDocument(document.id) : removeDocument(
      auth.user.uid,
      document,
      () => apiRequest(`/api/documents/${document.id}`, { method: "DELETE" }),
    )).catch((error) => setAppError(friendlyError(error)))
    : setDocuments(documents.filter((item) => item.id !== document.id));
  const analyzeDocument = async (document) => {
    if (zeroCostStore) return;
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
    const failed = (error) => { setAppError(friendlyError(error)); return false; };
    if (zeroCostStore) return zeroCostStore.saveProfile(value).then(() => true, failed);
    return apiRequest("/api/profile", { method: "PUT", body: JSON.stringify(value) }).then(() => true, failed);
  };
  const saveConsentChoice = async (choice) => {
    if (zeroCostStore) {
      const next = await zeroCostStore.saveConsent(choice);
      setConsent({ ...next, text: zeroCostConsentText });
      return;
    }
    const next = await saveConsent({ version: consent?.version, ...choice });
    setConsent(next);
  };
  const deleteAccount = async ({ password = "" } = {}) => {
    if (zeroCostPublicMode) {
      // Identity is confirmed first (inside the click, so a Google pop-up is allowed); nothing is deleted before that.
      await deleteZeroCostAccount({
        firestore: db,
        uid: auth.user.uid,
        reauthenticate: () => auth.reauthenticateForDeletion(password),
        deleteIdentity: auth.deleteCurrentUser,
      });
    } else {
      await deleteAccountWithReauth({
        removeAccount: () => apiRequest("/api/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE MY ACCOUNT" }) }),
        hasGoogleProvider: auth.hasGoogleProvider,
        reauthenticateGoogle: auth.reauthenticateGoogle,
      });
    }
    await auth.signOutUser().catch(() => {});
    setDemo(false);
  };
  const exportAccount = async () => {
    if (!zeroCostPublicMode) return apiDownload("/api/account/export", "globeready-account-export.json");
    const archive = await exportZeroCostAccount({ firestore: db, uid: auth.user.uid });
    downloadZeroCostExport(archive);
  };
  const signOut = async () => {
    if (live) await auth.signOutUser();
    setSavedResources([]);
    setDemo(false);
  };
  const saveGuide = async (guide) => {
    if (!live) return;
    await (zeroCostStore ? zeroCostStore.saveResource(guide) : saveResource(auth.user.uid, guide));
  };
  const toggleSaveNews = async (item) => {
    if (!live) return;
    try {
      if (zeroCostStore) {
        if (savedNewsIds.has(item.id)) await zeroCostStore.unsaveNews(item.id);
        else await zeroCostStore.saveNews(item.id);
      } else if (savedNewsIds.has(item.id)) await unsaveNews(item.id);
      else await saveNews(item.id);
    } catch (error) {
      setAppError(friendlyError(error));
    }
  };
  const updatePreferences = async (input) => {
    if (!live || zeroCostPublicMode) return;
    try {
      await updateNewsPreferences(input);
    } catch (error) {
      setAppError(friendlyError(error));
    }
  };
  const markRead = async (notification) => {
    if (zeroCostPublicMode) {
      setReadReminderIds(createReminderReadStore(auth.user.uid).markRead([notification.id]));
      return;
    }
    if (!live) return;
    markNotificationRead(auth.user.uid, notification.id).catch((error) => setAppError(friendlyError(error)));
  };
  const markAllRead = async () => {
    if (zeroCostPublicMode) {
      setReadReminderIds(createReminderReadStore(auth.user.uid).markRead(localReminders.map((reminder) => reminder.id)));
      return;
    }
    if (!live) return;
    markAllNotificationsRead(auth.user.uid, notifications).catch((error) => setAppError(friendlyError(error)));
  };

  return (
    <BrowserRouter>
      {appError && <div className="app-error" role="alert"><span>{appError}</span><button onClick={() => setAppError("")}>Dismiss</button></div>}
      <Routes>
        <Route element={<AppShell onSignOut={signOut} isAdmin={isAdmin} unreadNotifications={unreadNotifications} zeroCostMode={zeroCostPublicMode} />}>
          <Route index element={<DashboardPage zeroCostMode={zeroCostPublicMode} keyDates={keyDateUpcoming} profile={profile} tasks={tasks} topNews={topNews} unreadNotifications={unreadNotifications} onToggleTask={changeTask} showGettingStarted={showGettingStarted} onDismissGettingStarted={dismissGettingStarted} />} />
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
              coverageLedger={coverageLedger}
              sourceHealth={sourceHealth}
              profile={profile}
              preferences={newsPreferences}
              digests={newsDigests}
              onUpdatePreferences={updatePreferences}
              zeroCostMode={zeroCostPublicMode}
            />
          )} />
          <Route path="news/:id" element={<NewsDetailPage profile={profile} items={newsItems} loading={newsLoading} error={newsError} localMode={zeroCostPublicMode} />} />
          <Route path="documents" element={<DocumentsPage localProcessing={live && zeroCostPublicMode} processing={processing} onCancelProcessing={cancelProcessing} onDeleteAllText={deleteAllDocumentText} consent={live ? consent : undefined} onSaveConsent={saveConsentChoice} documents={documents} uploadProgress={uploadProgress} storageAvailable={!live || storageAvailable} onAdd={addDocument} onDelete={deleteDocument} onAnalyze={analyzeDocument} />} />
          <Route path="tasks" element={<TasksPage zeroCostMode={zeroCostPublicMode} tasks={tasks} onAdd={addTask} onToggle={changeTask} onDelete={deleteTask} onExportCalendar={exportCalendar} />} />
          <Route path="search" element={<SearchPage news={newsItems} newsLoading={newsLoading} guides={guides} tasks={tasks} documents={documents} />} />
          {zeroCostPublicMode && live && <>
            <Route path="journey" element={<JourneyPage profile={profile} tasks={tasks} added={records.planner.journey.have} onAddTasks={addTasksFromItems} />} />
            <Route path="dates" element={<KeyDatesPage dates={records.dates} onCreate={(input) => zeroCostStore.createTrackedDate(input)} onUpdate={(entry, input) => zeroCostStore.updateTrackedDate(entry.id, { ...input, createdAt: entry.createdAt })} onRemove={(id) => zeroCostStore.removeTrackedDate(id)} onExportCalendar={exportCalendar} now={reminderClock} />} />
            <Route path="travel" element={<TravelPage have={records.planner.travel.have} custom={records.planner.travel.custom} onSaveChecklist={(value) => zeroCostStore.savePlanner("travel", value)} onAddTasks={addTasksFromItems} />} />
            <Route path="contacts" element={<ContactsPage contacts={records.contacts} onCreate={(input, count) => zeroCostStore.createContact(input, count)} onUpdate={(entry, input) => zeroCostStore.updateContact(entry.id, { ...input, createdAt: entry.createdAt })} onRemove={(id) => zeroCostStore.removeContact(id)} />} />
          </>}
          <Route path="rules" element={<RulesPage profile={profile} onAddTasks={zeroCostStore ? addTasksFromItems : undefined} />} />
          <Route path="guides" element={<GuidesPage onSave={saveGuide} onRemove={zeroCostStore ? (id) => zeroCostStore.removeResource(id) : undefined} savedResources={savedResources} savedUrls={savedResources.map((resource) => resource.url)} />} />
          <Route path="assistant" element={<AssistantPage localMode={zeroCostPublicMode} documentsAllowed={!zeroCostPublicMode || consent?.documents === true} localChunks={localChunks} documents={documents.filter((document) => document.analysisStatus === "indexed")} />} />
          <Route path="notifications" element={<NotificationsPage localMode={zeroCostPublicMode} notifications={shownNotifications} onMarkRead={markRead} onMarkAllRead={markAllRead} />} />
          <Route path="profile" element={<ProfilePage profile={profile} onSave={updateProfile} showTopics={zeroCostPublicMode} />} />
          <Route path="settings" element={(
            <SettingsPage
              live={live}
              consent={live ? consent : undefined}
              onSaveConsent={saveConsentChoice}
              preferences={newsPreferences}
              onUpdatePreferences={updatePreferences}
              onExport={() => exportAccount().catch((error) => setAppError(friendlyError(error)))}
              onDelete={deleteAccount}
              onShowGettingStarted={() => setShowGettingStarted(true)}
              zeroCostMode={zeroCostPublicMode}
              restore={restoreContext}
              signInProviders={live && zeroCostPublicMode ? auth.signInProviders() : []}
            />
          )} />
          <Route path="admin/news" element={isAdmin ? <NewsAdminPage isAdmin={isAdmin} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
