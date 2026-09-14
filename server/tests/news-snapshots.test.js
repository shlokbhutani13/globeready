import { describe, expect, test } from "vitest";

import { createSnapshotStore } from "../src/news/snapshots.js";

const fixedClock = () => new Date("2026-09-14T12:00:00.000Z");

function fakeFile(name, metadata = {}) {
  const calls = { delete: 0, save: [] };
  return {
    name,
    metadata,
    calls,
    async delete() {
      calls.delete += 1;
    },
    async getMetadata() {
      return [metadata];
    },
    async save(content, options) {
      calls.save.push({ content, options });
    },
  };
}

function fakeBucket(existing = []) {
  const files = new Map(existing.map((file) => [file.name, file]));
  return {
    file(name) {
      if (!files.has(name)) files.set(name, fakeFile(name));
      return files.get(name);
    },
    async getFiles(options) {
      return [[...files.values()], options];
    },
  };
}

describe("private source snapshots", () => {
  test("writes normalized content to a deterministic private no-store object", async () => {
    const bucket = fakeBucket();
    const store = createSnapshotStore({ bucket, clock: fixedClock });
    const contentHash = "a".repeat(64);

    expect(store.isPrivate).toBe(true);
    const result = await store.save("federal-register", contentHash, "  Official\r\n  source   text  ");
    const file = bucket.file(`news-source-snapshots/federal-register/${contentHash}.txt`);

    expect(result.path).toBe(`news-source-snapshots/federal-register/${contentHash}.txt`);
    expect(file.calls.save).toEqual([{
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
          }),
        }),
      }),
    }]);
  });

  test("deletes only snapshots older than 90 days whose hashes have no retained legal-state revision", async () => {
    const deletedHash = "a".repeat(64);
    const retainedHash = "b".repeat(64);
    const freshHash = "c".repeat(64);
    const oldDeleted = fakeFile(`news-source-snapshots/source/${deletedHash}.txt`, {
      timeCreated: "2026-06-01T00:00:00.000Z",
      metadata: { contentHash: deletedHash },
    });
    const oldRetained = fakeFile(`news-source-snapshots/source/${retainedHash}.txt`, {
      timeCreated: "2026-05-01T00:00:00.000Z",
      metadata: { contentHash: retainedHash },
    });
    const fresh = fakeFile(`news-source-snapshots/source/${freshHash}.txt`, {
      timeCreated: "2026-08-01T00:00:00.000Z",
      metadata: { contentHash: freshHash },
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
      metadata: { contentHash: metadataHash },
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

  test("rejects unsafe source identifiers before constructing an object path", async () => {
    const store = createSnapshotStore({ bucket: fakeBucket(), clock: fixedClock });

    await expect(store.save("../other-bucket", "a".repeat(64), "source"))
      .rejects.toThrow(/source id/i);
  });
});
