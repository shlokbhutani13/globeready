import {
  addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";

const consentVersion = "2026-10-13-zero-cost";
const profileFields = [
  "fullName", "homeCountry", "university", "universityId", "officialUniversityDomain",
  "degreeLevel", "program", "visaType", "journeyStage", "startDate", "graduationDate", "timeZone",
];

function pick(input, fields) {
  return Object.fromEntries(fields.flatMap((key) => input?.[key] === undefined ? [] : [[key, input[key]]]));
}

function boundedText(value, max, label) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${label} is invalid.`);
  return text;
}

export function createZeroCostDataStore({ firestore, uid, sdk = {
  addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc,
} }) {
  if (!firestore || typeof uid !== "string" || !uid.trim()) throw new Error("An authenticated student is required.");
  const user = () => sdk.doc(firestore, "users", uid);
  const userCollection = (name) => sdk.collection(firestore, "users", uid, name);
  const timestamp = () => sdk.serverTimestamp();
  return {
    async saveProfile(input = {}) {
      const profile = pick(input, profileFields);
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
      const task = {
        title: boundedText(input.title, 200, "Task title"),
        category: typeof input.category === "string" ? input.category.slice(0, 80) : "General",
        priority: ["low", "medium", "high"].includes(input.priority) ? input.priority : "medium",
        dueDate: typeof input.dueDate === "string" ? input.dueDate : "",
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
      const reference = await sdk.addDoc(userCollection("savedResources"), resource);
      return { id: reference.id, ...resource };
    },
    async replaceDocumentIndex({ id, metadata = {}, chunks = [] }) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(id || "")) throw new Error("Document ID is invalid.");
      if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 100) throw new Error("Document chunks are invalid.");
      const cleanChunks = chunks.map((chunk) => ({
        page: Number.isInteger(chunk.page) && chunk.page > 0 ? chunk.page : 1,
        text: boundedText(chunk.text, 4_000, "Document chunk"),
      }));
      const record = {
        name: boundedText(metadata.name, 200, "Document name"),
        category: typeof metadata.category === "string" ? metadata.category.slice(0, 80) : "Other",
        contentType: metadata.contentType,
        size: metadata.size,
        storageMode: "browser-local",
        analysisStatus: "indexed",
        chunks: cleanChunks,
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
  };
}

export { consentVersion as zeroCostConsentVersion };
