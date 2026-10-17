import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, startAfter, writeBatch,
} from "firebase/firestore";

// Everything the zero-cost beta stores for a student, all owner-scoped under users/{uid}.
export const zeroCostCollections = ["tasks", "documents", "savedResources", "savedNews", "trackedDates", "contacts", "cases", "planner", "pushTokens"];
const pageSize = 400;
const maxExportBytes = 10 * 1024 * 1024;
const encoder = new TextEncoder();
const defaultSdk = { collection, deleteDoc, doc, getDoc, getDocs, limit, query, startAfter, writeBatch };

function requireAccount(firestore, uid) {
  if (!firestore || typeof uid !== "string" || !uid.trim()) throw new Error("An authenticated student is required.");
}

async function readCollection(firestore, uid, name, sdk, onRecord) {
  let cursor = null;
  for (;;) {
    // Without an explicit orderBy, Firestore returns documents in ID order, and startAfter(snapshot) continues it.
    const constraints = [sdk.limit(pageSize)];
    if (cursor) constraints.push(sdk.startAfter(cursor));
    const snapshot = await sdk.getDocs(sdk.query(sdk.collection(firestore, "users", uid, name), ...constraints));
    snapshot.docs.forEach((item) => onRecord({ id: item.id, ...item.data() }));
    if (snapshot.docs.length < pageSize) return;
    cursor = snapshot.docs.at(-1);
  }
}

export async function exportZeroCostAccount({ firestore, uid, sdk = defaultSdk, now = () => new Date() }) {
  requireAccount(firestore, uid);
  const profileSnapshot = await sdk.getDoc(sdk.doc(firestore, "users", uid));
  let bytes = 0;
  const archive = {
    schemaVersion: 2,
    exportedAt: now().toISOString(),
    uid,
    profile: profileSnapshot.exists() ? profileSnapshot.data() : {},
    notice: "Original document files are not stored by the free public beta and are not included.",
  };
  for (const name of zeroCostCollections) {
    archive[name] = [];
    await readCollection(firestore, uid, name, sdk, (record) => {
      bytes += encoder.encode(JSON.stringify(record)).byteLength;
      if (bytes > maxExportBytes) {
        throw new Error("Your data is larger than the 10 MB browser export limit. Delete document text you no longer need, then export again.");
      }
      archive[name].push(record);
    });
  }
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

// Deletion order: confirm identity first (nothing is deleted if that fails), then delete every record in repeated
// batches, then the profile, then the sign-in identity. A failure after confirmation leaves a retryable state.
export async function deleteZeroCostAccount({ firestore, uid, reauthenticate, deleteIdentity, sdk = defaultSdk }) {
  requireAccount(firestore, uid);
  if (typeof reauthenticate !== "function" || typeof deleteIdentity !== "function") throw new Error("Account deletion is unavailable.");
  await reauthenticate();
  try {
    for (const name of zeroCostCollections) {
      for (let round = 0; ; round += 1) {
        if (round >= 1_000) throw new Error("Deletion did not finish.");
        const snapshot = await sdk.getDocs(sdk.query(sdk.collection(firestore, "users", uid, name), sdk.limit(pageSize)));
        if (!snapshot.docs.length) break;
        const batch = sdk.writeBatch(firestore);
        snapshot.docs.forEach((item) => batch.delete(sdk.doc(firestore, "users", uid, name, item.id)));
        await batch.commit();
      }
    }
    await sdk.deleteDoc(sdk.doc(firestore, "users", uid));
    await deleteIdentity();
  } catch (error) {
    throw Object.assign(
      new Error(`Deletion stopped before finishing (${error?.message || "unknown error"}). Some data may remain. Try again; it continues where it stopped.`),
      { retryable: true, cause: error },
    );
  }
}
