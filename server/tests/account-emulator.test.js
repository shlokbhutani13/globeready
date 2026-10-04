import { generateKeyPairSync } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createApp } from "../src/app.js";
import { createFirebaseAdmin } from "../src/firebase-admin.js";
import { createFirestoreStore } from "../src/firestore-store.js";

const emulated = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.STORAGE_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const describeEmulated = emulated ? describe : describe.skip;
const projectId = "globeready-test";
const bucketName = `${projectId}.appspot.com`;
const confirmation = "DELETE MY ACCOUNT";

async function emulatorSignUp(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.edu`;
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "emulator-password-1", returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`emulator sign-up failed: ${body.error?.message}`);
  return { uid: body.localId, idToken: body.idToken };
}

describeEmulated("account deletion against the Firebase Auth, Storage, and Firestore emulators", () => {
  let firebase;
  let store;
  let alice;
  let bob;

  async function seed(user, label) {
    await store.profiles.set(user.uid, { fullName: `${label} Student`, university: `${label} University` });
    await store.tasks.create(user.uid, { title: `${label} task`, dueDate: "2026-11-01", completed: false });
    await store.notifications.create(user.uid, { title: `${label} reminder`, read: false });
    const conversation = await store.conversations.create(user.uid, { title: `${label} question` });
    await store.conversationMessages.create(user.uid, conversation.id, { role: "user", text: `${label} private question` });
    const documentId = `${label}-doc`;
    const storagePath = `users/${user.uid}/documents/${documentId}/passport.pdf`;
    await firebase.bucket.file(storagePath).save(Buffer.from(`%PDF ${label} private passport`), { contentType: "application/pdf" });
    await store.documents.create(user.uid, { id: documentId, name: "passport.pdf", storagePath, contentType: "application/pdf" });
    await store.ragChunks.replace(user.uid, documentId, [{ index: 0, page: 1, text: `${label} private passport text` }]);
  }

  async function storageUnder(uid) {
    const [files] = await firebase.bucket.getFiles({ prefix: `users/${uid}/` });
    return files.map((file) => file.name);
  }

  function appWith(accountOverrides = {}, { recentLoginWindowMs } = {}) {
    return createApp({
      recentLoginWindowMs,
      auth: firebase.auth,
      store,
      assistant: null,
      account: {
        deleteStoragePrefix: (uid) => firebase.bucket.deleteFiles({ prefix: `users/${uid}/` }),
        deleteAuthUser: (uid) => firebase.auth.deleteUser(uid),
        ...accountOverrides,
      },
    });
  }

  beforeAll(async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    firebase = createFirebaseAdmin({
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_CLIENT_EMAIL: `admin@${projectId}.iam.gserviceaccount.com`,
      FIREBASE_PRIVATE_KEY: privateKey,
      FIREBASE_STORAGE_BUCKET: bucketName,
    });
    store = createFirestoreStore(firebase.firestore);
    alice = await emulatorSignUp("alice");
    bob = await emulatorSignUp("bob");
    await seed(alice, "alice");
    await seed(bob, "bob");
  }, 120_000);

  afterAll(async () => {
    if (firebase) await firebase.auth.deleteUser(bob.uid).catch(() => {});
  });

  test("refuses deletion from a real sign-in that is no longer recent, and keeps every resource", async () => {
    await new Promise((resolve) => setTimeout(resolve, 2_200));
    const response = await request(appWith({}, { recentLoginWindowMs: 1_000 }))
      .delete("/api/account")
      .set("Authorization", `Bearer ${alice.idToken}`)
      .send({ confirmation })
      .expect(403);

    expect(response.body.error.code).toBe("recent_login_required");
    expect(await store.profiles.get(alice.uid)).not.toBeNull();
    expect(await storageUnder(alice.uid)).toHaveLength(1);
    await firebase.auth.getUser(alice.uid);
  });

  test("a failed storage step stops early, keeps the data, and a retry completes the deletion", async () => {
    const failing = appWith({ deleteStoragePrefix: async () => { throw new Error("storage unavailable"); } });
    const failed = await request(failing)
      .delete("/api/account")
      .set("Authorization", `Bearer ${alice.idToken}`)
      .send({ confirmation })
      .expect(500);
    expect(JSON.stringify(failed.body)).not.toMatch(/storage unavailable/);
    expect(await store.profiles.get(alice.uid)).not.toBeNull();
    await firebase.auth.getUser(alice.uid);

    await request(appWith())
      .delete("/api/account")
      .set("Authorization", `Bearer ${alice.idToken}`)
      .send({ confirmation })
      .expect(200);
  });

  test("deletes the student's Firestore tree, Storage objects, and Auth identity", async () => {
    expect(await store.profiles.get(alice.uid)).toBeNull();
    expect(await store.tasks.list(alice.uid)).toEqual([]);
    expect(await store.notifications.list(alice.uid)).toEqual([]);
    expect(await store.conversations.list(alice.uid)).toEqual([]);
    expect(await store.documents.list(alice.uid)).toEqual([]);
    expect(await store.ragChunks.list(alice.uid)).toEqual([]);
    expect(await storageUnder(alice.uid)).toEqual([]);
    await expect(firebase.auth.getUser(alice.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  test("leaves another student's Firestore data, Storage objects, and Auth identity untouched", async () => {
    expect((await store.profiles.get(bob.uid)).fullName).toBe("bob Student");
    expect(await store.tasks.list(bob.uid)).toHaveLength(1);
    expect(await store.ragChunks.list(bob.uid)).toHaveLength(1);
    expect(await storageUnder(bob.uid)).toHaveLength(1);
    expect((await firebase.auth.getUser(bob.uid)).uid).toBe(bob.uid);
  });

  test("the deleted student's ID token can no longer reach the API", async () => {
    await request(appWith())
      .get("/api/profile")
      .set("Authorization", `Bearer ${alice.idToken}`)
      .expect(401);
  });
});
