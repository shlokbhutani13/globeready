import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { createFirebaseAdmin } from "../src/firebase-admin.js";

const serverDir = new URL("..", import.meta.url).pathname;
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const cleanEnv = (extra = {}) => ({ PATH: process.env.PATH, HOME: process.env.HOME, PORT: "0", ...extra });
const runServer = (env) => spawnSync(process.execPath, ["src/index.js"], {
  cwd: serverDir, env: cleanEnv(env), encoding: "utf8", timeout: 30_000,
});

describe("Firebase Admin configuration", () => {
  test("demo mode returns no Firebase services only when explicitly enabled", () => {
    expect(createFirebaseAdmin({ DEMO_MODE: "true" })).toBeNull();
  });

  test("missing Firebase configuration outside demo mode throws instead of falling back", () => {
    expect(() => createFirebaseAdmin({})).toThrow(/FIREBASE_PROJECT_ID/);
    expect(() => createFirebaseAdmin({ DEMO_MODE: "false" })).toThrow(/FIREBASE_PROJECT_ID/);
  });

  test("a half-configured service account is refused", () => {
    expect(() => createFirebaseAdmin({ FIREBASE_PROJECT_ID: "p", FIREBASE_CLIENT_EMAIL: "a@b.c" }))
      .toThrow(/together/);
  });

  test("malformed service-account material fails safely without echoing the secret", () => {
    const secret = "not-a-real-key-SECRETVALUE";
    let message = "";
    try {
      createFirebaseAdmin({ FIREBASE_PROJECT_ID: "globeready-test", FIREBASE_CLIENT_EMAIL: "a@globeready-test.iam.gserviceaccount.com", FIREBASE_PRIVATE_KEY: secret });
    } catch (error) {
      message = error.message;
    }
    expect(message).toMatch(/malformed/);
    expect(message).not.toContain("SECRETVALUE");
  });

  test("the server refuses to start with no credentials and demo mode absent", () => {
    const result = runServer({});
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/refused to start/i);
  });

  test("the server refuses to start with DEMO_MODE=false and no credentials", () => {
    const result = runServer({ DEMO_MODE: "false" });
    expect(result.status).not.toBe(0);
  });

  test("the server refuses to start with malformed credentials and does not print them", () => {
    const secret = "malformed-key-SECRETVALUE";
    const result = runServer({
      FIREBASE_PROJECT_ID: "globeready-test",
      FIREBASE_CLIENT_EMAIL: "a@globeready-test.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: secret,
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).not.toContain("SECRETVALUE");
  });

  test("demo mode is refused in production", () => {
    const result = runServer({ DEMO_MODE: "true", NODE_ENV: "production" });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toMatch(/not allowed when NODE_ENV=production/);
  });

  test("Application Default Credentials initialize Firebase Admin without a key file in the repository", () => {
    const dir = mkdtempSync(join(tmpdir(), "gr-adc-"));
    const keyFile = join(dir, "service-account.json");
    writeFileSync(keyFile, JSON.stringify({
      type: "service_account",
      project_id: "globeready-test",
      private_key_id: "test",
      private_key: privateKey,
      client_email: "adc@globeready-test.iam.gserviceaccount.com",
      client_id: "1",
      token_uri: "https://oauth2.googleapis.com/token",
    }));
    const script = `
      import { createFirebaseAdmin } from "./src/firebase-admin.js";
      const admin = createFirebaseAdmin({ FIREBASE_PROJECT_ID: "globeready-test", FIREBASE_STORAGE_BUCKET: "globeready-test.appspot.com" });
      console.log(admin && typeof admin.auth.verifyIdToken === "function" ? "ADC_OK" : "ADC_FAILED");
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: serverDir,
      env: cleanEnv({ GOOGLE_APPLICATION_CREDENTIALS: keyFile }),
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.stdout).toContain("ADC_OK");
    expect(result.status).toBe(0);
  });
});
