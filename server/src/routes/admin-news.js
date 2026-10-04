import { Router } from "express";
import { assertStrictApprovalDraft, expectedSnapshotPath, validateApprovalDraft } from "../news/approval-policy.js";
import { canonicalOfficialHostname, canonicalOfficialUrl } from "../news/official-url.js";

const sourceFields = new Set([
  "id", "publisher", "adapter", "url", "allowedHosts", "acceptedContentTypes",
  "sourceType", "universityId", "verified", "enabled", "cadenceHours", "sourceDocumentType",
]);
const patchFields = new Set([...sourceFields].filter((field) => field !== "id"));
const sourceIdPattern = /^[a-z0-9](?:[a-z0-9_-]{0,126}[a-z0-9])?$/u;
const documentIdPattern = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,255}$/u;
const adapters = new Set(["federal-register", "feed", "index-page", "university-sitemap"]);
const pass = (_request, _response, next) => next();

function error(response, status, code, message) {
  return response.status(status).json({ error: { code, message } });
}

function safeHostname(value) {
  try { return canonicalOfficialHostname(value) === value; } catch { return false; }
}

function validSourceBoundary(source) {
  if (typeof source.url !== "string" || !Array.isArray(source.allowedHosts) || source.allowedHosts.length < 1) return false;
  try { return source.allowedHosts.includes(new URL(source.url).hostname.toLowerCase()); } catch { return false; }
}

function registeredWithState(registered, stored) {
  if (!registered) return stored;
  return {
    ...(stored || {}),
    ...registered,
    ...(stored && Object.hasOwn(stored, "enabled") ? { enabled: stored.enabled } : {}),
    ...(stored && Object.hasOwn(stored, "cadenceHours") ? { cadenceHours: stored.cadenceHours } : {}),
  };
}

function sourceInput(body, { patch = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const allowed = patch ? patchFields : sourceFields;
  if (Object.keys(body).some((field) => !allowed.has(field)) || (patch && Object.keys(body).length === 0)) return null;
  if (!patch && (!sourceIdPattern.test(body.id || "") || typeof body.publisher !== "string"
    || !body.publisher.trim() || body.publisher.length > 300 || !adapters.has(body.adapter))) return null;
  const next = {};
  for (const field of ["publisher", "sourceType", "universityId", "sourceDocumentType"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "string" || !body[field].trim() || body[field].length > 300) return null;
      next[field] = body[field].trim();
    }
  }
  if (Object.hasOwn(body, "adapter")) {
    if (!adapters.has(body.adapter)) return null;
    next.adapter = body.adapter;
  }
  if (Object.hasOwn(body, "url")) {
    let url;
    try { url = canonicalOfficialUrl(body.url, { allowSearch: true }); } catch { return null; }
    next.url = url.href;
  }
  if (Object.hasOwn(body, "allowedHosts")) {
    if (!Array.isArray(body.allowedHosts) || body.allowedHosts.length < 1 || body.allowedHosts.length > 20
      || body.allowedHosts.some((host) => !safeHostname(host))) return null;
    next.allowedHosts = [...new Set(body.allowedHosts)];
  }
  if (Object.hasOwn(body, "acceptedContentTypes")) {
    if (!Array.isArray(body.acceptedContentTypes) || body.acceptedContentTypes.length < 1
      || body.acceptedContentTypes.length > 20 || body.acceptedContentTypes.some((type) =>
        typeof type !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(type))) return null;
    next.acceptedContentTypes = [...new Set(body.acceptedContentTypes)];
  }
  for (const field of ["verified", "enabled"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") return null;
      next[field] = body[field];
    }
  }
  if (Object.hasOwn(body, "cadenceHours")) {
    if (!Number.isInteger(body.cadenceHours) || body.cadenceHours < 1 || body.cadenceHours > 720) return null;
    next.cadenceHours = body.cadenceHours;
  }
  const result = patch ? next : { id: body.id, ...next };
  return !patch && (!validSourceBoundary(result) || (result.enabled === true && result.verified !== true))
    ? null
    : result;
}

function approvalConflict(response, message = "The review cannot be approved in its current state.") {
  return error(response, 409, "review_conflict", message);
}

export function adminNewsRouter(store, {
  newsSync,
  snapshotStore,
  newsSyncEnabled = false,
  clock = () => new Date(),
  registeredSources = [],
  adminMutationLimiter = pass,
} = {}) {
  const router = Router();
  const registry = new Map(registeredSources.map((source) => [source.id, source]));
  router.get("/sources", async (_request, response) => {
    const stored = await store.newsSources.listGlobal();
    const byId = new Map(stored.map((source) => [source.id, source]));
    for (const source of registeredSources) {
      const state = byId.get(source.id);
      byId.set(source.id, registeredWithState(source, state));
    }
    response.json({ data: { items: [...byId.values()] } });
  });
  router.post("/sources", adminMutationLimiter, async (request, response) => {
    const input = sourceInput(request.body);
    if (!input) return error(response, 422, "invalid_news_source", "News source fields are invalid.");
    if (registry.has(input.id) || await store.newsSources.get(input.id)) {
      return error(response, 409, "news_source_exists", "News source already exists.");
    }
    const { id, ...fields } = input;
    const result = await store.newsSources.upsert(id, fields);
    response.status(201).json({ data: result.item });
  });
  router.patch("/sources/:id", adminMutationLimiter, async (request, response) => {
    if (!sourceIdPattern.test(request.params.id)) return error(response, 404, "news_source_not_found", "News source was not found.");
    const input = sourceInput(request.body, { patch: true });
    if (!input) return error(response, 422, "invalid_news_source", "News source fields are invalid.");
    const registered = registry.get(request.params.id);
    if (registered && Object.keys(input).some((field) => !["enabled", "cadenceHours"].includes(field))) {
      return error(response, 422, "invalid_news_source", "Registered source trust fields cannot be changed at runtime.");
    }
    const stored = await store.newsSources.get(request.params.id);
    const current = registeredWithState(registered, stored);
    if (!current) return error(response, 404, "news_source_not_found", "News source was not found.");
    const merged = { ...current, ...input };
    if (!validSourceBoundary(merged) || (merged.enabled === true && merged.verified !== true)) {
      return error(response, 422, "invalid_news_source", "Enabled sources require a verified URL and matching allowlist.");
    }
    const result = await store.newsSources.upsert(request.params.id, input);
    response.json({ data: { ...current, ...result.item } });
  });
  router.post("/sources/:id/run", adminMutationLimiter, async (request, response) => {
    if (!sourceIdPattern.test(request.params.id)) return error(response, 404, "news_source_not_found", "News source was not found.");
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)
      || Object.keys(request.body).some((field) => field !== "dryRun")
      || typeof request.body.dryRun !== "boolean") {
      return error(response, 422, "invalid_sync_request", "dryRun must be an explicit boolean.");
    }
    if (!request.body.dryRun && !newsSyncEnabled) {
      return error(response, 503, "news_sync_disabled", "Live news synchronization is disabled.");
    }
    if (!newsSync?.syncSource) return error(response, 503, "news_sync_unavailable", "News synchronization is unavailable.");
    if (!registry.has(request.params.id) && !await store.newsSources.get(request.params.id)) {
      return error(response, 404, "news_source_not_found", "News source was not found.");
    }
    response.json({ data: await newsSync.syncSource(request.params.id, { dryRun: request.body.dryRun }) });
  });
  router.get("/review", async (_request, response) => {
    const items = await store.reviewQueue.listGlobal();
    response.json({ data: { items } });
  });
  router.patch("/review/:id", adminMutationLimiter, async (request, response) => {
    if (!documentIdPattern.test(request.params.id)) return error(response, 404, "review_not_found", "Review was not found.");
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)
      || Object.keys(request.body).length !== 1 || !["approve", "reject", "resolve"].includes(request.body.decision)) {
      return error(response, 422, "invalid_review_decision", "Choose approve, reject, or resolve.");
    }
    const review = await store.reviewQueue.get(request.params.id);
    if (!review) return error(response, 404, "review_not_found", "Review was not found.");
    const reviewedAt = new Date(clock()).toISOString();
    if (review.type === "source-suggestion") {
      if (!["reject", "resolve"].includes(request.body.decision) || review.status !== "pending") {
        return approvalConflict(response, "The source suggestion cannot use that decision.");
      }
      try {
        const decided = await store.reviewQueue.resolve(review.id, {
          decision: request.body.decision,
          reviewerUid: request.user.uid,
          reviewedAt,
        });
        return response.json({ data: decided });
      } catch {
        return approvalConflict(response);
      }
    }
    if (request.body.decision === "resolve" || !["pending", "validated"].includes(review.status)
      || review.editorialState !== "review-required" || !review.newsItemId) {
      return approvalConflict(response);
    }
    const item = await store.news.get(review.newsItemId);
    if (!item || item.editorialState !== "review-required" || review.contentHash !== item.contentHash
      || review.revisionId !== item.currentRevisionId) return approvalConflict(response);
    if (request.body.decision === "reject") {
      if (review.status !== "pending") return approvalConflict(response);
      try {
        await store.news.decideReview(item.id, {
          decision: "reject",
          reviewerUid: request.user.uid,
          reviewedAt,
          reviewId: review.id,
        });
        return response.json({ data: { id: review.id, status: "rejected" } });
      } catch {
        return approvalConflict(response);
      }
    }
    const storedSource = await store.newsSources.get(item.sourceId);
    const registeredSource = registry.get(item.sourceId);
    const source = registeredWithState(registeredSource, storedSource);
    if (!source?.verified || source.enabled === false || source.verificationState === "verification-pending"
      || item.sourceVerified !== true || review.sourceId !== item.sourceId || !Array.isArray(source.allowedHosts)
      || !snapshotStore?.readCommitted || !item.snapshotPath || !item.snapshotCommitId || !review.draft) {
      return approvalConflict(response);
    }
    let requiredSnapshotPath;
    try {
      requiredSnapshotPath = expectedSnapshotPath(item);
      assertStrictApprovalDraft(review.draft);
    } catch (caught) {
      return approvalConflict(response, caught.message);
    }
    if (item.snapshotPath !== requiredSnapshotPath) {
      return approvalConflict(response, "The committed source snapshot does not match the current item identity.");
    }
    let sourceText;
    try {
      sourceText = await snapshotStore.readCommitted({ path: item.snapshotPath, commitId: item.snapshotCommitId });
    } catch {
      return approvalConflict(response, "The committed source snapshot could not be verified.");
    }
    let draft;
    try {
      draft = validateApprovalDraft({
        item,
        review,
        snapshot: {
          sourceId: item.sourceId,
          contentHash: item.contentHash,
          path: item.snapshotPath,
          commitId: item.snapshotCommitId,
          text: sourceText,
          verifiedDomains: source.allowedHosts,
        },
      });
    } catch (caught) {
      return approvalConflict(response, caught.message);
    }
    const evidence = {
      contentHash: item.contentHash,
      revisionId: item.currentRevisionId,
      sourceId: item.sourceId,
      snapshotPath: item.snapshotPath,
      sourceVerified: true,
      snapshotCommitId: item.snapshotCommitId,
      validatedAt: reviewedAt,
    };
    let approved;
    try {
      approved = await store.news.decideReview(item.id, {
        decision: "approve",
        reviewerUid: request.user.uid,
        reviewedAt,
        reviewId: review.id,
        validation: { draft, evidence },
      });
    } catch {
      return approvalConflict(response);
    }
    response.json({ data: approved });
  });
  router.get("/health", async (_request, response) => {
    const [sources, runs] = await Promise.all([store.newsSources.listGlobal(), store.newsRuns.listGlobal()]);
    response.json({ data: { sourceCount: sources.length, runCount: runs.length, sources, runs } });
  });
  return router;
}
