import { randomUUID } from "node:crypto";

const snapshotPrefix = "news-source-snapshots/";
const pendingSnapshotPrefix = "news-source-snapshot-pending/";
export const SNAPSHOT_COMMIT_PROTOCOL = "atomic-fenced-snapshot-v1";
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
  const snapshotState = metadata?.metadata?.snapshotState;
  const commitId = metadata?.metadata?.commitId;
  const match = /^news-source-snapshots\/[a-z0-9](?:[a-z0-9_-]{0,198}[a-z0-9])?\/([a-f0-9]{64})\.txt$/iu.exec(file?.name || "");
  const pathHash = match?.[1] || null;
  return {
    hash: pathHash,
    commitId,
    valid: Boolean(pathHash && typeof stored === "string" && stored === pathHash
      && snapshotState === "committed" && typeof commitId === "string" && commitId),
  };
}

function abortReason(signal) {
  if (!signal?.aborted) return null;
  return signal.reason instanceof Error ? signal.reason : new Error("Snapshot save was aborted.");
}

/*
 * A generic object-store bucket cannot serialize a lease-store ownership check with object promotion.
 * The required adapter owns that cross-service boundary. Its promote operation must check the supplied
 * fence and AbortSignal at its serialization point, publish the canonical object with the supplied
 * committed metadata as one operation, and leave no object for this commitId when it rejects. Its
 * rollback operation must remove only the canonical generation bearing the supplied commitId.
 */
export function createSnapshotStore({
  bucket,
  clock = () => new Date(),
  retentionDays = 90,
  commitAdapter = bucket?.snapshotCommitAdapter,
} = {}) {
  if (!bucket || typeof bucket.file !== "function" || typeof bucket.getFiles !== "function") {
    throw new Error("Snapshot store requires a private bucket.");
  }
  if (commitAdapter?.capability !== SNAPSHOT_COMMIT_PROTOCOL
    || typeof commitAdapter.promote !== "function" || typeof commitAdapter.rollback !== "function") {
    throw new Error("Snapshot store requires an atomic fenced promotion adapter.");
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("Snapshot retention days must be a positive integer.");
  }

  async function discard({ path, commitId } = {}) {
    if (typeof path !== "string" || typeof commitId !== "string" || !commitId) return false;
    await commitAdapter.rollback({ bucket, canonicalPath: path, commitId });
    return true;
  }

  return {
    isPrivate: true,
    supportsFencing: true,
    commitProtocol: SNAPSHOT_COMMIT_PROTOCOL,
    discard,
    async save(sourceId, contentHash, content, { fence, signal } = {}) {
      const now = nowFrom(clock);
      const path = snapshotPath(sourceId, contentHash);
      const expiresAt = new Date(now.valueOf() + retentionDays * dayMilliseconds).toISOString();
      if (!fence || typeof fence.assertOwned !== "function"
        || typeof fence.key !== "string" || !fence.key || typeof fence.owner !== "string" || !fence.owner) {
        throw new Error("Snapshot save requires an ownership fence.");
      }
      const commitId = randomUUID();
      const pendingPath = `${pendingSnapshotPrefix}${sourceId}/${contentHash}/${commitId}.txt`;
      const pendingFile = bucket.file(pendingPath);
      const sharedMetadata = {
        cacheControl: "private, no-store",
        contentType: "text/plain; charset=utf-8",
        metadata: {
          sourceId,
          contentHash,
          expiresAt,
          commitId,
          fenceKey: fence.key,
          fenceOwner: fence.owner,
        },
      };
      const assertActive = async () => {
        await fence.assertOwned();
        const aborted = abortReason(signal);
        if (aborted) throw aborted;
      };

      try {
        await assertActive();
        await pendingFile.save(normalizedContent(content), {
          predefinedAcl: "private",
          resumable: false,
          validation: "crc32c",
          signal,
          metadata: {
            ...sharedMetadata,
            metadata: {
              ...sharedMetadata.metadata,
              snapshotState: "pending",
              canonicalPath: path,
            },
          },
        });
        await assertActive();
        const promoted = await commitAdapter.promote({
          bucket,
          pendingPath,
          canonicalPath: path,
          commitId,
          fence,
          signal,
          metadata: {
            ...sharedMetadata,
            metadata: {
              ...sharedMetadata.metadata,
              snapshotState: "committed",
            },
          },
        });
        if (promoted?.commitId !== commitId) {
          throw new Error("Snapshot promotion adapter returned an invalid commit marker.");
        }
        await pendingFile.delete({ ignoreNotFound: true });
        await assertActive();
        return { path, expiresAt, committed: true, commitId };
      } catch (error) {
        let cleanupError = null;
        try {
          await discard({ path, commitId });
        } catch (caught) {
          cleanupError = caught;
        }
        try {
          await pendingFile.delete({ ignoreNotFound: true });
        } catch (caught) {
          cleanupError ||= caught;
        }
        if (cleanupError) {
          const failed = new Error("Snapshot ownership was lost and conditional cleanup failed.", { cause: error });
          failed.cleanupCause = cleanupError;
          throw failed;
        }
        throw error;
      }
    },

    async readCommitted({ path, commitId } = {}) {
      if (typeof path !== "string" || typeof commitId !== "string" || !commitId) {
        throw new Error("A matching committed snapshot marker is required.");
      }
      const file = bucket.file(path);
      const [metadata] = await file.getMetadata();
      const identity = metadataHash(file, metadata);
      if (!identity.valid || identity.commitId !== commitId) {
        throw new Error("A matching committed snapshot marker is required.");
      }
      const [content] = await file.download();
      return Buffer.from(content).toString("utf8");
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
