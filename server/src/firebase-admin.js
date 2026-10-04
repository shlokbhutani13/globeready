import { createHash, createPrivateKey } from "node:crypto";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { ConfigError, resolveRuntimeMode } from "./runtime-config.js";

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

function servicesFor(app, env) {
  return {
    auth: getAuth(app),
    firestore: getFirestore(app),
    bucket: env.FIREBASE_STORAGE_BUCKET ? getStorage(app).bucket() : null,
  };
}

export function createFirebaseAdmin(env = process.env) {
  const { mode } = resolveRuntimeMode(env);
  if (mode === "demo") return null;
  if (!env.FIREBASE_PROJECT_ID) {
    throw new ConfigError("FIREBASE_PROJECT_ID is required outside demo mode.");
  }
  const identityFields = [
    mode, env.FIREBASE_PROJECT_ID, env.FIREBASE_STORAGE_BUCKET || "",
    env.FIREBASE_AUTH_EMULATOR_HOST || "", env.FIRESTORE_EMULATOR_HOST || "",
    env.FIREBASE_STORAGE_EMULATOR_HOST || "", env.STORAGE_EMULATOR_HOST || "",
    env.FIREBASE_CLIENT_EMAIL || "adc", env.GOOGLE_APPLICATION_CREDENTIALS || "",
  ];
  const identity = identityFields.join("\0");
  const name = `globeready-${mode}-${createHash("sha256").update(identity).digest("hex").slice(0, 16)}`;
  const existing = getApps().find((candidate) => candidate.name === name);
  if (existing) return servicesFor(existing, env);
  const options = {
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  };
  if (mode === "production") options.credential = credentialFor(env);
  const app = initializeApp(options, name);
  return servicesFor(app, env);
}
