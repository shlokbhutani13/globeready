import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { firebaseAppName, resolveClientMode } from "./runtime-mode";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.storageBucket
  && firebaseConfig.appId,
);

export const clientMode = resolveClientMode(import.meta.env, import.meta.env);
export const localUserMode = clientMode === "local-user";
export const demoMode = clientMode === "demo";

const appName = firebaseAppName(firebaseConfig, clientMode);
const app = firebaseConfigured
  ? getApps().find((candidate) => candidate.name === appName) || initializeApp(firebaseConfig, appName)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;

// Ports match firebase.json and scripts/local-user. The build-time constant removes this block from non-local builds.
if (__GLOBEREADY_LOCAL_USER__ && localUserMode && app) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8089);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

export const storageAvailable = Boolean(storage && import.meta.env.VITE_DOCUMENT_UPLOADS_ENABLED === "true");
