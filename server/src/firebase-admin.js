import { createPrivateKey } from "node:crypto";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ConfigError, isDemoMode } from "./runtime-config.js";

export function normalizePrivateKey(value = "") {
  return value.replace(/\\n/g, "\n");
}

function credentialFor(env) {
  const hasExplicitEmail = Boolean(env.FIREBASE_CLIENT_EMAIL);
  const hasExplicitKey = Boolean(env.FIREBASE_PRIVATE_KEY);
  if (hasExplicitEmail !== hasExplicitKey) {
    throw new ConfigError("FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY must be set together.");
  }
  if (!hasExplicitEmail) {
    try {
      return applicationDefault();
    } catch {
      throw new ConfigError("Application Default Credentials could not be loaded.");
    }
  }
  const privateKey = normalizePrivateKey(env.FIREBASE_PRIVATE_KEY);
  try {
    createPrivateKey(privateKey);
  } catch {
    throw new ConfigError("Firebase service-account credentials are malformed.");
  }
  return cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey,
  });
}

export function createFirebaseAdmin(env = process.env) {
  if (isDemoMode(env)) {
    if (env.NODE_ENV === "production") {
      throw new ConfigError("DEMO_MODE=true is not allowed when NODE_ENV=production.");
    }
    return null;
  }
  if (!env.FIREBASE_PROJECT_ID) {
    throw new ConfigError("FIREBASE_PROJECT_ID is required unless DEMO_MODE=true.");
  }
  const credential = credentialFor(env);
  const app = getApps()[0] || initializeApp({
    credential,
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });
  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
    bucket: env.FIREBASE_STORAGE_BUCKET ? getStorage(app).bucket() : null,
  };
}
