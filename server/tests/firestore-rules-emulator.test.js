import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const projectId = "globeready-test";
let environment;
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

// Shapes the client writes. The rules tests modify one field at a time from these.
function validFor(name) {
  const stamp = new Date("2026-01-01T00:00:00Z");
  if (name === "tasks") {
    return { title: "Renew passport", category: "General", priority: "medium", dueDate: "2026-11-01", notes: "", completed: false, source: "user", createdAt: stamp, updatedAt: stamp };
  }
  if (name === "savedResources") {
    return { title: "Maintaining status", url: "https://studyinthestates.dhs.gov/students/maintaining-status", category: "status", source: "Study in the States", createdAt: stamp, updatedAt: stamp };
  }
  return { value: name };
}

function validDocument(uid, docId) {
  const stamp = new Date("2026-01-01T00:00:00Z");
  return {
    name: "i20.pdf", category: "Other", contentType: "application/pdf", size: 1024, storageMode: "firebase",
    storagePath: `users/${uid}/documents/${docId}/i20.pdf`, analysisStatus: "not_requested",
    uploadedAt: stamp, createdAt: stamp, updatedAt: stamp,
  };
}

describeEmulator("Firestore authorization rules", () => {
  beforeAll(async () => {
    const rules = await readFile(new URL("../../firestore.rules", import.meta.url), "utf8");
    environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, "newsItems", "public"), {
        editorialState: "approved",
        title: "Public update",
      });
      await setDoc(doc(database, "newsItems", "draft"), {
        editorialState: "review-required",
        title: "Private draft",
      });
      await setDoc(doc(database, "users", "alice", "tasks", "one"), { title: "Alice task" });
    });
  });

  afterAll(async () => {
    await environment?.cleanup();
  });

  test("allows public news reads but rejects private news and client writes", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(database, "newsItems", "public")));
    await assertFails(getDoc(doc(database, "newsItems", "draft")));
    await assertFails(setDoc(doc(database, "newsItems", "injected"), {
      editorialState: "approved",
    }));
  });

  test("requires a publication-state constraint for public list queries", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDocs(query(
      collection(database, "newsItems"),
      where("editorialState", "in", ["published-source-only", "approved"]),
    )));
    await assertFails(getDocs(collection(database, "newsItems")));
  });

  test("isolates every user-owned collection from other students", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    for (const name of ["tasks", "savedResources", "notifications", "savedNews", "newsPreferences", "pushSubscriptions"]) {
      await environment.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "users", "alice", name, "seeded"), validFor(name));
      });
      await assertFails(getDoc(doc(bob, "users", "alice", name, "seeded")));
      await assertFails(setDoc(doc(bob, "users", "alice", name, "intruder"), validFor(name)));
    }
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "alice", "documents", "doc1"), validDocument("alice", "doc1"));
    });
    await assertFails(getDoc(doc(bob, "users", "alice", "documents", "doc1")));
    await assertFails(setDoc(doc(bob, "users", "alice", "documents", "doc2"), validDocument("alice", "doc2")));
    await assertSucceeds(getDoc(doc(alice, "users", "alice", "documents", "doc1")));
    await assertFails(getDoc(doc(bob, "users", "alice", "conversations", "one", "messages", "one")));
  });

  test("a student can create a valid task and toggle its completion, and nothing else", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const task = doc(alice, "users", "alice", "tasks", "task-ok");
    await assertSucceeds(setDoc(task, validFor("tasks")));
    await assertSucceeds(updateDoc(task, { completed: true, updatedAt: new Date() }));
    await assertFails(updateDoc(task, { title: "changed title" }));
    await assertFails(updateDoc(task, { completed: "yes" }));
  });

  test("invalid task shapes are refused", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const tasks = (id) => doc(alice, "users", "alice", "tasks", id);
    await assertFails(setDoc(tasks("empty"), { ...validFor("tasks"), title: "" }));
    await assertFails(setDoc(tasks("number"), { ...validFor("tasks"), title: 42 }));
    await assertFails(setDoc(tasks("long"), { ...validFor("tasks"), title: "x".repeat(201) }));
    await assertFails(setDoc(tasks("priority"), { ...validFor("tasks"), priority: "urgent!" }));
    await assertFails(setDoc(tasks("source"), { ...validFor("tasks"), source: "system" }));
    await assertFails(setDoc(tasks("extra"), { ...validFor("tasks"), isAdmin: true }));
    await assertFails(setDoc(tasks("date"), { ...validFor("tasks"), dueDate: "next week" }));
  });

  test("a document record is accepted only for the owner's own storage path and an allowed type", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "users", "alice", "documents", "doc-create"), validDocument("alice", "doc-create")));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc2"),
      { ...validDocument("alice", "doc2"), storagePath: "users/bob/documents/doc2/i20.pdf" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc3"),
      { ...validDocument("alice", "doc3"), storagePath: "users/alice/documents/doc3/../../bob/x.pdf" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc4"),
      { ...validDocument("alice", "doc4"), storagePath: "users/alice/documents/other-id/i20.pdf" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc5"),
      { ...validDocument("alice", "doc5"), contentType: "text/html" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc6"),
      { ...validDocument("alice", "doc6"), size: 10 * 1024 * 1024 + 1 }));
    await assertFails(setDoc(doc(alice, "users", "alice", "documents", "doc7"),
      { ...validDocument("alice", "doc7"), analysisStatus: "complete" }));
  });

  test("students cannot edit or delete document records directly; the API does that with the stored file", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const record = doc(alice, "users", "alice", "documents", "doc1");
    await assertFails(updateDoc(record, { name: "renamed.pdf" }));
    await assertFails(deleteDoc(record));
  });

  test("saved resources must be https links with bounded text", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    await assertSucceeds(setDoc(doc(alice, "users", "alice", "savedResources", "r1"), validFor("savedResources")));
    await assertFails(setDoc(doc(alice, "users", "alice", "savedResources", "r2"), { ...validFor("savedResources"), url: "http://insecure.example" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "savedResources", "r3"), { ...validFor("savedResources"), url: "javascript:alert(1)" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "savedResources", "r4"), { ...validFor("savedResources"), url: `https://x.example/${"a".repeat(500)}` }));
  });

  test("a student can mark an in-app notification read, and nothing else", async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "alice", "notifications", "n1"), { title: "Due", read: false, updatedAt: new Date() });
    });
    const alice = environment.authenticatedContext("alice").firestore();
    const notice = doc(alice, "users", "alice", "notifications", "n1");
    await assertSucceeds(updateDoc(notice, { read: true, updatedAt: new Date() }));
    await assertFails(updateDoc(notice, { title: "changed" }));
    await assertFails(setDoc(doc(alice, "users", "alice", "notifications", "n2"), { title: "forged", read: false }));
  });

  test("records written by the API are read-only to the owner", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    for (const path of [
      ["users", "alice"],
      ["users", "alice", "newsPreferences", "prefs"],
      ["users", "alice", "savedNews", "item"],
      ["users", "alice", "conversations", "c1"],
      ["users", "alice", "conversations", "c1", "messages", "m1"],
      ["users", "alice", "pushSubscriptions", "legacy"],
      ["users", "alice", "ragChunks", "chunk"],
    ]) {
      await assertFails(setDoc(doc(alice, ...path), { value: "tampered" }));
    }
    await assertSucceeds(getDoc(doc(alice, "users", "alice")));
  });

  test("keeps provenance, review, run, source, lease, and RAG data server-only", async () => {
    const database = environment.authenticatedContext("alice").firestore();
    for (const path of [
      "newsItemState/item",
      "reviewQueue/review",
      "newsReviewAudits/audit",
      "newsSources/source",
      "newsRuns/run",
      "newsLeases/lease",
      "newsSourceSnapshots/snapshot",
      "users/alice/ragChunks/chunk",
      "newsItems/public/revisions/revision",
    ]) {
      await assertFails(getDoc(doc(database, path)));
      await assertFails(setDoc(doc(database, path), { value: true }));
    }
  });
});
