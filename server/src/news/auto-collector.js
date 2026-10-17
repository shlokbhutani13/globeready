import { createHash } from "node:crypto";

import { clusterAutoStories, deduplicateAutoStories, extractLeadImage, parseAutoSource, qualifyAutoStory } from "./auto-ingestion.js";
import { buildReviewCandidate } from "./review-candidates.js";

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export function contentHashForAutoNews(artifact) {
  const unsigned = Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "contentHash"));
  return createHash("sha256").update(JSON.stringify(stable(unsigned))).digest("hex");
}

export function buildAutoReviewCandidates(stories = [], sources = [], collectedAt) {
  const registry = new Map(sources.map((source) => [source.id, source]));
  return stories.map((story) => buildReviewCandidate({
    source: registry.get(story.sourceId),
    collectedAt,
    changeType: "new",
    current: {
      externalId: story.id,
      title: story.title,
      canonicalUrl: story.canonicalUrl,
      publishedAt: story.publishedAt || null,
      updatedAt: null,
      effectiveAt: null,
      sourceExcerpt: story.excerpt || "",
      topics: story.topics || [],
      visaTypes: story.visaTypes || [],
    },
  }));
}

async function fetchWithRetry(source, fetcher, retryDelays) {
  let lastError;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try { return { fetched: await fetcher(source), attempts: attempt + 1 }; }
    catch (error) {
      lastError = error;
      if (attempt < retryDelays.length && retryDelays[attempt] > 0) await sleep(retryDelays[attempt]);
    }
  }
  throw Object.assign(lastError instanceof Error ? lastError : new Error("Source fetch failed."), { attempts: retryDelays.length + 1 });
}

const safeError = (error) => String(error?.message || "Source collection failed.").replace(/\s+/gu, " ").slice(0, 240);

export async function collectAutoNews({
  sources = [], fetcher, detailFetcher, robots, previous = {}, now = () => new Date(), retryDelays = [500, 1_500],
} = {}) {
  if (typeof fetcher !== "function") throw new Error("The collector needs a source fetcher.");
  const previousStories = Array.isArray(previous.stories) ? previous.stories : [];
  const previousReports = new Map((Array.isArray(previous.sourceReports) ? previous.sourceReports : []).map((report) => [report.sourceId, report]));
  const collectedAt = now().toISOString();
  const successful = [];
  const retained = [];
  const sourceReports = [];

  for (const source of sources) {
    if (!source.enabled) {
      sourceReports.push({ sourceId: source.id, name: source.name, state: "disabled", fetched: 0, reason: source.disabledReason || "Disabled in the registry." });
      continue;
    }
    const prior = previousStories
      .filter((story) => story.sourceId === source.id)
      .map((story) => qualifyAutoStory(source, story))
      .filter(Boolean);
    try {
      if (robots && !await robots.isAllowed(source)) {
        retained.push(...prior);
        const priorReport = previousReports.get(source.id) || {};
        sourceReports.push({ sourceId: source.id, name: source.name, state: "blocked-by-robots", fetched: 0, retained: prior.length, reason: "Collection is blocked by the source's robots.txt policy.", failedSince: priorReport.failedSince || collectedAt, ...(priorReport.lastSuccessAt ? { lastSuccessAt: priorReport.lastSuccessAt } : {}) });
        continue;
      }
      const { fetched, attempts } = await fetchWithRetry(source, fetcher, retryDelays);
      const parsedStories = parseAutoSource(source, fetched);
      const stories = [];
      let imageLookups = 0;
      for (const item of parsedStories) {
        if (item.image || !detailFetcher || imageLookups >= (source.imageFetchLimit || 12)) { stories.push(item); continue; }
        imageLookups += 1;
        try {
          const detailSource = { ...source, url: item.canonicalUrl, acceptedContentTypes: ["text/html", "application/xhtml+xml"] };
          if (robots && !await robots.isAllowed(detailSource)) { stories.push(item); continue; }
          const detail = await detailFetcher(detailSource);
          const image = extractLeadImage(source, detail.text, detail.finalUrl || item.canonicalUrl, item.title);
          stories.push(image ? { ...item, image } : item);
        } catch { stories.push(item); }
      }
      successful.push(...stories);
      sourceReports.push({ sourceId: source.id, name: source.name, state: "current", fetched: stories.length, attempts, lastSuccessAt: collectedAt });
    } catch (error) {
      retained.push(...prior);
      const priorReport = previousReports.get(source.id) || {};
      sourceReports.push({ sourceId: source.id, name: source.name, state: "failed", fetched: 0, retained: prior.length, attempts: error?.attempts || retryDelays.length + 1, error: safeError(error), failedSince: priorReport.failedSince || collectedAt, ...(priorReport.lastSuccessAt ? { lastSuccessAt: priorReport.lastSuccessAt } : {}) });
    }
  }

  const payload = {
    schemaVersion: 1,
    generatedAt: collectedAt,
    cadenceHours: 4,
    stories: clusterAutoStories(deduplicateAutoStories([...successful, ...retained])).slice(0, 250),
    sourceReports,
  };
  return { ...payload, contentHash: contentHashForAutoNews(payload) };
}
