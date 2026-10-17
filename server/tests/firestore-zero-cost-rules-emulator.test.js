import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

// The zero-cost beta's rules are a separate file with a separate project ID, so they never mix with production rules.
const projectId = "globeready-zero-cost-test";
let environment;
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

const verified = (uid) => environment.authenticatedContext(uid, { email_verified: true }).firestore();
const unverified = (uid) => environment.authenticatedContext(uid, { email_verified: false }).firestore();

const now = () => serverTimestamp();
const profile = (extra = {}) => ({ fullName: "Maya Singh", visaType: "F-1", startDate: "2026-08-20", updatedAt: now(), ...extra });
const consent = (documents = true, extra = {}) => ({
  consent: { version: "2026-10-14-zero-cost", documents, aiGeneration: false, acceptedAt: now(), ...extra }, updatedAt: now(),
});
const task = (extra = {}) => ({
  title: "Renew passport", category: "General", priority: "medium", dueDate: "2026-11-01", completed: false, source: "user",
  createdAt: now(), updatedAt: now(), ...extra,
});
const localDocument = (extra = {}) => ({
  name: "i20.pdf", category: "Other", contentType: "application/pdf", size: 1024, storageMode: "browser-local",
  analysisStatus: "indexed", chunks: [{ page: 1, text: "Form I-20 student record" }], pageCount: 2, pagesWithText: 1,
  uploadedAt: now(), createdAt: now(), updatedAt: now(), ...extra,
});
const resource = (extra = {}) => ({
  title: "Maintaining status", url: "https://studyinthestates.dhs.gov/students", category: "status", source: "SEVP",
  createdAt: now(), updatedAt: now(), ...extra,
});

describeEmulator("zero-cost Firestore rules", () => {
  beforeAll(async () => {
    const rules = await readFile(new URL("../../firestore.zero-cost.rules", import.meta.url), "utf8");
    environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
  });
  beforeEach(async () => environment.clearFirestore());
  afterAll(async () => environment?.cleanup());

  test("profile and consent writes need a verified owner and the exact bounded shape", async () => {
    const maya = verified("maya");
    const ref = doc(maya, "users", "maya");
    await assertSucceeds(setDoc(ref, profile()));
    await assertSucceeds(setDoc(ref, consent(true), { merge: true }));
    await assertFails(setDoc(doc(unverified("maya"), "users", "maya"), profile()));
    await assertFails(setDoc(doc(verified("bob"), "users", "maya"), profile()));
    await assertFails(setDoc(ref, profile({ fullName: "x".repeat(201) })));
    await assertFails(setDoc(ref, profile({ visaType: { nested: "map" } })));
    await assertFails(setDoc(ref, profile({ startDate: "next week" })));
    await assertFails(setDoc(ref, profile({ isAdmin: true })));
    await assertFails(setDoc(ref, profile({ updatedAt: new Date("2020-01-01T00:00:00Z") })));
    await assertSucceeds(setDoc(ref, profile({ programLevel: "masters", visaCategory: "f-1", studentStage: "studying", trainingStatus: "considering-opt" })));
    await assertFails(setDoc(ref, profile({ visaCategory: "j-1", trainingStatus: "considering-opt" })));
    await assertFails(setDoc(ref, profile({ programLevel: "law-school" })));
    await assertFails(setDoc(ref, consent(true, { aiGeneration: true }), { merge: true }));
    await assertFails(setDoc(ref, consent(true, { scope: "everything" }), { merge: true }));
  });

  test("tasks are created incomplete with server timestamps; edits keep creation time and source", async () => {
    const maya = verified("maya");
    const ref = doc(maya, "users", "maya", "tasks", "t1");
    await assertSucceeds(setDoc(ref, task()));
    await assertSucceeds(updateDoc(ref, { completed: true, updatedAt: now() }));
    await assertSucceeds(updateDoc(ref, { title: "changed", notes: "bring passport", updatedAt: now() }));
    await assertFails(updateDoc(ref, { title: "", updatedAt: now() }));
    await assertFails(updateDoc(ref, { title: "stale timestamp", updatedAt: new Date("2020-01-01T00:00:00Z") }));
    await assertFails(updateDoc(ref, { source: "admin", updatedAt: now() }));
    await assertFails(updateDoc(ref, { createdAt: new Date("2020-01-01T00:00:00Z"), updatedAt: now() }));
    await assertFails(updateDoc(ref, { notes: "x".repeat(1001), updatedAt: now() }));
    await assertFails(updateDoc(ref, { isAdmin: true, updatedAt: now() }));
    await assertFails(updateDoc(ref, { completed: "yes", updatedAt: now() }));
    await assertFails(updateDoc(doc(verified("bob"), "users", "maya", "tasks", "t1"), { title: "hijack", updatedAt: now() }));
    await assertFails(updateDoc(doc(unverified("maya"), "users", "maya", "tasks", "t1"), { title: "unverified", updatedAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "t2"), task({ title: "" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "t3"), task({ notes: "x".repeat(1001) })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "t4"), task({ completed: true })));
    await assertFails(setDoc(doc(unverified("maya"), "users", "maya", "tasks", "t5"), task()));
    await assertSucceeds(deleteDoc(ref));
  });

  test("tasks can repeat, carry a reminder date and link to a few items, within bounds", async () => {
    const maya = verified("maya");
    const ok = doc(maya, "users", "maya", "tasks", "r1");
    await assertSucceeds(setDoc(ok, task({ recurrence: "monthly", remindOn: "2026-10-25", links: [{ type: "rule", id: "form-i-765" }] })));
    await assertSucceeds(updateDoc(ok, { recurrence: "weekly", updatedAt: now() }));
    await assertFails(updateDoc(ok, { recurrence: "daily", updatedAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "r2"), task({ recurrence: "daily" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "r3"), task({ recurrence: "weekly", dueDate: "" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "r4"), task({ remindOn: "soon" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "r5"), task({ links: Array.from({ length: 6 }, (_, index) => ({ type: "news", id: `n${index}` })) })));
    await assertFails(setDoc(doc(maya, "users", "maya", "tasks", "r6"), task({ links: "news" })));
  });

  test("cases are private, bounded, and keep their creation time", async () => {
    const maya = verified("maya");
    const caseDoc = (extra = {}) => ({ title: "OPT application", kind: "opt-ead", status: "filed", timeline: [{ date: "2026-10-01", type: "note", text: "Filed online" }], createdAt: now(), updatedAt: now(), ...extra });
    const ref = doc(maya, "users", "maya", "cases", "c1");
    await assertSucceeds(setDoc(ref, caseDoc({ formNumber: "I-765", receiptNumber: "IOE1234567890", filedOn: "2026-10-01", notes: "n" })));
    await assertSucceeds(setDoc(ref, caseDoc({ status: "receipt-received", createdAt: (await getDoc(ref)).data().createdAt, updatedAt: now() })));
    await assertFails(setDoc(ref, caseDoc({ createdAt: new Date("2020-01-01T00:00:00Z") })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c2"), caseDoc({ status: "approved" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c3"), caseDoc({ kind: "green-card" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c4"), caseDoc({ title: "" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c5"), caseDoc({ timeline: Array.from({ length: 41 }, () => ({ date: "2026-10-01", type: "note", text: "x" })) })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c6"), caseDoc({ filedOn: "yesterday" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "cases", "c7"), caseDoc({ isAdmin: true })));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "cases", "c1")));
    await assertFails(setDoc(doc(unverified("maya"), "users", "maya", "cases", "c8"), caseDoc()));
    await assertSucceeds(deleteDoc(doc(unverified("maya"), "users", "maya", "cases", "c1")));
  });

  test("extracted document text needs consent, a slot ID, page counts, and the browser-local shape", async () => {
    const maya = verified("maya");
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-00"), localDocument()));
    await assertSucceeds(setDoc(doc(maya, "users", "maya"), { ...profile(), ...consent(true) }));
    const ref = doc(maya, "users", "maya", "documents", "doc-00");
    await assertSucceeds(setDoc(ref, localDocument()));
    await assertFails(setDoc(ref, localDocument({ name: "replaced.pdf" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-50"), localDocument()));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "random-uuid"), localDocument()));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-01"), localDocument({ storagePath: "users/maya/x.pdf" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-02"), localDocument({ chunks: [] })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-03"), localDocument({ chunks: Array.from({ length: 401 }, () => ({ page: 1, text: "x" })) })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-04"), localDocument({ pagesWithText: 3, pageCount: 2 })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-05"), localDocument({ pageCount: 101 })));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-06"), localDocument({ contentType: "text/html" })));
    await assertFails(setDoc(doc(verified("bob"), "users", "maya", "documents", "doc-07"), localDocument()));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "documents", "doc-00")));
    await assertSucceeds(deleteDoc(ref));
  });

  test("withdrawn consent blocks new extracted text but never blocks deleting it", async () => {
    const maya = verified("maya");
    await assertSucceeds(setDoc(doc(maya, "users", "maya"), { ...profile(), ...consent(true) }));
    await assertSucceeds(setDoc(doc(maya, "users", "maya", "documents", "doc-10"), localDocument()));
    await assertSucceeds(setDoc(doc(maya, "users", "maya"), consent(false), { merge: true }));
    await assertFails(setDoc(doc(maya, "users", "maya", "documents", "doc-11"), localDocument()));
    await assertSucceeds(deleteDoc(doc(unverified("maya"), "users", "maya", "documents", "doc-10")));
  });

  test("saved resources and saved updates are bounded, owner-only, and removable", async () => {
    const maya = verified("maya");
    await assertSucceeds(setDoc(doc(maya, "users", "maya", "savedResources", "r1"), resource()));
    await assertFails(setDoc(doc(maya, "users", "maya", "savedResources", "r2"), resource({ url: "http://insecure.example" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "savedResources", "r3"), resource({ url: "javascript:alert(1)" })));
    const saved = doc(maya, "users", "maya", "savedNews", "federal-register-2026-14439");
    await assertSucceeds(setDoc(saved, { newsItemId: "federal-register-2026-14439", createdAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "savedNews", "other"), { newsItemId: "federal-register-2026-14439", createdAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "savedNews", "note"), { newsItemId: "note", createdAt: now(), note: "x" }));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "savedNews", "federal-register-2026-14439")));
    await assertSucceeds(deleteDoc(saved));
    await assertSucceeds(deleteDoc(doc(maya, "users", "maya", "savedResources", "r1")));
  });

  test("tracked dates are manual, bounded, editable, and private", async () => {
    const maya = verified("maya");
    const entry = (extra = {}) => ({ label: "Passport expires", kind: "passport", date: "2028-03-01", notes: "", remindDays: 90, createdAt: now(), updatedAt: now(), ...extra });
    const ref = doc(maya, "users", "maya", "trackedDates", "d1");
    await assertSucceeds(setDoc(ref, entry()));
    await assertSucceeds(updateDoc(ref, { date: "2029-03-01", updatedAt: now() }));
    await assertFails(updateDoc(ref, { createdAt: now(), updatedAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "trackedDates", "d2"), entry({ date: "soon" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "trackedDates", "d3"), entry({ kind: "secret" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "trackedDates", "d4"), entry({ remindDays: 366 })));
    await assertFails(setDoc(doc(maya, "users", "maya", "trackedDates", "d5"), entry({ label: "" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "trackedDates", "d6"), entry({ extra: 1 })));
    await assertFails(setDoc(doc(unverified("maya"), "users", "maya", "trackedDates", "d7"), entry()));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "trackedDates", "d1")));
    await assertSucceeds(deleteDoc(ref));
  });

  test("contacts are private, bounded, and limited to known roles", async () => {
    const maya = verified("maya");
    const contact = (extra = {}) => ({ name: "Dr. Rao", role: "dso", phone: "+1 555 0100", email: "dso@school.edu", notes: "", createdAt: now(), updatedAt: now(), ...extra });
    const ref = doc(maya, "users", "maya", "contacts", "c1");
    await assertSucceeds(setDoc(ref, contact()));
    await assertSucceeds(updateDoc(ref, { phone: "+1 555 0101", updatedAt: now() }));
    await assertFails(setDoc(doc(maya, "users", "maya", "contacts", "c2"), contact({ role: "admin" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "contacts", "c3"), contact({ name: "" })));
    await assertFails(setDoc(doc(maya, "users", "maya", "contacts", "c4"), contact({ phone: "1".repeat(41) })));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "contacts", "c1")));
    await assertSucceeds(deleteDoc(ref));
  });

  test("planner progress documents are limited to the journey and travel lists", async () => {
    const maya = verified("maya");
    const planner = (extra = {}) => ({ have: ["passport"], custom: [{ id: "c1", label: "Charger" }], updatedAt: now(), ...extra });
    await assertSucceeds(setDoc(doc(maya, "users", "maya", "planner", "travel"), planner()));
    await assertSucceeds(setDoc(doc(maya, "users", "maya", "planner", "journey"), planner()));
    await assertFails(setDoc(doc(maya, "users", "maya", "planner", "other"), planner()));
    await assertFails(setDoc(doc(maya, "users", "maya", "planner", "travel"), planner({ have: Array.from({ length: 201 }, (_, i) => `i${i}`) })));
    await assertFails(setDoc(doc(maya, "users", "maya", "planner", "travel"), planner({ extra: true })));
    await assertFails(getDoc(doc(verified("bob"), "users", "maya", "planner", "travel")));
  });

  test("profile may carry a bounded list of interest topics", async () => {
    const maya = verified("maya");
    await assertSucceeds(setDoc(doc(maya, "users", "maya"), profile({ topics: ["employment", "travel-entry"] })));
    await assertFails(setDoc(doc(maya, "users", "maya"), profile({ topics: Array.from({ length: 13 }, (_, i) => `t${i}`) })));
    await assertFails(setDoc(doc(maya, "users", "maya"), profile({ topics: "employment" })));
  });

  test("an owner can delete the whole inventory, even before verifying, and nobody else can", async () => {
    const maya = verified("maya");
    await assertSucceeds(setDoc(doc(maya, "users", "maya"), profile()));
    await assertSucceeds(setDoc(doc(maya, "users", "maya", "tasks", "t1"), task()));
    await assertFails(deleteDoc(doc(verified("bob"), "users", "maya", "tasks", "t1")));
    await assertFails(deleteDoc(doc(verified("bob"), "users", "maya")));
    await assertSucceeds(deleteDoc(doc(unverified("maya"), "users", "maya", "tasks", "t1")));
    await assertSucceeds(deleteDoc(doc(unverified("maya"), "users", "maya")));
  });

  test("every collection the production API owns is closed in the zero-cost project", async () => {
    const maya = verified("maya");
    for (const path of [
      ["newsItems", "x"], ["reviewQueue", "x"], ["users", "maya", "notifications", "x"], ["users", "maya", "conversations", "x"],
      ["users", "maya", "newsPreferences", "x"], ["users", "maya", "ragChunks", "x"], ["users", "maya", "pushSubscriptions", "x"],
    ]) {
      await assertFails(getDoc(doc(maya, ...path)));
      await assertFails(setDoc(doc(maya, ...path), { value: 1 }));
    }
  });
});
