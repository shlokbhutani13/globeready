import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import { createFirebaseAdmin } from "../src/firebase-admin.js";
import { integrationConfigForRuntime, resolveRuntimeMode, ConfigError } from "../src/runtime-config.js";

// Tests in this file start real Node processes. Their budget is set explicitly, so a loaded machine
// cannot fail a correct refusal by exceeding vitest's 5-second default.
vi.setConfig({ testTimeout: 60_000 });

const hosts = {
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
};
const local = { LOCAL_USER_MODE: "true", FIREBASE_PROJECT_ID: "globeready-local", FIREBASE_STORAGE_BUCKET: "globeready-local.appspot.com", ...hosts };

describe("runtime modes are explicit and mutually exclusive", () => {
  test("no mode flags means production", () => {
    expect(resolveRuntimeMode({}).mode).toBe("production");
  });

  test("DEMO_MODE=true selects demo", () => {
    expect(resolveRuntimeMode({ DEMO_MODE: "true" }).mode).toBe("demo");
  });

  test("LOCAL_USER_MODE=true selects local-user when every emulator host is set", () => {
    expect(resolveRuntimeMode(local).mode).toBe("local-user");
  });

  test("DEMO_MODE and LOCAL_USER_MODE cannot both be active", () => {
    expect(() => resolveRuntimeMode({ ...local, DEMO_MODE: "true" })).toThrow(/cannot both be true/);
  });

  test("flags other than exactly 'true' or 'false' are refused", () => {
    expect(() => resolveRuntimeMode({ LOCAL_USER_MODE: "yes" })).toThrow(ConfigError);
    expect(() => resolveRuntimeMode({ DEMO_MODE: "1" })).toThrow(ConfigError);
  });

  test("local-user mode cannot activate under NODE_ENV=production", () => {
    expect(() => resolveRuntimeMode({ ...local, NODE_ENV: "production" })).toThrow(/NODE_ENV=production/);
  });

  test("demo mode cannot activate under NODE_ENV=production", () => {
    expect(() => resolveRuntimeMode({ DEMO_MODE: "true", NODE_ENV: "production" })).toThrow(/NODE_ENV=production/);
  });

  test("production refuses emulator host variables", () => {
    expect(() => resolveRuntimeMode({ FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" })).toThrow(/emulator/i);
    expect(() => resolveRuntimeMode({ FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" })).toThrow(/emulator/i);
    expect(() => resolveRuntimeMode({ FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199" })).toThrow(/emulator/i);
    expect(() => resolveRuntimeMode({ STORAGE_EMULATOR_HOST: "http:\/\/127.0.0.1:9199" })).toThrow(/emulator/i);
  });

  test("demo mode refuses emulator host variables", () => {
    expect(() => resolveRuntimeMode({ DEMO_MODE: "true", ...hosts })).toThrow(/emulator/i);
  });

  test("local-user mode refuses to start when any emulator host is missing", () => {
    const { FIREBASE_STORAGE_EMULATOR_HOST, ...partial } = local;
    expect(() => resolveRuntimeMode(partial)).toThrow(/FIREBASE_STORAGE_EMULATOR_HOST/);
  });

  test("local-user mode requires each Storage host in the format consumed by its SDK", () => {
    expect(() => resolveRuntimeMode({ ...local, FIREBASE_STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199" })).toThrow(/FIREBASE_STORAGE_EMULATOR_HOST/);
    expect(() => resolveRuntimeMode({ ...local, STORAGE_EMULATOR_HOST: "127.0.0.1:9199" })).toThrow(/STORAGE_EMULATOR_HOST/);
  });

  test("local-user mode refuses remote emulator endpoints", () => {
    expect(() => resolveRuntimeMode({ ...local, FIREBASE_AUTH_EMULATOR_HOST: "identitytoolkit.googleapis.com:443" })).toThrow(/loopback/);
    expect(() => resolveRuntimeMode({ ...local, FIRESTORE_EMULATOR_HOST: "firestore.googleapis.com:443" })).toThrow(/loopback/);
    expect(() => resolveRuntimeMode({ ...local, STORAGE_EMULATOR_HOST: "https://storage.googleapis.com" })).toThrow(/loopback/);
  });

  test("local-user mode disables inherited external integrations", () => {
    expect(integrationConfigForRuntime("local-user", {
      GEMINI_API_KEY: "must-not-be-used",
      GEMINI_EMBEDDINGS_ENABLED: "true",
      NEWS_SYNC_ENABLED: "true",
    })).toEqual({ geminiApiKey: undefined, geminiEmbeddingsEnabled: false, newsSyncEnabled: false });
  });

  test("local-user mode does not require service-account credentials or ADC", () => {
    const saved = { ...process.env };
    Object.assign(process.env, hosts);
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    try {
      const services = createFirebaseAdmin({ ...local, GOOGLE_APPLICATION_CREDENTIALS: "" });
      expect(typeof services.auth.verifyIdToken).toBe("function");
      expect(services.firestore).toBeDefined();
    } finally {
      for (const name of Object.keys(hosts)) {
        if (saved[name] === undefined) delete process.env[name];
        else process.env[name] = saved[name];
      }
    }
  });

  test("Firebase Admin apps are isolated by project and bucket within one process", () => {
    const first = createFirebaseAdmin(local);
    const second = createFirebaseAdmin({
      ...local,
      FIREBASE_PROJECT_ID: "globeready-other",
      FIREBASE_STORAGE_BUCKET: "globeready-other.appspot.com",
    });
    expect(first.auth.app.options.projectId).toBe("globeready-local");
    expect(second.auth.app.options.projectId).toBe("globeready-other");
    expect(first.auth.app.name).not.toBe(second.auth.app.name);
    const third = createFirebaseAdmin({ ...local, FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099" });
    expect(third.auth.app.name).not.toBe(first.auth.app.name);
  });

  test.skipIf(Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST))("production never accepts an unsigned emulator-style token", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const production = createFirebaseAdmin({
      FIREBASE_PROJECT_ID: "globeready-prod-check",
      FIREBASE_CLIENT_EMAIL: "check@globeready-prod-check.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: privateKey,
    });
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({ iss: "https://securetoken.google.com/globeready-prod-check", aud: "globeready-prod-check", sub: "x", user_id: "x", auth_time: now, iat: now, exp: now + 600 })}.`;
    await expect(production.auth.verifyIdToken(unsigned)).rejects.toThrow();
  });

  test("local-user mode cannot be entered from the startup entry point under production", () => {
    const serverDir = new URL("..", import.meta.url).pathname;
    let stderr = "";
    try {
      execFileSync(process.execPath, ["src/index.js"], {
        cwd: serverDir,
        env: { PATH: process.env.PATH, PORT: "0", ...local, NODE_ENV: "production" },
        stdio: "pipe",
        timeout: 30_000,
      });
    } catch (error) {
      stderr = String(error.stderr || "") + String(error.stdout || "");
    }
    expect(stderr).toMatch(/NODE_ENV=production/);
  });
});
