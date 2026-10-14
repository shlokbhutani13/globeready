import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, writeBatch,
} from "firebase/firestore";

const collections = ["tasks", "documents", "savedResources"];
const maxRecordsPerCollection = 500;
const maxExportBytes = 10 * 1024 * 1024;
const defaultSdk = { collection, deleteDoc, doc, getDoc, getDocs, limit, query, writeBatch };

function requireAccount(firestore, uid) {
  if (!firestore || typeof uid !== "string" || !uid.trim()) throw new Error("An authenticated student is required.");
}

async function readCollection(firestore, uid, name, sdk) {
  const snapshot = await sdk.getDocs(sdk.query(sdk.collection(firestore, "users", uid, name), sdk.limit(maxRecordsPerCollection + 1)));
  if (snapshot.docs.length > maxRecordsPerCollection) throw new Error(`${name} exceeds the 500-record browser limit. Contact support before exporting or deleting.`);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function exportZeroCostAccount({ firestore, uid, sdk = defaultSdk, now = () => new Date() }) {
  requireAccount(firestore, uid);
  const profileSnapshot = await sdk.getDoc(sdk.doc(firestore, "users", uid));
  const [tasks, documents, savedResources] = await Promise.all(collections.map((name) => readCollection(firestore, uid, name, sdk)));
  const archive = {
    schemaVersion: 1,
    exportedAt: now().toISOString(),
    uid,
    profile: profileSnapshot.exists() ? profileSnapshot.data() : {},
    tasks,
    documents,
    savedResources,
    notice: "Original document files are not stored by the free public beta and are not included.",
  };
  if (new TextEncoder().encode(JSON.stringify(archive)).byteLength > maxExportBytes) throw new Error("The account export exceeds the 10 MB browser limit.");
  return archive;
}

export function downloadZeroCostExport(archive, { documentImpl = document, urlImpl = URL } = {}) {
  const blob = new Blob([`${JSON.stringify(archive, null, 2)}\n`], { type: "application/json;charset=utf-8" });
  const objectUrl = urlImpl.createObjectURL(blob);
  const anchor = documentImpl.createElement("a");
  anchor.href = objectUrl;
  anchor.download = "globeready-account-export.json";
  documentImpl.body.append(anchor);
  anchor.click();
  anchor.remove();
  urlImpl.revokeObjectURL(objectUrl);
  return blob;
}

export async function deleteZeroCostAccount({ firestore, uid, deleteIdentity, sdk = defaultSdk }) {
  requireAccount(firestore, uid);
  if (typeof deleteIdentity !== "function") throw new Error("Identity deletion is unavailable.");
  try {
    for (const name of collections) {
      const records = await readCollection(firestore, uid, name, sdk);
      if (!records.length) continue;
      const batch = sdk.writeBatch(firestore);
      records.forEach((record) => batch.delete(sdk.doc(firestore, "users", uid, name, record.id)));
      await batch.commit();
    }
    await sdk.deleteDoc(sdk.doc(firestore, "users", uid));
  } catch (error) {
    error.retryable = true;
    throw error;
  }
  await deleteIdentity();
}
