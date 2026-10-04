import { execFileSync } from "node:child_process";
import { accessSync, constants, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createFirebaseAdmin } from "../src/firebase-admin.js";
import { createFirestoreStore } from "../src/firestore-store.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const serverDir = fileURLToPath(new URL("..", import.meta.url));
const emulatorHosts = {
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8089",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
};
// Emulator tokens carry the emulator's project; the Admin SDK must be configured for that same project.
const projectId = process.env.GCLOUD_PROJECT || "globeready-local";
const localEnv = { LOCAL_USER_MODE: "true", FIREBASE_PROJECT_ID: projectId, FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`, ...emulatorHosts };
const emulated = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
const describeEmulated = emulated ? describe : describe.skip;

describe("local-user configuration and tooling", () => {
  test("the emulator suite covers Auth, Firestore, Storage, and the emulator UI", () => {
    const config = JSON.parse(readFileSync(`${root}/firebase.json`, "utf8"));
    expect(config.emulators.auth.port).toBe(9099);
    expect(config.emulators.firestore.port).toBe(8089);
    expect(config.emulators.storage.port).toBe(9199);
    expect(config.emulators.ui.enabled).toBe(true);
  });

  test("local data and credentials are ignored by Git", () => {
    const gitignore = readFileSync(`${root}/.gitignore`, "utf8");
    expect(gitignore).toMatch(/^\.local\/$/m);
  });

  test("the start, stop, and reset scripts exist and are executable", () => {
    for (const name of ["start.sh", "stop.sh", "reset.sh"]) {
      expect(() => accessSync(`${root}/scripts/local-user/${name}`, constants.X_OK)).not.toThrow();
    }
  });

  test("stopping exports emulator state rather than killing it", () => {
    const stop = readFileSync(`${root}/scripts/local-user/stop.sh`, "utf8");
    expect(stop).toMatch(/stop_process emulators INT/);
  });

  test("the seed script refuses to run outside local-user mode", () => {
    let output = "";
    try {
      execFileSync(process.execPath, ["scripts/seed-local-user.mjs"], {
        cwd: serverDir,
        env: { PATH: process.env.PATH, DEMO_MODE: "true" },
        stdio: "pipe",
      });
    } catch (error) {
      output = String(error.stderr || "");
    }
    expect(output).toMatch(/only in LOCAL_USER_MODE=true/);
  });

  test("the client local-user environment file contains placeholders only", () => {
    const env = readFileSync(`${root}/client/.env.local-user`, "utf8");
    expect(env).toMatch(/VITE_LOCAL_USER_MODE=true/);
    expect(env).not.toMatch(/PRIVATE_KEY|SECRET|-----BEGIN/);
  });

  test("explicit demo mode has a coordinated client and server development command", () => {
    const clientPackage = JSON.parse(readFileSync(`${root}/client/package.json`, "utf8"));
    const serverPackage = JSON.parse(readFileSync(`${root}/server/package.json`, "utf8"));
    const demoEnv = readFileSync(`${root}/client/.env.demo`, "utf8");
    expect(clientPackage.scripts.demo).toMatch(/--mode demo/);
    expect(serverPackage.scripts.demo).toMatch(/DEMO_MODE=true/);
    expect(demoEnv).toMatch(/VITE_DEMO_MODE=true/);
  });
});

describeEmulated("local-user mode against the Auth, Firestore, and Storage emulators", () => {
  test("an emulator-issued sign-in is used as the normal authenticated UID, never x-demo-user", async () => {
    const services = createFirebaseAdmin(localEnv);
    const store = createFirestoreStore(services.firestore);
    const app = createApp({ store, auth: services.auth, assistant: null, demoMode: false });

    const email = `local-test-${Date.now()}@example.test`;
    const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=local`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "local-test-password", returnSecureToken: true }),
    });
    const signedIn = await response.json();
    const uid = signedIn.localId;

    await request(app).post("/api/tasks")
      .set("Authorization", `Bearer ${signedIn.idToken}`)
      .send({ title: "Local task", dueDate: "2026-11-01" })
      .expect(201);
    expect((await store.tasks.list(uid)).map((task) => task.title)).toContain("Local task");

    await request(app).get("/api/tasks").set("x-demo-user", uid).expect(401);
    await request(app).get("/api/tasks").set("x-demo-user", "someone-else").expect(401);
  }, 60_000);

  test("local-user mode still refuses an unauthenticated request", async () => {
    const services = createFirebaseAdmin(localEnv);
    const app = createApp({ store: createFirestoreStore(services.firestore), auth: services.auth, assistant: null, demoMode: false });
    await request(app).get("/api/tasks").expect(401);
  });
});
