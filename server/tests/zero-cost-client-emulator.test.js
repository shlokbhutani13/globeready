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

  test("editing, repeating and linking tasks as the browser does is accepted by the rules", async () => {
    const firestore = environment.authenticatedContext("maya", { email_verified: true }).firestore();
    const store = createZeroCostDataStore({ firestore, uid: "maya", sdk });
    const created = await store.createTask({ title: "Pay rent", dueDate: "2026-10-31", recurrence: "monthly", remindOn: "2026-10-28", notes: "Portal login in password manager", links: [{ type: "rule", id: "form-i-765" }] });
    const reread = async (id) => (await sdk.getDoc(sdk.doc(firestore, "users", "maya", "tasks", id)));
    const first = (await reread(created.id)).data();
    await store.updateTask({ id: created.id, completed: false, createdAt: first.createdAt }, { title: "Pay rent online", dueDate: "2026-10-31", recurrence: "monthly", links: [] });
    const edited = (await reread(created.id)).data();
    expect(edited).toMatchObject({ title: "Pay rent online", recurrence: "monthly", completed: false, source: "user" });
    expect(edited.notes).toBeUndefined();
    expect(edited.createdAt.isEqual(first.createdAt)).toBe(true);
    const { nextId } = await store.completeTask({ id: created.id, ...edited });
    const next = (await reread(nextId)).data();
    expect(next).toMatchObject({ title: "Pay rent online", dueDate: "2026-11-30", recurrence: "monthly", completed: false });
    expect((await reread(created.id)).data().completed).toBe(true);
    await store.completeTask({ id: created.id, ...(await reread(created.id)).data() });
    expect((await reread(created.id)).data().completed).toBe(false);
  });

  test("tracking a case as the browser does is accepted by the rules", async () => {
    const firestore = environment.authenticatedContext("maya", { email_verified: true }).firestore();
    const store = createZeroCostDataStore({ firestore, uid: "maya", sdk });
    const created = await store.createCase({ title: "Post-completion OPT", kind: "opt-ead", formNumber: "I-765", receiptNumber: "ioe 1234567890", filedOn: "2026-10-01", status: "filed" }, 0);
    const read = async () => ({ id: created.id, ...(await sdk.getDoc(sdk.doc(firestore, "users", "maya", "cases", created.id))).data() });
    await store.addCaseEntry(await read(), { date: "2026-10-09", type: "receipt", text: "Receipt notice arrived" });
    await store.addCaseEntry(await read(), { date: "2026-10-20", type: "appointment", text: "Biometrics 9am" });
    let record = await read();
    expect(record).toMatchObject({ status: "receipt-received", receiptNumber: "IOE1234567890" });
    expect(record.timeline.map((entry) => entry.type)).toEqual(["receipt", "appointment"]);
    await store.removeCaseEntry(record, 0);
    await store.updateCase(created.id, { ...(await read()), title: "OPT (renamed)" });
    record = await read();
    expect(record.title).toBe("OPT (renamed)");
    expect(record.timeline).toHaveLength(1);
    await store.removeCase(created.id);
    expect((await sdk.getDoc(sdk.doc(firestore, "users", "maya", "cases", created.id))).exists()).toBe(false);
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
      for (const name of ["tasks", "documents", "savedResources", "savedNews", "trackedDates", "contacts", "cases", "planner"]) {
        expect((await sdk.getDocs(sdk.collection(database, "users", "maya", name))).size, name).toBe(0);
      }
      expect((await sdk.getDoc(sdk.doc(database, "users", "maya"))).exists()).toBe(false);
    });
  }, 60_000);
});
