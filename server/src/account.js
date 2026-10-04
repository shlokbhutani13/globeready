export const defaultRecentLoginWindowMs = 5 * 60_000;
export const accountDeletionPhrase = "DELETE MY ACCOUNT";

function pick(record, fields) {
  return Object.fromEntries(fields.filter((field) => record?.[field] !== undefined).map((field) => [field, record[field]]));
}

const profileFields = [
  "fullName", "homeCountry", "university", "universityId", "officialUniversityDomain", "degreeLevel",
  "program", "visaType", "journeyStage", "startDate", "graduationDate", "timeZone", "updatedAt",
];
const preferenceFields = [
  "topics", "visaTypes", "homeCountries", "universityIds", "digestFrequency", "emailRemindersEnabled", "updatedAt",
];
const taskFields = ["id", "title", "category", "priority", "dueDate", "completed", "notes", "createdAt"];
const documentFields = ["id", "name", "category", "contentType", "size", "uploadedAt", "createdAt", "expiresAt", "analysisStatus"];
const notificationFields = ["id", "type", "title", "body", "dueDate", "read", "createdAt"];
const resourceFields = ["id", "title", "url", "category", "source", "createdAt"];
const messageFields = ["role", "text", "documentCitations", "sources", "evidence", "referral", "createdAt"];

export function isRecentSignIn(authTimeSeconds, now, windowMs = defaultRecentLoginWindowMs) {
  if (typeof authTimeSeconds !== "number" || !Number.isFinite(authTimeSeconds)) return false;
  const age = now - authTimeSeconds * 1000;
  return age >= -60_000 && age <= windowMs;
}

export async function exportAccount({ store, uid, now }) {
  const [profile, preferences, tasks, documents, savedNews, resources, notifications, conversations] = await Promise.all([
    store.profiles.get(uid),
    store.newsPreferences.get(uid),
    store.tasks.list(uid),
    store.documents.list(uid),
    store.savedNews.list(uid),
    store.resources.list(uid),
    store.notifications.list(uid),
    store.conversations.list(uid),
  ]);
  const chunks = await store.ragChunks.list(uid);
  const exportedDocuments = [];
  for (const document of documents) {
    const pages = chunks
      .filter((chunk) => chunk.documentId === document.id)
      .map((chunk) => ({ page: chunk.page ?? null, text: chunk.text }));
    exportedDocuments.push({ ...pick(document, documentFields), pages });
  }
  const exportedConversations = [];
  for (const conversation of conversations) {
    const messages = await store.conversationMessages.list(uid, conversation.id);
    exportedConversations.push({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      messages: messages.map((message) => pick(message, messageFields)),
    });
  }
  return {
    schemaVersion: 1,
    exportedAt: new Date(now).toISOString(),
    profile: pick(profile, profileFields),
    preferences: pick(preferences, preferenceFields),
    tasks: tasks.map((task) => pick(task, taskFields)),
    documents: exportedDocuments,
    savedUpdateIds: savedNews.map((item) => item.newsItemId).filter(Boolean),
    savedResources: resources.map((resource) => pick(resource, resourceFields)),
    notifications: notifications.map((notification) => pick(notification, notificationFields)),
    conversations: exportedConversations,
  };
}

async function anonymizeReviewSubmissions(store, uid) {
  const reviews = await store.reviewQueue.listGlobal();
  for (const review of reviews.filter((entry) => entry.submittedBy === uid)) {
    await store.reviewQueue.upsert(review.id, { submittedBy: null });
  }
}

// Deletion order matters: each step is idempotent, so a failed request can be retried safely.
// Storage and Firestore are removed first; the Auth identity is deleted last so a retry can still authenticate.
export async function deleteAccount({ store, uid, deleteStoragePrefix, deleteAuthUser = null }) {
  if (typeof deleteStoragePrefix !== "function") {
    throw Object.assign(new Error("Document storage is not configured; account deletion cannot continue."), {
      code: "account_deletion_unavailable",
      safeMessage: "Account deletion is temporarily unavailable. Your data has not been changed; try again later.",
      status: 503,
    });
  }
  await deleteStoragePrefix(uid);
  await store.purgeUser(uid);
  await anonymizeReviewSubmissions(store, uid);
  if (!deleteAuthUser) return { authIdentity: "not-configured" };
  try {
    await deleteAuthUser(uid);
  } catch (error) {
    // Already removed by an earlier attempt: the outcome is the same, so treat it as success.
    if (error?.code !== "auth/user-not-found") throw error;
  }
  return { authIdentity: "deleted" };
}
