import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";

// Direct Firestore access for the zero-cost beta. Every write mirrors firestore.zero-cost.rules, and the checks here
// exist so a student sees a clear message instead of a generic permission error.

const consentVersion = "2026-10-14-zero-cost";
const profileLimits = {
  fullName: 200, homeCountry: 100, university: 200, universityId: 120, officialUniversityDomain: 253, degreeLevel: 80,
  program: 200, visaType: 40, journeyStage: 80, timeZone: 64,
};
const profileDates = ["startDate", "graduationDate"];
const profileLabels = {
  fullName: "Full name", homeCountry: "Home country", university: "University", universityId: "University ID",
  officialUniversityDomain: "University website", degreeLevel: "Degree level", program: "Program", visaType: "Visa type",
  journeyStage: "Journey stage", timeZone: "Time zone", startDate: "Start date", graduationDate: "Graduation date",
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
export const maxLocalDocuments = 50;
const batchSize = 400;

function boundedText(value, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${label} is invalid.`);
  return text;
}

export function validProfileFields(input = {}) {
  const profile = {};
  for (const [field, max] of Object.entries(profileLimits)) {
    if (input[field] === undefined || input[field] === null) continue;
    const value = String(input[field]).trim();
    if (value.length > max) throw new Error(`${profileLabels[field]} must be ${max} characters or fewer.`);
    profile[field] = value;
  }
  for (const field of profileDates) {
    if (input[field] === undefined || input[field] === null) continue;
    const value = String(input[field]).trim();
    if (value && !datePattern.test(value)) throw new Error(`${profileLabels[field]} must be a date (YYYY-MM-DD).`);
    profile[field] = value;
  }
  return profile;
}

// Stored extracted text uses 50 fixed slots (doc-00 to doc-49), which the rules enforce as a per-account cap.
export function nextDocumentSlot(existingIds = []) {
  const used = new Set(existingIds);
  for (let slot = 0; slot < maxLocalDocuments; slot += 1) {
    const id = `doc-${String(slot).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  throw new Error(`The free beta keeps up to ${maxLocalDocuments} documents. Delete one you no longer need to add another.`);
}

const defaultSdk = {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, writeBatch,
};

export function createZeroCostDataStore({ firestore, uid, sdk = defaultSdk }) {
  if (!firestore || typeof uid !== "string" || !uid.trim()) throw new Error("An authenticated student is required.");
  const user = () => sdk.doc(firestore, "users", uid);
  const userCollection = (name) => sdk.collection(firestore, "users", uid, name);
  const timestamp = () => sdk.serverTimestamp();

  async function deleteAllIn(name) {
    let removed = 0;
    for (let round = 0; round < 1_000; round += 1) {
      const snapshot = await sdk.getDocs(sdk.query(userCollection(name), sdk.limit(batchSize)));
      if (!snapshot.docs.length) return removed;
      const batch = sdk.writeBatch(firestore);
      snapshot.docs.forEach((item) => batch.delete(sdk.doc(firestore, "users", uid, name, item.id)));
      await batch.commit();
      removed += snapshot.docs.length;
    }
    throw new Error("Deletion did not finish. Try again.");
  }

  return {
    async saveProfile(input = {}) {
      const profile = validProfileFields(input);
      await sdk.setDoc(user(), { ...profile, updatedAt: timestamp() }, { merge: true });
      return profile;
    },
    async saveConsent(choice = {}) {
      const consent = {
        version: consentVersion,
        documents: choice.documents === true,
        aiGeneration: false,
        acceptedAt: timestamp(),
      };
      await sdk.setDoc(user(), { consent, updatedAt: timestamp() }, { merge: true });
      return consent;
    },
    async createTask(input = {}) {
      const dueDate = typeof input.dueDate === "string" ? input.dueDate.trim() : "";
      if (dueDate && !datePattern.test(dueDate)) throw new Error("Due date must be a date (YYYY-MM-DD).");
      const task = {
        title: boundedText(input.title, 200, "Task title"),
        category: typeof input.category === "string" ? input.category.slice(0, 80) : "General",
        priority: ["low", "medium", "high"].includes(input.priority) ? input.priority : "medium",
        dueDate,
        completed: false,
        source: "user",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      const reference = await sdk.addDoc(userCollection("tasks"), task);
      return { id: reference.id, ...task };
    },
    async saveResource(input = {}) {
      const url = new URL(input.url);
      if (url.protocol !== "https:") throw new Error("Resource URL must use https.");
      const resource = {
        title: boundedText(input.title, 200, "Resource title"),
        url: url.href,
        category: typeof input.category === "string" ? input.category.slice(0, 80) : "General",
        source: typeof input.source === "string" ? input.source.slice(0, 200) : "",
        createdAt: timestamp(),
        updatedAt: timestamp(),
      };
      if (resource.url.length > 500) throw new Error("Resource URL is too long.");
      const reference = await sdk.addDoc(userCollection("savedResources"), resource);
      return { id: reference.id, ...resource };
    },
    async saveLocalDocument({ id, metadata = {}, chunks = [], pageCount, pagesWithText }) {
      if (!/^doc-[0-4]\d$/u.test(id || "")) throw new Error("Document slot is invalid.");
      if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 400) throw new Error("Document passages are invalid.");
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 100) throw new Error("Document page count is invalid.");
      if (!Number.isInteger(pagesWithText) || pagesWithText < 1 || pagesWithText > pageCount) throw new Error("Document page count is invalid.");
      const cleanChunks = chunks.map((chunk) => ({
        page: Number.isInteger(chunk.page) && chunk.page > 0 ? chunk.page : 1,
        text: boundedText(chunk.text, 1_500, "Document passage"),
      }));
      const record = {
        name: boundedText(metadata.name, 200, "Document name"),
        category: typeof metadata.category === "string" ? metadata.category.slice(0, 80) : "Other",
        contentType: metadata.contentType,
        size: metadata.size,
        storageMode: "browser-local",
        analysisStatus: "indexed",
        chunks: cleanChunks,
        pageCount,
        pagesWithText,
        uploadedAt: timestamp(), createdAt: timestamp(), updatedAt: timestamp(),
      };
      await sdk.setDoc(sdk.doc(firestore, "users", uid, "documents", id), record);
      return { id, ...record };
    },
    toggleTask(task) {
      return sdk.updateDoc(sdk.doc(firestore, "users", uid, "tasks", task.id), {
        completed: !task.completed, updatedAt: timestamp(),
      });
    },
    removeTask(id) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "tasks", id)); },
    removeLocalDocument(id) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "documents", id)); },
    // Removes all stored extracted text in repeated batches, for students who withdraw document consent.
    removeAllLocalDocuments() { return deleteAllIn("documents"); },
    saveNews(newsItemId) {
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "savedNews", newsItemId), { newsItemId, createdAt: timestamp() });
    },
    unsaveNews(newsItemId) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "savedNews", newsItemId)); },
    subscribeSavedNewsIds(onIds, onError) {
      return sdk.onSnapshot(userCollection("savedNews"), (snapshot) => onIds(snapshot.docs.map((item) => item.id)), onError);
    },
  };
}

export { consentVersion as zeroCostConsentVersion };
