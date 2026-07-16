import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

export function normalizePrivateKey(value = "") {
  return value.replace(/\\n/g, "\n");
}

export function createFirebaseAdmin(env = process.env) {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return null;
  }
  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    }),
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });
  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
    bucket: env.FIREBASE_STORAGE_BUCKET ? getStorage(app).bucket() : null,
  };
}
