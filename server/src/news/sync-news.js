import { createHash, randomUUID } from "node:crypto";

import { classifyCandidate } from "./classifier.js";
import { createFederalRegisterAdapter } from "./adapters/federal-register.js";
import { defaultNewsSources } from "./default-sources.js";
import { documentTypes, legalStates, normalizeNewsCandidate } from "./schema.js";
import { canonicalSourceHostname } from "./url-policy.js";

const defaultLeaseMilliseconds = 15 * 60 * 1_000;
const urgencyValues = new Set(["low", "medium", "high", "urgent", "critical"]);
const relevanceValues = new Set(["relevant", "borderline", "not-relevant"]);
const topicValues = new Set([
  "general", "status", "forms-fees", "employment", "travel-entry",
  "taxes-social-security", "emergency", "campus-life",
]);
const visaTypeValues = new Set(["f-1", "f-2", "m-1", "m-2", "j-1", "j-2", "h-1b"]);
const classificationFields = new Set([
  "documentType", "legalState", "topic", "topics", "visaTypes", "highImpact",
  "urgency", "relevance", "confidence", "matchedTerms", "needsHumanReview", "explanation",
]);

function dateFrom(clock) {
  if (typeof clock !== "function") throw new Error("News sync clock must be a function.");
  const date = new Date(clock());
  if (Number.isNaN(date.valueOf())) throw new Error("News sync clock returned an invalid date.");
  return date;
}

function adapterFor(adapters, source) {
  if (source?.adapter && typeof source.adapter === "object" && typeof source.adapter.collect === "function") {
    return source.adapter;
  }
  const adapter = adapters instanceof Map ? adapters.get(source?.adapter) : adapters?.[source?.adapter];
  if (!adapter || typeof adapter.collect !== "function") {
    throw new Error(`News source adapter is unavailable: ${source?.adapter || "missing"}.`);
  }
  return adapter;
}

function contentHash(item) {
  const fields = [
    "news-policy-v2",
    item.title,
    item.publisher,
    item.sourceVerified,
    item.sourceExcerpt,
    item.normalizedText,
    item.publishedAt,
    item.updatedAt,
    item.effectiveAt,
    item.sourceDocumentType,
    item.sourceLegalState,
    item.docketNumber,
    item.regulationIdNumber,
    item.relatedExternalId,
    item.canonicalUrl,
    item.officialPdfUrl,
    item.documentType,
    item.legalState,
    item.urgency,
    item.relevance,
    item.highImpact,
    item.topics,
    item.visaTypes,
  ];
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

function reviewId(sourceKey, hash, reason) {
  return `news-review:${createHash("sha256").update(JSON.stringify([sourceKey || null, hash || null, reason])).digest("hex")}`;
}

function safeError(stage, error, details = {}) {
  return {
    stage,
    message: error instanceof Error ? error.message : "News synchronization failed.",
    ...details,
  };
}

function leaseOwnershipError() {
  const error = new Error("News synchronization lease ownership was lost.");
  error.code = "LEASE_LOST";
  return error;
}

function errorStage(error, fallback) {
  return error?.code === "LEASE_LOST" ? "lease" : fallback;
}

function verifiedUrl(value, allowedHosts, { required = true } = {}) {
  if (!value) return !required;
  if (typeof value !== "string") return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && !url.username
    && !url.password
    && !url.port
    && allowedHosts.has(url.hostname.toLowerCase());
}

function hasVerifiedSourceUrls(candidate, source) {
  if (source?.verified !== true || !Array.isArray(source.allowedHosts)) return false;
  const allowedHosts = new Set(source.allowedHosts.map((host) => String(host).toLowerCase()));
  return verifiedUrl(candidate.canonicalUrl, allowedHosts)
    && verifiedUrl(candidate.officialPdfUrl, allowedHosts, { required: false });
}

function validatedClassification(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("News classifier must return an object.");
  }
  if (!documentTypes.has(value.documentType)) {
    throw new Error("News classifier returned an unknown document type.");
  }
  if (!legalStates.has(value.legalState)) {
    throw new Error("News classifier returned an unknown legal state.");
  }
  if (!urgencyValues.has(value.urgency)) {
    throw new Error("News classifier returned an unknown urgency.");
  }
  if (!relevanceValues.has(value.relevance)) {
    throw new Error("News classifier returned an unknown relevance state.");
  }
  if (typeof value.highImpact !== "boolean" || typeof value.needsHumanReview !== "boolean") {
    throw new Error("News classifier returned invalid review flags.");
  }
  if (!Array.isArray(value.topics) || !Array.isArray(value.visaTypes)) {
    throw new Error("News classifier returned invalid audience tags.");
  }
  if (Object.keys(value).some((field) => !classificationFields.has(field))) {
    throw new Error("News classifier returned an unknown field.");
  }
  const boundedEnumArray = (entries, allowed) => entries.length <= 20
    && entries.every((entry) => typeof entry === "string" && allowed.has(entry))
    && new Set(entries).size === entries.length;
  if (!boundedEnumArray(value.topics, topicValues) || !boundedEnumArray(value.visaTypes, visaTypeValues)) {
    throw new Error("News classifier returned malformed audience tags.");
  }
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new Error("News classifier returned invalid confidence.");
  }
  if (!Array.isArray(value.matchedTerms) || value.matchedTerms.length > 50
    || value.matchedTerms.some((entry) => typeof entry !== "string" || !entry.trim() || entry.length > 100)) {
    throw new Error("News classifier returned malformed matched terms.");
  }
  if (typeof value.explanation !== "string" || value.explanation.length > 1_000) {
    throw new Error("News classifier returned an invalid explanation.");
  }
  if (typeof value.topic !== "string" || !topicValues.has(value.topic)) {
    throw new Error("News classifier returned an unknown topic.");
  }
  return value;
}

function snapshotText(item) {
  return item.normalizedText || [item.title, item.sourceExcerpt].filter(Boolean).join("\n");
}

function reviewReason({ sourceUrlsVerified, publisherVerified, classification, summary }) {
  if (!sourceUrlsVerified) return "unverified-source-url";
  if (!publisherVerified) return "missing-publisher";
  if (summary && summary.ok === false) return "summary-validation-failed";
  if (classification.highImpact) return "high-impact";
  if (classification.relevance !== "relevant") return "relevance-review";
  if (classification.needsHumanReview) return "classification-review";
  return summary?.reviewRequired ? "generated-summary" : null;
}

function statusFor(result) {
  if (result.errors.length === 0) return "success";
  return result.created + result.changed + result.unchanged > 0 ? "partial" : "failed";
}

function retryAt(status, endedAt, consecutiveFailures, cadenceHours = 12) {
  if (status === "success") return null;
  const delays = [15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
  const delay = delays[consecutiveFailures - 1] ?? cadenceHours * 60 * 60_000;
  return new Date(endedAt.valueOf() + delay).toISOString();
}

function responseMetadata(response) {
  return {
    status: response?.status ?? null,
    finalUrl: response?.finalUrl ?? null,
    etag: response?.etag ?? null,
    lastModified: response?.lastModified ?? null,
    notModified: response?.notModified === true,
  };
}

function runRecord(source, result, context) {
  const status = statusFor(result);
  const consecutiveFailures = status === "success" ? 0 : context.previousFailures + 1;
  return {
    sourceId: source.id,
    startedAt: context.startedAt.toISOString(),
    endedAt: context.endedAt.toISOString(),
    status,
    success: status === "success",
    itemCount: result.candidates,
    createdCount: result.created,
    changedCount: result.changed,
    unchangedCount: result.unchanged,
    reviewRequiredCount: result.reviewRequired,
    errorCount: result.errors.length,
    httpStatus: context.fetched?.status ?? null,
    responseValidators: {
      etag: context.fetched?.etag ?? null,
      lastModified: context.fetched?.lastModified ?? null,
    },
    notModified: context.fetched?.notModified === true,
    httpResponses: context.responses.map(responseMetadata),
    consecutiveFailures,
    errorCode: result.errors[0]?.stage ? result.errors[0].stage.toUpperCase().replace(/-/gu, "_") : null,
    nextRetry: retryAt(status, context.endedAt, consecutiveFailures, source.cadenceHours),
  };
}

function sourceNeedsRobots(source) {
  const canonicalHost = (value) => {
    try { return canonicalSourceHostname(String(value)); } catch { return ""; }
  };
  let hostname = "";
  try { hostname = canonicalHost(new URL(source?.url).hostname); } catch { /* fetch policy will reject malformed URLs */ }
  return source?.respectRobotsTxt === true
    || source?.sourceType === "university"
    || source?.adapter === "university-sitemap"
    || hostname.endsWith(".edu")
    || canonicalHost(source?.officialDomain || "").endsWith(".edu")
    || source?.allowedHosts?.some((host) => canonicalHost(host).endsWith(".edu"));
}

function relationMatches(left, right) {
  if (!left.sourceId || left.sourceId !== right.sourceId) return false;
  const sameDocket = left.docketNumber && right.docketNumber && left.docketNumber === right.docketNumber;
  const sameRin = left.regulationIdNumber && right.regulationIdNumber
    && left.regulationIdNumber === right.regulationIdNumber;
  const explicit = (left.relatedExternalId && left.relatedExternalId === right.externalId
    || right.relatedExternalId && right.relatedExternalId === left.externalId);
  return Boolean(sameDocket || sameRin || explicit);
}

function transitionRank(item) {
  const legalState = item.baseLegalState || item.sourceLegalState;
  if (legalState === "withdrawn") return 5;
  if (legalState === "delayed") return 4;
  if (item.documentType === "correction") return 3;
  if (["final", "scheduled", "effective"].includes(legalState)) return 2;
  if (item.documentType === "final-rule") return 2;
  if (legalState === "proposed") return 1;
  if (item.documentType === "proposed-rule") return 1;
  return 0;
}

function baseLegalState(item) {
  if (legalStates.has(item.baseLegalState)) return item.baseLegalState;
  if (legalStates.has(item.sourceLegalState)) return item.sourceLegalState;
  if (item.documentType === "proposed-rule") return "proposed";
  if (item.documentType === "final-rule") return "final";
  return "informational";
}

function relationDate(item) {
  return item.updatedAt || item.publishedAt || item.effectiveAt || "";
}

function compareRelationOrder(left, right) {
  return transitionRank(left) - transitionRank(right)
    || relationDate(left).localeCompare(relationDate(right))
    || String(left.documentType || "").localeCompare(String(right.documentType || ""))
    || String(left.externalId || left.sourceKey).localeCompare(String(right.externalId || right.sourceKey));
}

function transitionedLegalState(successor) {
  const successorState = baseLegalState(successor);
  return successorState === "withdrawn"
    ? "withdrawn"
    : successorState === "delayed" ? "delayed" : "superseded";
}

function emptyResult() {
  return {
    candidates: 0,
    created: 0,
    changed: 0,
    unchanged: 0,
    reviewRequired: 0,
    errors: [],
    estimatedWrites: 0,
    status: "success",
  };
}

export function createNewsSync({
  store,
  adapters,
  fetchSource,
  classifier = classifyCandidate,
  clock = () => new Date(),
  sources = defaultNewsSources,
  summarizer = null,
  snapshotStore = store?.snapshots || null,
  robotsPolicy = null,
  leaseDurationMs = defaultLeaseMilliseconds,
  leaseHeartbeatMs = Math.floor(defaultLeaseMilliseconds / 3),
} = {}) {
  if (!store?.news || typeof store.news.upsert !== "function"
    || !store?.reviewQueue || typeof store.reviewQueue.upsert !== "function"
    || !store?.newsRuns || typeof store.newsRuns.create !== "function"
    || !store?.newsSources || typeof store.newsSources.upsert !== "function"
    || !store?.leases || typeof store.leases.acquire !== "function"
    || typeof store.leases.renew !== "function" || typeof store.leases.release !== "function"
    || typeof store.leases.owns !== "function") {
    throw new Error("News sync requires news, review, run, and lease stores.");
  }
  if (typeof fetchSource !== "function") throw new Error("News sync requires a source fetch function.");
  if (typeof classifier !== "function") throw new Error("News sync classifier must be a function.");
  if (!Array.isArray(sources)) throw new Error("News sync sources must be an array.");
  if (summarizer && typeof summarizer.summarize !== "function") {
    throw new Error("News sync summarizer must provide summarize().");
  }
  if (snapshotStore && typeof snapshotStore.save !== "function") {
    throw new Error("News sync snapshot store must provide save().");
  }
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs < 10
    || !Number.isInteger(leaseHeartbeatMs) || leaseHeartbeatMs < 1 || leaseHeartbeatMs >= leaseDurationMs) {
    throw new Error("News sync lease timing is invalid.");
  }

  const sourceRegistry = new Map(sources.map((entry) => [entry.id, entry]));

  async function resolveSource(sourceId) {
    const registered = sourceRegistry.get(sourceId);
    if (registered) {
      if (registered.enabled === false) throw new Error(`News source is disabled pending verification: ${registered.pendingReason || registered.id}.`);
      return registered;
    }
    if (typeof store.newsSources?.get === "function") {
      const stored = await store.newsSources.get(sourceId);
      if (stored) return stored;
    }
    throw new Error(`Unknown news source: ${sourceId}.`);
  }

  async function upsertReview(payload, { external = (operation) => operation(), fence } = {}) {
    const id = reviewId(payload.sourceKey, payload.contentHash, payload.reason);
    const current = await external(() => store.reviewQueue.get(id));
    if (current) return { item: current, created: false, changed: false };
    return external(() => store.reviewQueue.upsert(id, payload, { fence }));
  }

  async function linkRelations(item, { external = (operation) => operation(), fence } = {}) {
    if (typeof store.news.listInternal !== "function" || typeof store.news.updateInternal !== "function"
      || typeof store.news.reviseInternal !== "function") return;
    const allItems = await external(() => store.news.listInternal());
    const group = [item];
    for (let index = 0; index < group.length; index += 1) {
      for (const candidate of allItems) {
        if (!group.some(({ id }) => id === candidate.id) && relationMatches(group[index], candidate)) {
          group.push(candidate);
        }
      }
    }
    if (group.length === 1) return;
    const ordered = [...group].sort(compareRelationOrder);
    for (const member of ordered) {
      const memberRank = transitionRank(member);
      const lower = memberRank
        ? ordered.filter((candidate) => transitionRank(candidate) > 0 && transitionRank(candidate) < memberRank)
        : [];
      const higher = memberRank
        ? ordered.filter((candidate) => transitionRank(candidate) > memberRank)
        : [];
      const patch = {
        relatedIds: ordered.filter(({ id }) => id !== member.id).map(({ id }) => id),
        supersedesIds: lower.map(({ id }) => id),
        supersededByIds: higher.map(({ id }) => id),
        legalState: higher.length > 0
          ? transitionedLegalState(higher.at(-1))
          : baseLegalState(member),
      };
      const update = member.id === item.id ? store.news.updateInternal : store.news.reviseInternal;
      await external(() => update.call(store.news, member.id, patch, { fence }));
    }
  }

  async function generateSummary(candidate, sourceInput, dryRun, external = (operation) => operation()) {
    if (!summarizer) return null;
    if (dryRun) {
      return { ok: true, reviewRequired: true, publishable: false, draft: null, prospective: true };
    }
    try {
      return await external(() => summarizer.summarize(candidate, { verifiedDomains: sourceInput.allowedHosts || [] }));
    } catch (error) {
      if (error?.code === "LEASE_LOST") throw error;
      return {
        ok: false,
        reviewRequired: true,
        publishable: false,
        draft: null,
        error: error instanceof Error ? error.message : "News summary generation failed.",
      };
    }
  }

  async function synchronizeCandidate(candidate, sourceInput, result, {
    dryRun,
    external = (operation) => operation(),
    fence,
  }) {
    let normalized;
    let classification;
    try {
      normalized = normalizeNewsCandidate(candidate, sourceInput);
      if (!normalized.title || !normalized.canonicalUrl || !normalized.sourceKey) {
        throw new Error("News candidate is missing a title, canonical URL, or source key.");
      }
      classification = validatedClassification(await external(() => classifier(normalized, { clock })));
    } catch (error) {
      if (error?.code === "LEASE_LOST") throw error;
      result.errors.push(safeError("classify", error, { sourceKey: normalized?.sourceKey || null }));
      const failedHash = normalized ? contentHash(normalized) : null;
      const failedReviewId = reviewId(normalized?.sourceKey || null, failedHash, "classification-failed");
      if (dryRun) {
        if (!await external(() => store.reviewQueue.get(failedReviewId))) {
          result.estimatedWrites += 1;
          result.reviewRequired += 1;
        }
      } else {
        try {
          const reviewed = await upsertReview({
            newsItemId: null,
            sourceId: sourceInput.id,
            sourceKey: normalized?.sourceKey || null,
            contentHash: failedHash,
            editorialState: "review-required",
            reason: "classification-failed",
            highImpact: null,
            classificationError: error instanceof Error ? error.message : "News classification failed.",
            candidate: normalized ? {
              title: normalized.title,
              canonicalUrl: normalized.canonicalUrl,
              sourceExcerpt: normalized.sourceExcerpt,
              normalizedText: normalized.normalizedText,
              publishedAt: normalized.publishedAt,
              updatedAt: normalized.updatedAt,
              effectiveAt: normalized.effectiveAt,
              sourceDocumentType: normalized.sourceDocumentType,
            } : null,
          }, { external, fence });
          if (reviewed.created) {
            result.estimatedWrites += 1;
            result.reviewRequired += 1;
          }
        } catch (reviewError) {
          result.errors.push(safeError(errorStage(reviewError, "review"), reviewError, {
            sourceKey: normalized?.sourceKey || null,
          }));
        }
      }
      return;
    }

    const sourceUrlsVerified = hasVerifiedSourceUrls(normalized, sourceInput);
    const publisherVerified = Boolean(normalized.publisher.trim());
    const sourceOnly = sourceUrlsVerified && publisherVerified && classification.relevance === "relevant";
    const summary = await generateSummary(normalized, sourceInput, dryRun, external);
    if (summary?.ok === false) {
      result.errors.push(safeError("summarize", new Error(summary.error || "Summary validation failed."), {
        sourceKey: normalized.sourceKey,
      }));
    }
    const reason = reviewReason({ sourceUrlsVerified, publisherVerified, classification, summary });
    const requiresReview = Boolean(reason);
    const hash = contentHash({ ...normalized, ...classification });
    const current = typeof store.news.getBySourceKey === "function"
      ? await external(() => store.news.getBySourceKey(normalized.sourceKey))
      : null;
    result.estimatedWrites += 1;
    if (snapshotStore) result.estimatedWrites += 1;
    if (dryRun) {
      if (!current) result.created += 1;
      else if (current.contentHash === hash) result.unchanged += 1;
      else result.changed += 1;
      if (requiresReview) {
        const existingReview = await external(() => store.reviewQueue.get(reviewId(normalized.sourceKey, hash, reason)));
        if (!existingReview) {
          result.estimatedWrites += 1;
          result.reviewRequired += 1;
        }
      }
      return;
    }

    let snapshot = null;
    if (!snapshotStore || snapshotStore.isPrivate !== true || snapshotStore.supportsFencing !== true) {
      result.errors.push(safeError("snapshot", new Error("News publication requires a private fenced snapshot store."), {
        sourceKey: normalized.sourceKey,
      }));
      return;
    }
    if (snapshotStore) {
      try {
        snapshot = await external(() => snapshotStore.save(sourceInput.id, hash, snapshotText(normalized), { fence }));
        const expectedPath = `news-source-snapshots/${sourceInput.id}/${hash}.txt`;
        if (snapshot?.path !== expectedPath) throw new Error("Snapshot store returned invalid private provenance.");
      } catch (error) {
        result.errors.push(safeError(errorStage(error, "snapshot"), error, { sourceKey: normalized.sourceKey }));
        return;
      }
    }
    let upserted;
    try {
      upserted = await external(() => store.news.upsert(normalized.sourceKey, {
        ...normalized,
        documentType: classification.documentType,
        legalState: classification.legalState,
        baseLegalState: classification.legalState,
        editorialState: sourceOnly ? "published-source-only" : "review-required",
        urgency: classification.urgency,
        relevance: classification.relevance,
        highImpact: classification.highImpact,
        topics: [...classification.topics],
        visaTypes: [...classification.visaTypes],
        contentHash: hash,
        snapshotPath: snapshot?.path || null,
        classifierConfidence: classification.confidence,
        classifierMatchedTerms: Array.isArray(classification.matchedTerms) ? [...classification.matchedTerms] : [],
        classifierExplanation: classification.explanation || "",
        plainLanguageSummary: "",
        summaryProvenance: null,
        actions: [],
      }, { fence }));
    } catch (error) {
      result.errors.push(safeError(error?.code === "LEASE_LOST" ? "lease" : "upsert", error, {
        sourceKey: normalized.sourceKey,
      }));
      return;
    }

    if (upserted.created) result.created += 1;
    else if (upserted.changed) result.changed += 1;
    else result.unchanged += 1;

    if (upserted.changed) {
      try {
        await linkRelations(upserted.item, { external, fence });
      } catch (error) {
        result.errors.push(safeError(errorStage(error, "relation"), error, { sourceKey: normalized.sourceKey }));
      }
    }
    if (!requiresReview) return;
    try {
      const reviewed = await upsertReview({
        newsItemId: upserted.item.id,
        sourceId: sourceInput.id,
        sourceKey: normalized.sourceKey,
        contentHash: hash,
        editorialState: "review-required",
        reason,
        highImpact: classification.highImpact,
        classification: {
          documentType: classification.documentType,
          legalState: classification.legalState,
          urgency: classification.urgency,
          relevance: classification.relevance,
          topics: [...classification.topics],
          visaTypes: [...classification.visaTypes],
        },
        draft: summary?.ok === true ? summary.draft : null,
        summaryError: summary?.ok === false ? summary.error : null,
      }, { external, fence });
      if (reviewed.created) {
        result.estimatedWrites += 1;
        result.reviewRequired += 1;
      }
    } catch (error) {
      result.errors.push(safeError(errorStage(error, "review"), error, { sourceKey: normalized.sourceKey }));
    }
  }

  return {
    async syncSource(sourceId, { dryRun = false } = {}) {
      if (typeof sourceId !== "string" || !sourceId.trim()) throw new Error("News source ID is required.");
      if (typeof dryRun !== "boolean") throw new Error("News sync dryRun must be a boolean.");
      const sourceInput = await resolveSource(sourceId.trim());
      const result = emptyResult();
      const startedAt = dateFrom(clock);
      let previousState = {};
      let sourceWithValidators = sourceInput;
      let fetched = null;
      const responses = [];
      let acquired = false;
      let heartbeat = null;
      let renewal = null;
      let leaseLost = false;
      const abortController = new AbortController();
      const leaseKey = `news-source:${sourceInput.id}`;
      const owner = randomUUID();
      const fence = { key: leaseKey, owner };

      if (dryRun) result.estimatedWrites = 2;
      if (!dryRun) {
        const expiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
        acquired = Boolean(await store.leases.acquire(leaseKey, owner, expiresAt));
        if (!acquired) {
          result.status = "skipped";
          result.errors.push(safeError("lease", new Error("News source already has an active synchronization lease.")));
          return result;
        }
        result.estimatedWrites = 2;
        heartbeat = setInterval(() => {
          if (renewal) return;
          renewal = Promise.resolve(store.leases.renew(
            leaseKey,
            owner,
            new Date(Date.now() + leaseDurationMs).toISOString(),
          )).then((renewed) => {
            if (!renewed) {
              leaseLost = true;
              abortController.abort(new Error("News synchronization lease ownership was lost."));
            }
          }).catch(() => {
            leaseLost = true;
            abortController.abort(new Error("News synchronization lease renewal failed."));
          }).finally(() => {
            renewal = null;
          });
        }, leaseHeartbeatMs);
        heartbeat.unref?.();
      }

      const assertLease = async () => {
        if (dryRun) return;
        if (leaseLost || !await store.leases.owns(leaseKey, owner)) {
          leaseLost = true;
          if (!abortController.signal.aborted) abortController.abort(leaseOwnershipError());
          throw leaseOwnershipError();
        }
      };
      const external = async (operation) => {
        await assertLease();
        const value = await operation();
        await assertLease();
        return value;
      };
      fence.assertOwned = assertLease;

      try {
        previousState = dryRun
          ? await store.newsSources.get(sourceInput.id) || {}
          : await external(() => store.newsSources.get(sourceInput.id)) || {};
        sourceWithValidators = {
          ...sourceInput,
          etag: previousState.etag ?? null,
          lastModified: previousState.lastModified ?? null,
        };
        if (!dryRun && (!snapshotStore || snapshotStore.isPrivate !== true || snapshotStore.supportsFencing !== true)) {
          result.errors.push(safeError("snapshot", new Error("News publication requires a private fenced snapshot store.")));
        }
        if (sourceNeedsRobots(sourceInput)) {
          if (!robotsPolicy || typeof robotsPolicy.isAllowed !== "function") {
            result.errors.push(safeError("robots", new Error("News source requires a robots policy decision.")));
          } else {
            try {
              const allowed = await external(() => robotsPolicy.isAllowed(sourceInput));
              if (!allowed) throw new Error("News source path is disallowed by robots.txt.");
            } catch (error) {
              result.errors.push(safeError("robots", error));
            }
          }
        }

        let candidates = [];
        if (result.errors.length === 0) {
          if (sourceInput.adapter === "federal-register") {
            try {
              const adapter = createFederalRegisterAdapter({
                now: clock,
                fetchJson: async (url) => {
                  const response = await external(() => fetchSource({
                    ...sourceWithValidators,
                    url,
                    etag: responses.length === 0 ? sourceWithValidators.etag : null,
                    lastModified: responses.length === 0 ? sourceWithValidators.lastModified : null,
                  }, { signal: abortController.signal }));
                  responses.push(response);
                  fetched ||= response;
                  if (response.notModified) return { results: [], next_page_url: null };
                  try { return JSON.parse(response.text); } catch { throw new Error("Federal Register returned invalid JSON."); }
                },
              });
              candidates = await external(() => adapter.collect(sourceWithValidators));
            } catch (error) {
              result.errors.push(safeError(errorStage(error, leaseLost ? "lease" : "fetch"), error));
            }
          } else {
            let adapter;
            try {
              adapter = adapterFor(adapters, sourceInput);
            } catch (error) {
              result.errors.push(safeError("adapt", error));
            }
            if (adapter) {
              try {
                fetched = await external(() => fetchSource(sourceWithValidators, { signal: abortController.signal }));
                responses.push(fetched);
              } catch (error) {
                result.errors.push(safeError(leaseLost ? "lease" : "fetch", error));
              }
            }
            if (adapter && result.errors.length === 0 && fetched?.notModified !== true) {
              try {
                candidates = await external(() => adapter.collect(sourceWithValidators, fetched || undefined));
                if (!Array.isArray(candidates)) throw new Error("News source adapter must return a candidate array.");
              } catch (error) {
                result.errors.push(safeError("adapt", error));
              }
            }
          }
        }

        result.candidates = candidates.length;
        for (const candidate of candidates) {
          if (leaseLost) {
            result.errors.push(safeError("lease", new Error("News synchronization lease ownership was lost.")));
            break;
          }
          try {
            await synchronizeCandidate(candidate, sourceInput, result, {
              dryRun,
              external,
              fence,
            });
          } catch (error) {
            result.errors.push(safeError(errorStage(error, "candidate"), error));
          }
        }
        result.status = statusFor(result);

        if (!dryRun && !leaseLost) {
          const endedAt = dateFrom(clock);
          const run = runRecord(sourceInput, result, {
            startedAt,
            endedAt,
            fetched,
            responses,
            previousFailures: Number(previousState.consecutiveFailures) || 0,
          });
          const freshResponse = Number.isInteger(fetched?.status) && fetched.status >= 200 && fetched.status < 300;
          const validators = fetched?.notModified === true || !freshResponse
            ? { etag: previousState.etag ?? null, lastModified: previousState.lastModified ?? null }
            : { etag: fetched?.etag ?? null, lastModified: fetched?.lastModified ?? null };
          await external(() => store.newsSources.upsert(sourceInput.id, {
            sourceId: sourceInput.id,
            ...validators,
            consecutiveFailures: run.consecutiveFailures,
            lastRunStatus: run.status,
            lastCheckedAt: endedAt.toISOString(),
            nextRetry: run.nextRetry,
          }, { fence }));
          await external(() => store.newsRuns.create(run, { fence }));
        }
        if (leaseLost) result.status = statusFor(result);
        return result;
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (renewal) await renewal;
        if (acquired) await store.leases.release(leaseKey, owner);
      }
    },
  };
}
