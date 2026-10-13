const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/u;
const sourceIdPattern = /^[a-z0-9][a-z0-9_-]{0,127}$/u;

function isoNow(clock) {
  const value = new Date(clock());
  if (Number.isNaN(value.valueOf())) throw new Error("News operations clock returned an invalid date.");
  return value.toISOString();
}

export function createNewsOperations({
  sync,
  store,
  clock = () => new Date(),
  writesEnabled = false,
} = {}) {
  if (!sync || typeof sync.syncSource !== "function") throw new Error("News operations require a sync service.");
  if (!store?.newsOperations?.get || !store.newsOperations.upsert) {
    throw new Error("News operations require an idempotency store.");
  }

  return {
    async run({ operationId, dryRun = true, sourceIds = [], limit = 20, cleanup = false } = {}) {
      if (typeof operationId !== "string" || !operationIdPattern.test(operationId)) {
        throw new Error("A valid operation ID is required.");
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("News operations limit must be an integer from 1 to 20.");
      }
      if (!Array.isArray(sourceIds) || sourceIds.some((id) => typeof id !== "string" || !sourceIdPattern.test(id))) {
        throw new Error("Every source ID must be valid.");
      }
      if (dryRun !== true && dryRun !== false) throw new Error("dryRun must be a boolean.");
      if (!dryRun && !writesEnabled) throw new Error("News operation writes are disabled.");

      const existing = await store.newsOperations.get(operationId);
      if (existing?.summary) return { ...existing.summary, replayed: true };

      const sources = [];
      for (const sourceId of sourceIds.slice(0, limit)) {
        const result = await sync.syncSource(sourceId, { dryRun });
        sources.push({ sourceId, status: result?.status || "unknown" });
      }

      let deleted = 0;
      if (cleanup && store.snapshots?.listExpired && store.snapshots?.deleteExpired) {
        const expired = await store.snapshots.listExpired(isoNow(clock), limit);
        for (const snapshot of expired.slice(0, limit)) {
          if (await store.snapshots.deleteExpired(snapshot.path)) deleted += 1;
        }
      }

      const summary = {
        operationId,
        dryRun,
        replayed: false,
        startedAt: isoNow(clock),
        sources,
        cleanup: { deleted },
      };
      await store.newsOperations.upsert(operationId, { summary });
      return summary;
    },
  };
}
