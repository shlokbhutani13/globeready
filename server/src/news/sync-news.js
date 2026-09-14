import { createHash, randomUUID } from "node:crypto";

import { classifyCandidate } from "./classifier.js";
import { defaultNewsSources } from "./default-sources.js";
import { documentTypes, legalStates, normalizeNewsCandidate } from "./schema.js";

const leaseMilliseconds = 15 * 60 * 1_000;
const urgencyValues = new Set(["low", "medium", "high", "urgent", "critical"]);
const relevanceValues = new Set(["relevant", "borderline", "not-relevant"]);

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
    item.title,
    item.sourceExcerpt,
    item.normalizedText,
    item.publishedAt,
    item.updatedAt,
    item.effectiveAt,
    item.sourceDocumentType,
    item.docketNumber,
    item.regulationIdNumber,
    item.canonicalUrl,
    item.officialPdfUrl,
  ];
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
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
  return value;
}

function snapshotText(item) {
  return item.normalizedText || [item.title, item.sourceExcerpt].filter(Boolean).join("\n");
}

function reviewReason({ sourceUrlsVerified, classification, summary }) {
  if (!sourceUrlsVerified) return "unverified-source-url";
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

function retryAt(status, endedAt) {
  if (status === "success") return null;
  return new Date(endedAt.valueOf() + leaseMilliseconds).toISOString();
}

function runRecord(sourceId, result, context) {
  const status = statusFor(result);
  return {
    sourceId,
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
    errorCode: result.errors[0]?.stage ? result.errors[0].stage.toUpperCase().replace(/-/gu, "_") : null,
    nextRetry: retryAt(status, context.endedAt),
  };
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
} = {}) {
  if (!store?.news || typeof store.news.upsert !== "function"
    || !store?.reviewQueue || typeof store.reviewQueue.create !== "function"
    || !store?.newsRuns || typeof store.newsRuns.create !== "function"
    || !store?.leases || typeof store.leases.acquire !== "function" || typeof store.leases.release !== "function") {
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

  const sourceRegistry = new Map(sources.map((entry) => [entry.id, entry]));

  async function resolveSource(sourceId) {
    const registered = sourceRegistry.get(sourceId);
    if (registered) return registered;
    if (typeof store.newsSources?.get === "function") {
      const stored = await store.newsSources.get(sourceId);
      if (stored) return stored;
    }
    throw new Error(`Unknown news source: ${sourceId}.`);
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

  async function synchronizeCandidate(candidate, sourceInput, result, { dryRun }) {
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
      if (!dryRun) {
        try {
          await store.reviewQueue.create({
            newsItemId: null,
            sourceId: sourceInput.id,
            sourceKey: normalized?.sourceKey || null,
            contentHash: normalized ? contentHash(normalized) : null,
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
          result.reviewRequired += 1;
        } catch (reviewError) {
          result.errors.push(safeError("review", reviewError, { sourceKey: normalized?.sourceKey || null }));
        }
      }
      return;
    }

    const sourceUrlsVerified = hasVerifiedSourceUrls(normalized, sourceInput);
    const sourceOnly = sourceUrlsVerified && classification.relevance === "relevant";
    const summary = await generateSummary(normalized, sourceInput, dryRun);
    if (summary?.ok === false) {
      result.errors.push(safeError("summarize", new Error(summary.error || "Summary validation failed."), {
        sourceKey: normalized.sourceKey,
      }));
    }
    const reason = reviewReason({ sourceUrlsVerified, classification, summary });
    const requiresReview = Boolean(reason);
    const hash = contentHash(normalized);
    result.estimatedWrites += 1;
    if (snapshotStore) result.estimatedWrites += 1;
    if (requiresReview) result.estimatedWrites += 1;
    if (dryRun) return;

    let snapshot = null;
    if (snapshotStore) {
      try {
        snapshot = await snapshotStore.save(sourceInput.id, hash, snapshotText(normalized));
      } catch (error) {
        result.errors.push(safeError("snapshot", error, { sourceKey: normalized.sourceKey }));
        return;
      }
    }

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

    if (!upserted.changed || !requiresReview) return;
    try {
      await store.reviewQueue.create({
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
      result.reviewRequired += 1;
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
      let fetched = null;
      let acquired = false;
      const leaseKey = `news-source:${sourceInput.id}`;
      const owner = randomUUID();

      if (dryRun) result.estimatedWrites = 1;
      if (!dryRun) {
        const expiresAt = new Date(startedAt.valueOf() + leaseMilliseconds).toISOString();
        acquired = Boolean(await store.leases.acquire(leaseKey, owner, expiresAt));
        if (!acquired) {
          result.status = "skipped";
          result.errors.push(safeError("lease", new Error("News source already has an active synchronization lease.")));
          return result;
        }
      }

      try {
        if (sourceInput.respectRobotsTxt) {
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
          let adapter;
          try {
            adapter = adapterFor(adapters, sourceInput);
          } catch (error) {
            result.errors.push(safeError("adapt", error));
          }

          if (adapter && sourceInput.fetchMode !== "adapter") {
            try {
              fetched = await fetchSource(sourceInput);
            } catch (error) {
              result.errors.push(safeError("fetch", error));
            }
          }

          if (adapter && result.errors.length === 0 && fetched?.notModified !== true) {
            try {
              candidates = await adapter.collect(sourceInput, fetched || undefined);
              if (!Array.isArray(candidates)) throw new Error("News source adapter must return a candidate array.");
            } catch (error) {
              result.errors.push(safeError("adapt", error));
            }
          }
        }

        result.candidates = candidates.length;
        for (const candidate of candidates) {
          await synchronizeCandidate(candidate, sourceInput, result, { dryRun });
        }
        result.status = statusFor(result);

        if (!dryRun) {
          const endedAt = dateFrom(clock);
          result.estimatedWrites += 1;
          await store.newsRuns.create(runRecord(sourceInput.id, result, { startedAt, endedAt, fetched }));
        }
        return result;
      } finally {
        if (acquired) await store.leases.release(leaseKey, owner);
      }
    },
  };
}
