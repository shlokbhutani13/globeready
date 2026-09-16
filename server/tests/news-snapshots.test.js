import { describe, expect, test } from "vitest";

import { createSnapshotStore } from "../src/news/snapshots.js";

const fixedClock = () => new Date("2026-09-14T12:00:00.000Z");

function fakeFile(name, metadata = {}, events = null) {
  const calls = { delete: 0, download: 0, save: [] };
  return {
    name,
    metadata,
    content: null,
    calls,
    async delete() {
      calls.delete += 1;
    },
    async download() {
      calls.download += 1;
      return [Buffer.from(this.content || "")];
    },
    async getMetadata() {
      return [this.metadata];
    },
    async save(content, options) {
      events?.push("save");
      calls.save.push({ content, options });
      this.content = content;
      this.metadata = options.metadata;
    },
  };
}

function fakeBucket(existing = [], { promote } = {}) {
  const files = new Map(existing.map((file) => [file.name, file]));
  const promotions = [];
  const rollbacks = [];
  const bucket = {
    files,
    promotions,
    rollbacks,
    file(name) {
      if (!files.has(name)) files.set(name, fakeFile(name));
      return files.get(name);
    },
    async getFiles(options) {
      return [[...files.values()], options];
    },
  };
  bucket.snapshotCommitAdapter = {
    capability: "atomic-fenced-snapshot-v1",
    async promote(input) {
      if (promote) return promote(input, bucket);
      await input.fence.assertOwned();
      input.signal?.throwIfAborted();
      promotions.push(input);
      const canonical = bucket.file(input.canonicalPath);
      canonical.content = bucket.file(input.pendingPath).content;
      canonical.metadata = input.metadata;
      return { commitId: input.commitId };
    },
    async rollback({ canonicalPath, commitId }) {
      rollbacks.push({ canonicalPath, commitId });
      const canonical = files.get(canonicalPath);
      if (canonical?.metadata?.metadata?.commitId === commitId) {
        await canonical.delete();
        files.delete(canonicalPath);
      }
    },
  };
  return bucket;
}

describe("private source snapshots", () => {
  test("writes normalized content to a deterministic private no-store object", async () => {
    const events = [];
    const bucket = fakeBucket();
    const store = createSnapshotStore({ bucket, clock: fixedClock });
    const contentHash = "a".repeat(64);
    const fence = {
      key: "news-source:federal-register",
      owner: "owner-one",
      assertOwned: async () => { events.push("fence"); },
    };

    expect(store.isPrivate).toBe(true);
    expect(store.supportsFencing).toBe(true);
    const result = await store.save("federal-register", contentHash, "  Official\r\n  source   text  ", { fence });

    expect(result).toMatchObject({
      path: `news-source-snapshots/federal-register/${contentHash}.txt`,
      committed: true,
      commitId: expect.any(String),
    });
    const pending = [...bucket.files.values()].find((file) => file.name.startsWith("news-source-snapshot-pending/"));
    expect(events).toContain("fence");
    expect(pending.calls.save).toEqual([{
      content: "Official source text",
      options: expect.objectContaining({
        predefinedAcl: "private",
        resumable: false,
        metadata: expect.objectContaining({
          cacheControl: "private, no-store",
          contentType: "text/plain; charset=utf-8",
          metadata: expect.objectContaining({
            sourceId: "federal-register",
            contentHash,
            snapshotState: "pending",
          }),
        }),
      }),
    }]);
    expect(bucket.promotions).toEqual([expect.objectContaining({
      pendingPath: pending.name,
      canonicalPath: `news-source-snapshots/federal-register/${contentHash}.txt`,
      commitId: result.commitId,
      metadata: expect.objectContaining({
        metadata: expect.objectContaining({ snapshotState: "committed", commitId: result.commitId }),
      }),
    })]);
    expect(pending.calls.delete).toBe(1);
  });

  test("deletes only snapshots older than 90 days whose hashes have no retained legal-state revision", async () => {
    const deletedHash = "a".repeat(64);
    const retainedHash = "b".repeat(64);
    const freshHash = "c".repeat(64);
    const oldDeleted = fakeFile(`news-source-snapshots/source/${deletedHash}.txt`, {
      timeCreated: "2026-06-01T00:00:00.000Z",
      metadata: { contentHash: deletedHash, snapshotState: "committed", commitId: "deleted" },
    });
    const oldRetained = fakeFile(`news-source-snapshots/source/${retainedHash}.txt`, {
      timeCreated: "2026-05-01T00:00:00.000Z",
      metadata: { contentHash: retainedHash, snapshotState: "committed", commitId: "retained" },
    });
    const fresh = fakeFile(`news-source-snapshots/source/${freshHash}.txt`, {
      timeCreated: "2026-08-01T00:00:00.000Z",
      metadata: { contentHash: freshHash, snapshotState: "committed", commitId: "fresh" },
    });
    const bucket = fakeBucket([oldDeleted, oldRetained, fresh]);
    const store = createSnapshotStore({ bucket, clock: fixedClock, retentionDays: 90 });

    await expect(store.removeExpired({ retainHashes: new Set([retainedHash]) })).resolves.toEqual({
      scanned: 3,
      deleted: 1,
      retained: 2,
      invalid: 0,
    });
    expect(oldDeleted.calls.delete).toBe(1);
    expect(oldRetained.calls.delete).toBe(0);
    expect(fresh.calls.delete).toBe(0);
  });

  test("retains a snapshot whose metadata hash does not match its object-path hash", async () => {
    const pathHash = "a".repeat(64);
    const metadataHash = "b".repeat(64);
    const mismatched = fakeFile(`news-source-snapshots/source/${pathHash}.txt`, {
      timeCreated: "2026-05-01T00:00:00.000Z",
      metadata: { contentHash: metadataHash, snapshotState: "committed", commitId: "mismatched" },
    });
    const store = createSnapshotStore({ bucket: fakeBucket([mismatched]), clock: fixedClock });

    await expect(store.removeExpired({ retainHashes: new Set([metadataHash]) })).resolves.toEqual({
      scanned: 1,
      deleted: 0,
      retained: 1,
      invalid: 1,
    });
    expect(mismatched.calls.delete).toBe(0);
  });

  test("reads only a canonical snapshot with its matching committed marker", async () => {
    const hash = "e".repeat(64);
    const path = `news-source-snapshots/source/${hash}.txt`;
    const committed = fakeFile(path, {
      metadata: { contentHash: hash, snapshotState: "committed", commitId: "commit-one" },
    });
    committed.content = "Committed source text";
    const store = createSnapshotStore({ bucket: fakeBucket([committed]), clock: fixedClock });

    await expect(store.readCommitted({ path, commitId: "commit-one" })).resolves.toBe("Committed source text");
    await expect(store.readCommitted({ path, commitId: "another-commit" })).rejects.toThrow(/committed snapshot/i);
    committed.metadata.metadata.snapshotState = "pending";
    await expect(store.readCommitted({ path, commitId: "commit-one" })).rejects.toThrow(/committed snapshot/i);
    expect(committed.calls.download).toBe(1);
  });

  test("reuses matching committed content without staging or promoting another generation", async () => {
    const hash = "f".repeat(64);
    const path = `news-source-snapshots/source/${hash}.txt`;
    const committed = fakeFile(path, {
      metadata: {
        sourceId: "source",
        contentHash: hash,
        snapshotState: "committed",
        commitId: "existing-commit",
        expiresAt: "2026-12-13T12:00:00.000Z",
      },
    });
    committed.content = "Existing committed source text";
    const bucket = fakeBucket([committed]);
    const store = createSnapshotStore({ bucket, clock: fixedClock });
    const fence = {
      key: "news-source:source",
      owner: "owner-one",
      assertOwned: async () => {},
    };

    await expect(store.save("source", hash, " Existing   committed source text ", { fence }))
      .resolves.toMatchObject({ path, commitId: "existing-commit", committed: true, reused: true });
    expect(bucket.promotions).toEqual([]);
    expect([...bucket.files.keys()].filter((name) => name.startsWith("news-source-snapshot-pending/"))).toEqual([]);
  });

  test("rejects unsafe source identifiers before constructing an object path", async () => {
    const store = createSnapshotStore({ bucket: fakeBucket(), clock: fixedClock });

    await expect(store.save("../other-bucket", "a".repeat(64), "source", {
      fence: { assertOwned: async () => {} },
    }))
      .rejects.toThrow(/source id/i);
  });

  test("requires an ownership fence for every snapshot commit", async () => {
    const store = createSnapshotStore({ bucket: fakeBucket(), clock: fixedClock });

    await expect(store.save("federal-register", "a".repeat(64), "source"))
      .rejects.toThrow(/fence/i);
  });

  test("fails closed when the bucket has no atomic fenced promotion adapter", () => {
    const bucket = fakeBucket();
    delete bucket.snapshotCommitAdapter;

    expect(() => createSnapshotStore({ bucket, clock: fixedClock })).toThrow(/atomic.*fenc|promotion adapter/i);
  });

  test("leaves no committed canonical snapshot when ownership is lost during a slow staged save", async () => {
    let releaseSave;
    let markSaveStarted;
    const saveStarted = new Promise((resolve) => { markSaveStarted = resolve; });
    const bucket = fakeBucket();
    const originalFile = bucket.file.bind(bucket);
    bucket.file = (name) => {
      const file = originalFile(name);
      if (!file.slowSave) {
        file.slowSave = true;
        file.save = async (content, options) => {
          markSaveStarted();
          await new Promise((resolve) => { releaseSave = resolve; });
          file.calls.save.push({ content, options });
          file.content = content;
          file.metadata = options.metadata;
        };
      }
      return file;
    };
    let owned = true;
    const leaseError = new Error("lease lost");
    leaseError.code = "LEASE_LOST";
    const controller = new AbortController();
    const store = createSnapshotStore({ bucket, clock: fixedClock });
    const contentHash = "d".repeat(64);
    const saving = store.save("federal-register", contentHash, "Official text", {
      fence: {
        key: "news-source:federal-register",
        owner: "owner-one",
        async assertOwned() {
          if (!owned) throw leaseError;
        },
      },
      signal: controller.signal,
    });

    await saveStarted;
    owned = false;
    controller.abort(leaseError);
    releaseSave();

    await expect(saving).rejects.toMatchObject({ code: "LEASE_LOST" });
    expect(bucket.promotions).toEqual([]);
    const canonical = bucket.files.get(`news-source-snapshots/federal-register/${contentHash}.txt`);
    expect(canonical?.content || canonical?.metadata?.metadata?.snapshotState).toBeFalsy();
    const pending = [...bucket.files.values()].find((file) => file.name.startsWith("news-source-snapshot-pending/"));
    expect(pending.calls.delete).toBe(1);
  });
});
