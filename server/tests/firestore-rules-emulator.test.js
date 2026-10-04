import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

const projectId = "globeready-test";
let environment;
const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

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

  test("isolates every user-owned collection", async () => {
    const alice = environment.authenticatedContext("alice").firestore();
    const bob = environment.authenticatedContext("bob").firestore();
    for (const name of [
      "tasks", "documents", "savedResources", "newsPreferences", "savedNews",
      "notifications", "pushSubscriptions",
    ]) {
      const owned = doc(alice, "users", "alice", name, "one");
      await assertSucceeds(setDoc(owned, { value: name }));
      await assertSucceeds(getDoc(owned));
      await assertFails(getDoc(doc(bob, "users", "alice", name, "one")));
      await assertFails(setDoc(doc(bob, "users", "alice", name, "two"), { value: "attack" }));
    }
    const ownedMessage = doc(alice, "users", "alice", "conversations", "one", "messages", "one");
    await assertSucceeds(setDoc(ownedMessage, { value: "message" }));
    await assertFails(getDoc(doc(bob, "users", "alice", "conversations", "one", "messages", "one")));
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
      "users/alice/ragChunks/chunk",
      "newsItems/public/revisions/revision",
    ]) {
      await assertFails(getDoc(doc(database, path)));
      await assertFails(setDoc(doc(database, path), { value: true }));
    }
  });
});
