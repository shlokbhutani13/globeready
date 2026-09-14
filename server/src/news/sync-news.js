import { createHash, randomUUID } from "node:crypto";

import { classifyCandidate } from "./classifier.js";
import { createFederalRegisterAdapter } from "./adapters/federal-register.js";
import { defaultNewsSources } from "./default-sources.js";
import { documentTypes, legalStates, normalizeNewsCandidate } from "./schema.js";

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
  let hostname = "";
  try { hostname = new URL(source?.url).hostname.toLowerCase(); } catch { /* fetch policy will reject malformed URLs */ }
  return source?.respectRobotsTxt === true
    || source?.sourceType === "university"
    || source?.adapter === "university-sitemap"
    || hostname.endsWith(".edu")
    || String(source?.officialDomain || "").toLowerCase().endsWith(".edu")
    || source?.allowedHosts?.some((host) => String(host).toLowerCase().endsWith(".edu"));
}

function relationMatches(left, right) {
  const sameDocket = left.docketNumber && right.docketNumber && left.docketNumber === right.docketNumber;
  const sameRin = left.regulationIdNumber && right.regulationIdNumber
    && left.regulationIdNumber === right.regulationIdNumber;
  const explicit = left.relatedExternalId && left.relatedExternalId === right.externalId
    || right.relatedExternalId && right.relatedExternalId === left.externalId;
  return Boolean(sameDocket || sameRin || explicit);
}

function priorTransition(current, prior) {
  if (current.documentType === "final-rule" && prior.documentType === "proposed-rule") return "superseded";
  if (current.documentType === "correction" && prior.documentType !== "proposed-rule") return "superseded";
  if (current.legalState === "delayed" && ["final", "scheduled", "effective"].includes(prior.legalState)) return "delayed";
  if (current.legalState === "withdrawn" && ["final", "scheduled", "effective", "delayed"].includes(prior.legalState)) return "withdrawn";
  return null;
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
    || typeof store.leases.renew !== "function" || typeof store.leases.release !== "function") {
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

  async function upsertReview(payload) {
    const id = reviewId(payload.sourceKey, payload.contentHash, payload.reason);
    return store.reviewQueue.upsert(id, payload);
  }

  async function linkRelations(item) {
    if (typeof store.news.listInternal !== "function" || typeof store.news.updateInternal !== "function") return;
    const related = (await store.news.listInternal()).filter((other) => other.id !== item.id && relationMatches(item, other));
    const relatedIds = related.map(({ id }) => id);
    const superseded = related.filter((prior) => priorTransition(item, prior));
    const supersedesIds = superseded.map(({ id }) => id);
    await store.news.updateInternal(item.id, {
      relatedIds: [...new Set([...(item.relatedIds || []), ...relatedIds])],
      supersedesIds: [...new Set([...(item.supersedesIds || []), ...supersedesIds])],
    });
    for (const prior of related) {
      const isSuperseded = supersedesIds.includes(prior.id);
      await store.news.updateInternal(prior.id, {
        relatedIds: [...new Set([...(prior.relatedIds || []), item.id])],
        supersededByIds: isSuperseded
          ? [...new Set([...(prior.supersededByIds || []), item.id])]
          : prior.supersededByIds || [],
        legalState: isSuperseded ? priorTransition(item, prior) : prior.legalState,
      });
    }
  }

  async function generateSummary(candidate, sourceInput, dryRun) {
    if (!summarizer || dryRun) return null;
    try {
      return await summarizer.summarize(candidate, { verifiedDomains: sourceInput.allowedHosts || [] });
    } catch (error) {
      return {
        ok: false,
        reviewRequired: true,
        publishable: false,
        draft: null,
        error: error instanceof Error ? error.message : "News summary generation failed.",
      };
    }
  }

  async function synchronizeCandidate(candidate, sourceInput, result, { dryRun, leaseValid = () => true }) {
    let normalized;
    let classification;
    try {
      normalized = normalizeNewsCandidate(candidate, sourceInput);
      if (!normalized.title || !normalized.canonicalUrl || !normalized.sourceKey) {
        throw new Error("News candidate is missing a title, canonical URL, or source key.");
      }
      classification = validatedClassification(await classifier(normalized, { clock }));
    } catch (error) {
      result.errors.push(safeError("classify", error, { sourceKey: normalized?.sourceKey || null }));
      result.estimatedWrites += 1;
      const failedHash = normalized ? contentHash(normalized) : null;
      const failedReviewId = reviewId(normalized?.sourceKey || null, failedHash, "classification-failed");
      if (dryRun) {
        if (!await store.reviewQueue.get(failedReviewId)) result.reviewRequired += 1;
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
          });
          if (reviewed.created) result.reviewRequired += 1;
        } catch (reviewError) {
          result.errors.push(safeError("review", reviewError, { sourceKey: normalized?.sourceKey || null }));
        }
      }
      return;
    }

    const sourceUrlsVerified = hasVerifiedSourceUrls(normalized, sourceInput);
    const publisherVerified = Boolean(normalized.publisher.trim());
    const sourceOnly = sourceUrlsVerified && publisherVerified && classification.relevance === "relevant";
    const summary = await generateSummary(normalized, sourceInput, dryRun);
    if (summary?.ok === false) {
      result.errors.push(safeError("summarize", new Error(summary.error || "Summary validation failed."), {
        sourceKey: normalized.sourceKey,
      }));
    }
    const reason = reviewReason({ sourceUrlsVerified, publisherVerified, classification, summary });
    const requiresReview = Boolean(reason);
    const hash = contentHash({ ...normalized, ...classification });
    const current = typeof store.news.getBySourceKey === "function"
      ? await store.news.getBySourceKey(normalized.sourceKey)
      : null;
    result.estimatedWrites += 1;
    if (snapshotStore) result.estimatedWrites += 1;
    if (requiresReview) result.estimatedWrites += 1;
    if (dryRun) {
      if (!current) result.created += 1;
      else if (current.contentHash === hash) result.unchanged += 1;
      else result.changed += 1;
      if (requiresReview && current?.contentHash !== hash) {
        const existingReview = await store.reviewQueue.get(reviewId(normalized.sourceKey, hash, reason));
        if (!existingReview) result.reviewRequired += 1;
      }
      return;
    }

    const stopForLostLease = () => {
      if (leaseValid()) return false;
      result.errors.push(safeError("lease", new Error("News synchronization lease ownership was lost."), {
        sourceKey: normalized.sourceKey,
      }));
      return true;
    };
    if (stopForLostLease()) return;

    let snapshot = null;
    if (!snapshotStore || snapshotStore.isPrivate !== true) {
      result.errors.push(safeError("snapshot", new Error("News publication requires a private snapshot store."), {
        sourceKey: normalized.sourceKey,
      }));
      return;
    }
    if (snapshotStore) {
      try {
        snapshot = await snapshotStore.save(sourceInput.id, hash, snapshotText(normalized));
        const expectedPath = `news-source-snapshots/${sourceInput.id}/${hash}.txt`;
        if (snapshot?.path !== expectedPath) throw new Error("Snapshot store returned invalid private provenance.");
      } catch (error) {
        result.errors.push(safeError("snapshot", error, { sourceKey: normalized.sourceKey }));
        return;
      }
    }
    if (stopForLostLease()) return;

    let upserted;
    try {
      upserted = await store.news.upsert(normalized.sourceKey, {
        ...normalized,
        documentType: classification.documentType,
        legalState: classification.legalState,
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
      });
    } catch (error) {
      result.errors.push(safeError("upsert", error, { sourceKey: normalized.sourceKey }));
      return;
    }

    if (upserted.created) result.created += 1;
    else if (upserted.changed) result.changed += 1;
    else result.unchanged += 1;

    if (upserted.changed) {
      try {
        await linkRelations(upserted.item);
      } catch (error) {
        result.errors.push(safeError("relation", error, { sourceKey: normalized.sourceKey }));
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
      });
      if (reviewed.created) result.reviewRequired += 1;
    } catch (error) {
      result.errors.push(safeError("review", error, { sourceKey: normalized.sourceKey }));
    }
  }

  return {
    async syncSource(sourceId, { dryRun = false } = {}) {
      if (typeof sourceId !== "string" || !sourceId.trim()) throw new Error("News source ID is required.");
      if (typeof dryRun !== "boolean") throw new Error("News sync dryRun must be a boolean.");
      const sourceInput = await resolveSource(sourceId.trim());
      const result = emptyResult();
      const startedAt = dateFrom(clock);
      const previousState = await store.newsSources.get(sourceInput.id) || {};
      const sourceWithValidators = {
        ...sourceInput,
        etag: previousState.etag || null,
        lastModified: previousState.lastModified || null,
      };
      let fetched = null;
      const responses = [];
      let acquired = false;
      let heartbeat = null;
      let renewal = null;
      let leaseLost = false;
      const abortController = new AbortController();
      const leaseKey = `news-source:${sourceInput.id}`;
      const owner = randomUUID();

      if (dryRun) result.estimatedWrites = 1;
      if (!dryRun) {
        const expiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
        acquired = Boolean(await store.leases.acquire(leaseKey, owner, expiresAt));
        if (!acquired) {
          result.status = "skipped";
          result.errors.push(safeError("lease", new Error("News source already has an active synchronization lease.")));
          return result;
        }
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

      try {
        if (!dryRun && (!snapshotStore || snapshotStore.isPrivate !== true)) {
          result.errors.push(safeError("snapshot", new Error("News publication requires a private snapshot store.")));
        }
        if (sourceNeedsRobots(sourceInput)) {
          if (!robotsPolicy || typeof robotsPolicy.isAllowed !== "function") {
            result.errors.push(safeError("robots", new Error("News source requires a robots policy decision.")));
          } else {
            try {
              const allowed = await robotsPolicy.isAllowed(sourceInput);
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
                  const response = await fetchSource({
                    ...sourceWithValidators,
                    url,
                    etag: responses.length === 0 ? sourceWithValidators.etag : null,
                    lastModified: responses.length === 0 ? sourceWithValidators.lastModified : null,
                  }, { signal: abortController.signal });
                  responses.push(response);
                  fetched ||= response;
                  if (response.notModified) return { results: [], next_page_url: null };
                  try { return JSON.parse(response.text); } catch { throw new Error("Federal Register returned invalid JSON."); }
                },
              });
              candidates = await adapter.collect(sourceWithValidators);
            } catch (error) {
              result.errors.push(safeError(leaseLost ? "lease" : "fetch", error));
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
                fetched = await fetchSource(sourceWithValidators, { signal: abortController.signal });
                responses.push(fetched);
              } catch (error) {
                result.errors.push(safeError(leaseLost ? "lease" : "fetch", error));
              }
            }
            if (adapter && result.errors.length === 0 && fetched?.notModified !== true) {
              try {
                candidates = await adapter.collect(sourceWithValidators, fetched || undefined);
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
              leaseValid: () => !leaseLost,
            });
          } catch (error) {
            result.errors.push(safeError("candidate", error));
          }
        }
        result.status = statusFor(result);

        if (!dryRun) {
          const endedAt = dateFrom(clock);
          result.estimatedWrites += 1;
          const run = runRecord(sourceInput, result, {
            startedAt,
            endedAt,
            fetched,
            responses,
            previousFailures: Number(previousState.consecutiveFailures) || 0,
          });
          const successfulValidator = run.status === "success" ? fetched : null;
          await store.newsSources.upsert(sourceInput.id, {
            sourceId: sourceInput.id,
            etag: successfulValidator?.etag || previousState.etag || null,
            lastModified: successfulValidator?.lastModified || previousState.lastModified || null,
            consecutiveFailures: run.consecutiveFailures,
            lastRunStatus: run.status,
            lastCheckedAt: endedAt.toISOString(),
            nextRetry: run.nextRetry,
          });
          await store.newsRuns.create(run);
        }
        return result;
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        if (renewal) await renewal;
        if (acquired) await store.leases.release(leaseKey, owner);
      }
    },
  };
}
