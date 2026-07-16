import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, updateDoc,
} from "firebase/firestore";
import { deleteObject, ref, uploadBytesResumable } from "firebase/storage";
import { db, storage } from "./firebase";

export function sanitizeFilename(name) {
  const parts = name.split(".");
  const extension = parts.length > 1 ? `.${parts.pop().replace(/[^a-z0-9]/gi, "")}` : "";
  const base = parts.join(".").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
  return `${base || "document"}${extension.toLowerCase()}`;
}

export function documentStoragePath(uid, documentId, filename) {
  return `users/${uid}/documents/${documentId}/${sanitizeFilename(filename)}`;
}

export function subscribeStudentData(uid, handlers) {
  const userRef = doc(db, "users", uid);
  const tasksRef = query(collection(db, "users", uid, "tasks"), orderBy("createdAt", "desc"));
  const docsRef = query(collection(db, "users", uid, "documents"), orderBy("uploadedAt", "desc"));
  const onError = (error) => handlers.error?.(error);
  return [
    onSnapshot(userRef, (snapshot) => handlers.profile(snapshot.exists() ? snapshot.data() : {}), onError),
    onSnapshot(tasksRef, (snapshot) => handlers.tasks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError),
    onSnapshot(docsRef, (snapshot) => handlers.documents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), onError),
  ];
}

export function saveProfile(uid, profile) {
  return setDoc(doc(db, "users", uid), { ...profile, updatedAt: serverTimestamp() }, { merge: true });
}

export function createTask(uid, title) {
  return addDoc(collection(db, "users", uid, "tasks"), {
    title, category: "General", priority: "medium", dueDate: "", completed: false,
    source: "user", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export function toggleTask(uid, task) {
  return updateDoc(doc(db, "users", uid, "tasks", task.id), {
    completed: !task.completed, updatedAt: serverTimestamp(),
  });
}

export function removeTask(uid, id) {
  return deleteDoc(doc(db, "users", uid, "tasks", id));
}

export async function uploadDocument(uid, file, onProgress = () => {}) {
  const documentRef = doc(collection(db, "users", uid, "documents"));
  const storagePath = documentStoragePath(uid, documentRef.id, file.name);
  const task = uploadBytesResumable(ref(storage, storagePath), file, { contentType: file.type });
  await new Promise((resolve, reject) => task.on("state_changed", (snapshot) => {
    onProgress(Math.round(snapshot.bytesTransferred / snapshot.totalBytes * 100));
  }, reject, resolve));
  const metadata = {
    name: file.name, category: "Other", contentType: file.type, size: file.size,
    storagePath, storageMode: "firebase", analysisStatus: "not_requested",
    uploadedAt: serverTimestamp(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(documentRef, metadata);
  } catch (error) {
    await deleteObject(ref(storage, storagePath)).catch(() => {});
    throw error;
  }
  return { id: documentRef.id, ...metadata };
}

export async function removeDocument(uid, document) {
  if (document.storagePath) await deleteObject(ref(storage, document.storagePath)).catch((error) => {
    if (error?.code !== "storage/object-not-found") throw error;
  });
  await deleteDoc(doc(db, "users", uid, "documents", document.id));
}
