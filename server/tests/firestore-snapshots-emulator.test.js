import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, test } from "vitest";

import { createFirestoreStore } from "../src/firestore-store.js";
import { SNAPSHOT_COMMIT_PROTOCOL } from "../src/news/snapshots.js";

const describeEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const future = () => new Date(Date.now() + 60_000).toISOString();

describeEmulator("Firestore-backed source snapshots against the emulator", () => {
  function setup() {
    const app = getApps()[0] || initializeApp({ projectId: "globeready-test" }, "snapshot-test");
    const firestore = getFirestore(app);
    const store = createFirestoreStore(firestore);
    const sourceId = `snap-${randomUUID().slice(0, 8)}`;
    const key = `news-source:${sourceId}`;
    return { store, sourceId, key, owner: randomUUID() };
  }

  test("declares the atomic fenced commit protocol the sync engine requires", () => {
    const { store } = setup();
    expect(store.snapshots).toMatchObject({
      isPrivate: true,
      supportsFencing: true,
      commitProtocol: SNAPSHOT_COMMIT_PROTOCOL,
    });
    expect(typeof store.snapshots.save).toBe("function");
    expect(typeof store.snapshots.discard).toBe("function");
    expect(typeof store.snapshots.readCommitted).toBe("function");
  });

  test("commits a snapshot under the owning lease and reads it back with the matching commit", async () => {
    const { store, sourceId, key, owner } = setup();
    expect(await store.leases.acquire(key, owner, future())).toBe(true);
    const text = "Federal rule text for synthetic testing.";
    const saved = await store.snapshots.save(sourceId, hash(text), text, { fence: { key, owner } });
    expect(saved).toMatchObject({ committed: true, reused: false });
    expect(saved.path).toBe(`news-source-snapshots/${sourceId}/${hash(text)}.txt`);
    expect(await store.snapshots.readCommitted({ path: saved.path, commitId: saved.commitId })).toBe(text);
    await store.leases.release(key, owner);
  });

  test("an unchanged candidate reuses the committed snapshot instead of rewriting it", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const text = "Stable text.";
    const first = await store.snapshots.save(sourceId, hash(text), text, { fence: { key, owner } });
    const again = await store.snapshots.save(sourceId, hash(text), text, { fence: { key, owner } });
    expect(again).toMatchObject({ reused: true, commitId: first.commitId });
    await store.leases.release(key, owner);
  });

  test("a writer that no longer owns the lease cannot commit a snapshot", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    await expect(store.snapshots.save(sourceId, hash("x"), "x", { fence: { key, owner: "someone-else" } }))
      .rejects.toMatchObject({ code: "LEASE_LOST" });
    await store.leases.release(key, owner);
  });

  test("a snapshot identity cannot be overwritten with different text", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const digest = hash("original");
    await store.snapshots.save(sourceId, digest, "original", { fence: { key, owner } });
    await expect(store.snapshots.save(sourceId, digest, "altered", { fence: { key, owner } }))
      .rejects.toThrow(/different content/);
    await store.leases.release(key, owner);
  });

  test("reading requires the exact commit identity and a canonical path", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const saved = await store.snapshots.save(sourceId, hash("bound"), "bound", { fence: { key, owner } });
    await expect(store.snapshots.readCommitted({ path: saved.path, commitId: "wrong-commit" }))
      .rejects.toThrow(/matching committed snapshot marker/);
    await expect(store.snapshots.readCommitted({ path: `news-source-snapshots/../${sourceId}.txt`, commitId: saved.commitId }))
      .rejects.toThrow(/matching committed snapshot marker/);
    await store.leases.release(key, owner);
  });

  test("discarding removes only the snapshot bearing the matching commit", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const saved = await store.snapshots.save(sourceId, hash("discard"), "discard", { fence: { key, owner } });
    expect(await store.snapshots.discard({ path: saved.path, commitId: "not-this-commit" })).toBe(false);
    expect(await store.snapshots.discard({ path: saved.path, commitId: saved.commitId })).toBe(true);
    await expect(store.snapshots.readCommitted({ path: saved.path, commitId: saved.commitId }))
      .rejects.toThrow(/matching committed snapshot marker/);
    await store.leases.release(key, owner);
  });

  test("oversized source text is refused rather than truncated", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const big = "a".repeat(900_001);
    await expect(store.snapshots.save(sourceId, hash(big), big, { fence: { key, owner } }))
      .rejects.toMatchObject({ code: "snapshot_too_large" });
    await store.leases.release(key, owner);
  });

  test("a snapshot and the news item it supports commit under one lease and read back together", async () => {
    const { store, sourceId, key, owner } = setup();
    await store.leases.acquire(key, owner, future());
    const text = "Synthetic official text for the approval check.";
    const digest = hash(text);
    const snapshot = await store.snapshots.save(sourceId, digest, text, { fence: { key, owner } });
    const upserted = await store.news.upsert(`${sourceId}:item-1`, {
      title: "Synthetic item",
      canonicalUrl: "https://www.federalregister.gov/documents/2026/01/01/synthetic",
      sourceId,
      sourceKey: `${sourceId}:item-1`,
      contentHash: digest,
      snapshotPath: snapshot.path,
      snapshotCommitId: snapshot.commitId,
      editorialState: "review-required",
      documentType: "informational",
      legalState: "informational",
      urgency: "low",
      relevance: "relevant",
      highImpact: false,
      topics: [],
      visaTypes: [],
    }, { fence: { key, owner } });
    expect(upserted.item).toMatchObject({ snapshotPath: snapshot.path, snapshotCommitId: snapshot.commitId });
    expect(await store.snapshots.readCommitted({ path: snapshot.path, commitId: snapshot.commitId })).toBe(text);
    await store.leases.release(key, owner);
  });
});
