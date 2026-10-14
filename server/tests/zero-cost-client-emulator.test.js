import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import * as firestoreSdk from "firebase/firestore";
import { createZeroCostDataStore } from "../../client/src/lib/zero-cost-data.js";
import { deleteZeroCostAccount, exportZeroCostAccount } from "../../client/src/lib/zero-cost-account.js";

// Runs the browser data layer itself against the Firestore emulator and firestore.zero-cost.rules, so the shapes the
// client writes are proven to pass the rules. The client modules accept an SDK, so this file supplies its own copy.
const projectId = "globeready-zero-cost-client-test";
let environment;
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const sdk = firestoreSdk;

describeEmulator("zero-cost browser data layer against its rules", () => {
  beforeAll(async () => {
    const rules = await readFile(new URL("../../firestore.zero-cost.rules", import.meta.url), "utf8");
    environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
  });
  beforeEach(async () => environment.clearFirestore());
  afterAll(async () => environment?.cleanup());

  test("every write the client makes is accepted for a verified student", async () => {
    const firestore = environment.authenticatedContext("maya", { email_verified: true }).firestore();
    const store = createZeroCostDataStore({ firestore, uid: "maya", sdk });
    await store.saveProfile({ fullName: "Maya Singh", homeCountry: "India", university: "Example University", visaType: "F-1", startDate: "2026-08-20", graduationDate: "" });
    await store.saveConsent({ documents: true });
    const task = await store.createTask({ title: "Renew passport", dueDate: "2026-11-01", priority: "high" });
    await store.toggleTask({ id: task.id, completed: false });
    await store.saveResource({ title: "Maintaining status", url: "https://studyinthestates.dhs.gov/students", category: "status", source: "SEVP" });
    await store.saveLocalDocument({
      id: "doc-00", metadata: { name: "i20.pdf", contentType: "application/pdf", size: 2048 },
      chunks: [{ page: 1, text: "Program end date: May 15, 2027." }], pageCount: 2, pagesWithText: 1,
    });
    await store.saveNews("federal-register-2026-14439");
    const saved = await sdk.getDoc(sdk.doc(firestore, "users", "maya", "documents", "doc-00"));
    expect(saved.data()).toMatchObject({ storageMode: "browser-local", pageCount: 2, pagesWithText: 1 });
    await store.unsaveNews("federal-register-2026-14439");
    await store.removeTask(task.id);
  });

  test("an unverified account cannot write, so the app must show the verification step", async () => {
    const firestore = environment.authenticatedContext("new", { email_verified: false }).firestore();
    const store = createZeroCostDataStore({ firestore, uid: "new", sdk });
    await expect(store.saveProfile({ fullName: "New Student" })).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("export pages past 500 records and deletion removes everything in repeated batches", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      const stamp = new Date("2026-10-01T00:00:00Z");
      await sdk.setDoc(sdk.doc(database, "users", "maya"), { fullName: "Maya", updatedAt: stamp });
      for (let start = 0; start < 1_050; start += 450) {
        const batch = sdk.writeBatch(database);
        for (let index = start; index < Math.min(start + 450, 1_050); index += 1) {
          batch.set(sdk.doc(database, "users", "maya", "tasks", `t${String(index).padStart(4, "0")}`), { title: `Task ${index}`, completed: false, source: "user", createdAt: stamp, updatedAt: stamp });
        }
        await batch.commit();
      }
      await sdk.setDoc(sdk.doc(database, "users", "maya", "documents", "doc-00"), { name: "i20.pdf", chunks: [{ page: 1, text: "x" }] });
      await sdk.setDoc(sdk.doc(database, "users", "maya", "savedNews", "news-1"), { newsItemId: "news-1", createdAt: stamp });
    });
    const firestore = environment.authenticatedContext("maya", { email_verified: true }).firestore();
    const archive = await exportZeroCostAccount({ firestore, uid: "maya", sdk });
    expect(archive.tasks).toHaveLength(1_050);
    expect(archive.documents).toHaveLength(1);
    expect(archive.savedNews).toHaveLength(1);

    const order = [];
    await deleteZeroCostAccount({
      firestore, uid: "maya", sdk,
      reauthenticate: async () => order.push("reauthenticated"),
      deleteIdentity: async () => order.push("identity deleted"),
    });
    expect(order).toEqual(["reauthenticated", "identity deleted"]);
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      for (const name of ["tasks", "documents", "savedResources", "savedNews"]) {
        expect((await sdk.getDocs(sdk.collection(database, "users", "maya", name))).size, name).toBe(0);
      }
      expect((await sdk.getDoc(sdk.doc(database, "users", "maya"))).exists()).toBe(false);
    });
  }, 60_000);
});
