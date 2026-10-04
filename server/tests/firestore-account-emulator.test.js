import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, test } from "vitest";

import { createFirestoreStore } from "../src/firestore-store.js";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeEmulator("Firestore account purge against the emulator", () => {
  test("removes every subcollection of one student and leaves another student's data intact", async () => {
    const app = getApps()[0] || initializeApp({ projectId: "globeready-test" }, "account-purge-test");
    const firestore = getFirestore(app);
    const store = createFirestoreStore(firestore);
    const userA = `purge-a-${Date.now()}`;
    const userB = `purge-b-${Date.now()}`;

    for (const uid of [userA, userB]) {
      await store.profiles.set(uid, { fullName: uid });
      await store.tasks.create(uid, { title: "t", dueDate: "2026-11-01", completed: false });
      await store.documents.create(uid, { name: "d.pdf", storagePath: `users/${uid}/documents/x/d.pdf` });
      await store.ragChunks.replace(uid, "doc", [{ index: 0, page: 1, text: "private text" }]);
      await store.newsPreferences.set(uid, { topics: ["status"] });
      const conversation = await store.conversations.create(uid, { title: "q" });
      await store.conversationMessages.create(uid, conversation.id, { role: "user", text: "private question" });
      await firestore.collection("users").doc(uid).collection("pushSubscriptions").doc("legacy").set({ endpoint: "x" });
    }

    await store.purgeUser(userA);

    expect(await store.profiles.get(userA)).toBeNull();
    expect(await store.tasks.list(userA)).toEqual([]);
    expect(await store.documents.list(userA)).toEqual([]);
    expect(await store.ragChunks.list(userA)).toEqual([]);
    expect(await store.newsPreferences.get(userA)).toBeNull();
    expect((await store.conversations.list(userA))).toEqual([]);
    expect((await firestore.collection("users").doc(userA).collection("pushSubscriptions").get()).empty).toBe(true);

    expect((await store.profiles.get(userB)).fullName).toBe(userB);
    expect(await store.tasks.list(userB)).toHaveLength(1);
    expect(await store.documents.list(userB)).toHaveLength(1);
    expect(await store.ragChunks.list(userB)).toHaveLength(1);
    expect(await store.conversations.list(userB)).toHaveLength(1);
  }, 60_000);
});
