const snapshotPrefix = "news-source-snapshots/";
const dayMilliseconds = 86_400_000;

function nowFrom(clock) {
  if (typeof clock !== "function") throw new Error("Snapshot store clock must be a function.");
  const now = new Date(clock());
  if (Number.isNaN(now.valueOf())) throw new Error("Snapshot store clock returned an invalid date.");
  return now;
}

function snapshotPath(sourceId, contentHash) {
  if (typeof sourceId !== "string" || !/^[a-z0-9](?:[a-z0-9_-]{0,198}[a-z0-9])?$/iu.test(sourceId)) {
    throw new Error("Snapshot source ID is invalid.");
  }
  if (typeof contentHash !== "string" || !/^[a-f0-9]{64}$/u.test(contentHash)) {
    throw new Error("Snapshot content hash must be a lowercase SHA-256 hash.");
  }
  return `${snapshotPrefix}${sourceId}/${contentHash}.txt`;
}

function normalizedContent(value) {
  if (typeof value !== "string") throw new Error("Snapshot content must be text.");
  return value.toWellFormed().replace(/\s+/gu, " ").trim();
}

function metadataHash(file, metadata) {
  const stored = metadata?.metadata?.contentHash;
  const match = /^news-source-snapshots\/[a-z0-9](?:[a-z0-9_-]{0,198}[a-z0-9])?\/([a-f0-9]{64})\.txt$/iu.exec(file?.name || "");
  const pathHash = match?.[1] || null;
  return {
    hash: pathHash,
    valid: Boolean(pathHash && typeof stored === "string" && stored === pathHash),
  };
}

export function createSnapshotStore({ bucket, clock = () => new Date(), retentionDays = 90 } = {}) {
  if (!bucket || typeof bucket.file !== "function" || typeof bucket.getFiles !== "function") {
    throw new Error("Snapshot store requires a private bucket.");
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("Snapshot retention days must be a positive integer.");
  }

  return {
    isPrivate: true,
    async save(sourceId, contentHash, content) {
      const now = nowFrom(clock);
      const path = snapshotPath(sourceId, contentHash);
      const expiresAt = new Date(now.valueOf() + retentionDays * dayMilliseconds).toISOString();
      await bucket.file(path).save(normalizedContent(content), {
        predefinedAcl: "private",
        resumable: false,
        validation: "crc32c",
        metadata: {
          cacheControl: "private, no-store",
          contentType: "text/plain; charset=utf-8",
          metadata: {
            sourceId,
            contentHash,
            expiresAt,
          },
        },
      });
      return { path, expiresAt };
    },

    async removeExpired({ retainHashes = new Set() } = {}) {
      const retainedHashes = retainHashes instanceof Set
        ? retainHashes
        : new Set(Array.isArray(retainHashes) ? retainHashes : []);
      const cutoff = nowFrom(clock).valueOf() - retentionDays * dayMilliseconds;
      const [files] = await bucket.getFiles({ prefix: snapshotPrefix });
      let deleted = 0;
      let retained = 0;
      let invalid = 0;

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const createdAt = Date.parse(metadata?.timeCreated || "");
        const identity = metadataHash(file, metadata);
        if (!identity.valid) {
          invalid += 1;
          retained += 1;
          continue;
        }
        if (!Number.isFinite(createdAt) || createdAt >= cutoff || retainedHashes.has(identity.hash)) {
          retained += 1;
          continue;
        }
        await file.delete();
        deleted += 1;
      }

      return { scanned: files.length, deleted, retained, invalid };
    },
  };
}
