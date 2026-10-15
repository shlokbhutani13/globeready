import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { isCalendarDate } from "./calendar-date";
import { nextTaskFrom, recurrenceValues } from "./recurrence";
import { maxCases, validCase, withEntry, withoutEntry } from "./cases";

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
export const maxLocalDocuments = 50;
const batchSize = 400;

function boundedText(value, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${label} is invalid.`);
  return text;
}

export const trackedDateKinds = ["passport", "visa", "i20-ds2019", "travel-signature", "insurance", "lease", "enrollment", "other"];
export const contactRoles = ["dso", "international-office", "campus-safety", "insurance", "embassy", "personal", "other"];
export const topicChoices = ["general", "status", "forms-fees", "employment", "travel-entry", "taxes-social-security", "emergency", "campus-life", "university"];
export const maxContacts = 50;
export const maxPlannerHave = 200;
export const maxPlannerCustom = 40;

function optionalBounded(value, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

export const linkTypes = ["news", "rule", "case", "date", "guide"];
export const maxTaskLinks = 5;

export function validLinks(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error("Links must be a list.");
  const seen = new Set();
  const links = [];
  for (const link of input) {
    const id = typeof link?.id === "string" ? link.id.trim() : "";
    if (!linkTypes.includes(link?.type) || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u.test(id)) throw new Error("A linked item is not valid.");
    const key = `${link.type}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ type: link.type, id });
  }
  if (links.length > maxTaskLinks) throw new Error(`A task can link up to ${maxTaskLinks} items.`);
  return links;
}

export function validTask(input = {}) {
  const dueDate = typeof input.dueDate === "string" ? input.dueDate.trim() : "";
  if (dueDate && !isCalendarDate(dueDate)) throw new Error("Due date must be a real date (YYYY-MM-DD).");
  const task = {
    title: boundedText(input.title, 200, "Task title"),
    category: typeof input.category === "string" ? input.category.slice(0, 80) : "General",
    priority: ["low", "medium", "high"].includes(input.priority) ? input.priority : "medium",
    dueDate,
  };
  const notes = optionalBounded(input.notes, 1000, "Notes");
  if (notes) task.notes = notes;
  if (input.recurrence && input.recurrence !== "none") {
    if (!recurrenceValues.includes(input.recurrence)) throw new Error("Choose a repeat option from the list.");
    if (!dueDate) throw new Error("A repeating task needs a due date.");
    task.recurrence = input.recurrence;
  }
  const remindOn = typeof input.remindOn === "string" ? input.remindOn.trim() : "";
  if (remindOn) {
    if (!isCalendarDate(remindOn)) throw new Error("Reminder date must be a real date (YYYY-MM-DD).");
    task.remindOn = remindOn;
  }
  const links = validLinks(input.links);
  if (links.length) task.links = links;
  return task;
}

export function validResource(input = {}) {
  let url;
  try { url = new URL(input.url); } catch { throw new Error("Resource URL is invalid."); }
  if (url.protocol !== "https:") throw new Error("Resource URL must use https.");
  if (url.href.length > 500) throw new Error("Resource URL is too long.");
  return {
    title: boundedText(input.title, 200, "Resource title"),
    url: url.href,
    category: typeof input.category === "string" ? input.category.slice(0, 80) : "General",
    source: typeof input.source === "string" ? input.source.slice(0, 200) : "",
  };
}

export function validTrackedDate(input = {}) {
  const date = typeof input.date === "string" ? input.date.trim() : "";
  if (!isCalendarDate(date)) throw new Error("Date must be a real date (YYYY-MM-DD).");
  if (!trackedDateKinds.includes(input.kind)) throw new Error("Choose a valid date type.");
  const remindDays = input.remindDays === undefined ? 30 : input.remindDays;
  if (!Number.isInteger(remindDays) || remindDays < 0 || remindDays > 365) throw new Error("Remind days must be a whole number from 0 to 365.");
  return {
    label: boundedText(input.label, 120, "Label"), kind: input.kind, date,
    notes: optionalBounded(input.notes, 500, "Notes"), remindDays,
  };
}

export function validContact(input = {}) {
  if (!contactRoles.includes(input.role)) throw new Error("Choose a valid contact role.");
  const email = optionalBounded(input.email, 254, "Email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new Error("Enter a valid email address.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new Error("A contact name of 1 to 120 characters is required.");
  return { name, role: input.role, phone: optionalBounded(input.phone, 40, "Phone"), email, notes: optionalBounded(input.notes, 500, "Notes") };
}

export function validPlanner(input = {}) {
  const have = Array.isArray(input.have) ? [...new Set(input.have.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 60))] : [];
  if (have.length > maxPlannerHave) throw new Error(`A checklist can track up to ${maxPlannerHave} items.`);
  const custom = Array.isArray(input.custom) ? input.custom : [];
  if (custom.length > maxPlannerCustom) throw new Error(`You can add up to ${maxPlannerCustom} custom items.`);
  return {
    have,
    custom: custom.map((item) => ({ id: boundedText(item?.id, 60, "Item id"), label: boundedText(item?.label, 120, "Item label"), ...(typeof item?.section === "string" ? { section: item.section.slice(0, 40) } : {}) })),
  };
}

export function validProfileFields(input = {}) {
  const profile = {};
  if (input.topics !== undefined && input.topics !== null) {
    if (!Array.isArray(input.topics)) throw new Error("Topics must be a list.");
    const topics = [...new Set(input.topics)];
    if (topics.some((topic) => !topicChoices.includes(topic))) throw new Error("Choose topics from the list.");
    profile.topics = topics.slice(0, 12);
  }
  for (const [field, max] of Object.entries(profileLimits)) {
    if (input[field] === undefined || input[field] === null) continue;
    const value = String(input[field]).trim();
    if (value.length > max) throw new Error(`${profileLabels[field]} must be ${max} characters or fewer.`);
    profile[field] = value;
  }
  for (const field of profileDates) {
    if (input[field] === undefined || input[field] === null) continue;
    const value = String(input[field]).trim();
    if (value && !isCalendarDate(value)) throw new Error(`${profileLabels[field]} must be a date (YYYY-MM-DD) and must be a real date.`);
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
      const task = { ...validTask(input), completed: false, source: "user", createdAt: timestamp(), updatedAt: timestamp() };
      const reference = await sdk.addDoc(userCollection("tasks"), task);
      return { id: reference.id, ...task };
    },
    async saveResource(input = {}) {
      const resource = { ...validResource(input), createdAt: timestamp(), updatedAt: timestamp() };
      const reference = await sdk.addDoc(userCollection("savedResources"), resource);
      return { id: reference.id, ...resource };
    },
    removeResource(resourceId) {
      if (typeof resourceId !== "string" || !resourceId) throw new Error("Saved resource is invalid.");
      return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "savedResources", resourceId));
    },
    async createTrackedDate(input = {}) {
      const record = { ...validTrackedDate(input), createdAt: timestamp(), updatedAt: timestamp() };
      const reference = await sdk.addDoc(userCollection("trackedDates"), record);
      return { id: reference.id, ...record };
    },
    updateTrackedDate(id, input = {}) {
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "trackedDates", id), { ...validTrackedDate(input), createdAt: input.createdAt, updatedAt: timestamp() });
    },
    removeTrackedDate(id) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "trackedDates", id)); },
    async createContact(input = {}, existingCount = 0) {
      if (existingCount >= maxContacts) throw new Error(`The free beta keeps up to ${maxContacts} contacts. Delete one to add another.`);
      const record = { ...validContact(input), createdAt: timestamp(), updatedAt: timestamp() };
      const reference = await sdk.addDoc(userCollection("contacts"), record);
      return { id: reference.id, ...record };
    },
    updateContact(id, input = {}) {
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "contacts", id), { ...validContact(input), createdAt: input.createdAt, updatedAt: timestamp() });
    },
    removeContact(id) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "contacts", id)); },
    async createCase(input = {}, existingCount = 0) {
      if (existingCount >= maxCases) throw new Error(`The free beta keeps up to ${maxCases} cases. Delete one to add another.`);
      const record = { ...validCase(input), createdAt: timestamp(), updatedAt: timestamp() };
      const reference = await sdk.addDoc(userCollection("cases"), record);
      return { id: reference.id, ...record };
    },
    updateCase(id, input = {}) {
      if (typeof id !== "string" || !id) throw new Error("Case is invalid.");
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "cases", id), { ...validCase(input), createdAt: input.createdAt, updatedAt: timestamp() });
    },
    // Adds one history entry (and any status it implies) to a case in a single write.
    addCaseEntry(record = {}, entry = {}) {
      if (typeof record.id !== "string" || !record.id) throw new Error("Case is invalid.");
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "cases", record.id), { ...withEntry(record, entry), createdAt: record.createdAt, updatedAt: timestamp() });
    },
    removeCaseEntry(record = {}, index) {
      if (typeof record.id !== "string" || !record.id) throw new Error("Case is invalid.");
      return sdk.setDoc(sdk.doc(firestore, "users", uid, "cases", record.id), { ...withoutEntry(record, index), createdAt: record.createdAt, updatedAt: timestamp() });
    },
    removeCase(id) { return sdk.deleteDoc(sdk.doc(firestore, "users", uid, "cases", id)); },
    async savePlanner(plannerId, input = {}) {
      if (!["journey", "travel"].includes(plannerId)) throw new Error("Unknown planner.");
      const value = validPlanner(input);
      await sdk.setDoc(sdk.doc(firestore, "users", uid, "planner", plannerId), { ...value, updatedAt: timestamp() });
      return value;
    },
    subscribeRecords(name, onList, onError) {
      return sdk.onSnapshot(userCollection(name), (snapshot) => onList(snapshot.docs.map((item) => ({ id: item.id, ...(item.data ? item.data() : {}) }))), onError);
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
    // Rewrites the whole task so cleared optional fields disappear. Creation time, source and completion are kept.
    async updateTask(task = {}, input = {}) {
      if (typeof task.id !== "string" || !task.id) throw new Error("Task is invalid.");
      const fields = validTask(input);
      await sdk.setDoc(sdk.doc(firestore, "users", uid, "tasks", task.id), {
        ...fields, completed: task.completed === true, source: "user", createdAt: task.createdAt, updatedAt: timestamp(),
      });
      return { id: task.id, ...fields };
    },
    // Completing a repeating task also creates the next one. Reopening a task never does.
    async completeTask(task = {}) {
      if (typeof task.id !== "string" || !task.id) throw new Error("Task is invalid.");
      await sdk.updateDoc(sdk.doc(firestore, "users", uid, "tasks", task.id), { completed: !task.completed, updatedAt: timestamp() });
      const next = task.completed ? null : nextTaskFrom(task);
      if (!next) return { nextId: null };
      try {
        const created = await sdk.addDoc(userCollection("tasks"), { ...validTask(next), completed: false, source: "user", createdAt: timestamp(), updatedAt: timestamp() });
        return { nextId: created.id, next };
      } catch (reason) {
        throw new Error(`Marked done, but the next repeat could not be created: ${reason?.message || "try adding it again"}`);
      }
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
