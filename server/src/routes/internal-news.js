import { Router } from "express";

function invalid(response, status, code, message) {
  return response.status(status).json({ error: { code, message } });
}

export function internalNewsRouter(store, { newsSync, newsSyncEnabled = false, defaultSourceIds = [] } = {}) {
  const router = Router();
  router.post("/sync", async (request, response) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some((field) => !["sourceIds", "dryRun"].includes(field))
      || !Array.isArray(body.sourceIds) || body.sourceIds.length > 20
      || new Set(body.sourceIds).size !== body.sourceIds.length
      || body.sourceIds.some((id) => typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,127}$/u.test(id))
      || typeof body.dryRun !== "boolean") {
      return invalid(response, 422, "invalid_sync_request", "Use at most 20 unique registered source IDs and an explicit dryRun boolean.");
    }
    if (!body.dryRun && !newsSyncEnabled) {
      return invalid(response, 503, "news_sync_disabled", "Live news synchronization is disabled.");
    }
    if (!newsSync?.syncSource) return invalid(response, 503, "news_sync_unavailable", "News synchronization is unavailable.");
    const stored = await store.newsSources.listGlobal();
    const registered = new Set([...defaultSourceIds, ...stored.map(({ id }) => id)]);
    if (body.sourceIds.some((id) => !registered.has(id))) {
      return invalid(response, 422, "unknown_news_source", "Every source ID must be registered.");
    }
    const results = [];
    for (const sourceId of body.sourceIds) {
      results.push(await newsSync.syncSource(sourceId, { dryRun: body.dryRun }));
    }
    response.json({ data: { results } });
  });
  return router;
}
