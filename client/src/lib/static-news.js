const endpoint = "/data/news.json";
const liveEndpoint = "/data/live-news.json";
const coverageEndpoint = "/data/coverage.json";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

export async function contentHashFor(artifact) {
  const unsigned = Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "contentHash"));
  const bytes = new TextEncoder().encode(JSON.stringify(stable(unsigned)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matches(item, filters = {}) {
  if (filters.topic && !item.topics?.includes(filters.topic)) return false;
  if (filters.visaType && !item.visaTypes?.includes(filters.visaType)) return false;
  if (filters.legalState && item.legalState !== filters.legalState) return false;
  if (filters.universityId && !item.universityIds?.includes(filters.universityId)) return false;
  if (filters.sourceId && item.sourceId !== filters.sourceId) return false;
  if (filters.from && String(item.publishedAt || "") < filters.from) return false;
  if (filters.to && String(item.publishedAt || "") > filters.to) return false;
  if (filters.q) {
    const haystack = [item.title, item.shortSummary, item.excerpt, item.publisher].join(" ").toLocaleLowerCase();
    if (!haystack.includes(String(filters.q).trim().toLocaleLowerCase())) return false;
  }
  return true;
}

async function loadVerifiedArtifact(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("The reviewed news feed is unavailable.");
  const artifact = await response.json();
  if (artifact?.schemaVersion !== 1) throw new Error("The news feed version is not supported.");
  if (!/^[a-f0-9]{64}$/u.test(artifact.contentHash || "") || await contentHashFor(artifact) !== artifact.contentHash) {
    throw new Error("The news feed failed its integrity check.");
  }
  return artifact;
}

function dedupeKey(item) {
  if (item.canonicalUrl) {
    try {
      const url = new URL(item.canonicalUrl);
      url.hash = "";
      return `url:${url.toString().replace(/\/$/u, "").toLocaleLowerCase()}`;
    } catch { /* A malformed URL cannot displace a reviewed record. */ }
  }
  return `title:${String(item.title || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase()}`;
}

function mergeNews(reviewedStories, liveStories) {
  const reviewed = Array.isArray(reviewedStories) ? reviewedStories : [];
  const live = Array.isArray(liveStories) ? liveStories : [];
  const keys = new Set(reviewed.flatMap((item) => [dedupeKey(item), `title:${String(item.title || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase()}`]));
  const merged = [...reviewed];
  for (const item of live) {
    const titleKey = `title:${String(item.title || "").trim().replace(/\s+/gu, " ").toLocaleLowerCase()}`;
    if (keys.has(dedupeKey(item)) || keys.has(titleKey)) continue;
    keys.add(dedupeKey(item));
    keys.add(titleKey);
    merged.push(item);
  }
  return merged.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")) || String(a.title || "").localeCompare(String(b.title || "")));
}

function coverageStatus(report) {
  if (report.state === "disabled") return "disabled";
  if (report.state === "current") return "active";
  return "failing";
}

export function coverageLedgerFromLiveFeed({ generatedAt, sourceReports = [] } = {}) {
  const entries = sourceReports.map((report) => {
    const status = coverageStatus(report);
    return {
      id: report.sourceId,
      name: report.name,
      status,
      fetched: Number(report.fetched) || 0,
      ...(status === "active" ? { lastSuccessAt: generatedAt } : {}),
      ...(report.error || report.reason ? { safeReason: report.error || report.reason } : {}),
    };
  });
  const monitored = entries.filter((entry) => entry.status !== "disabled");
  return {
    generatedAt,
    summary: {
      active: monitored.filter((entry) => entry.status === "active").length,
      reachable: monitored.filter((entry) => entry.status === "active").length,
      withRelevantStories: monitored.filter((entry) => entry.status === "active" && entry.fetched > 0).length,
      total: monitored.length,
      failing: monitored.filter((entry) => entry.status === "failing").length,
      disabled: entries.filter((entry) => entry.status === "disabled").length,
    },
    entries,
  };
}

export async function loadStaticCoverage({ fetchImpl = fetch } = {}) {
  const artifact = await loadVerifiedArtifact(coverageEndpoint, fetchImpl);
  if (!Array.isArray(artifact.entries)) throw new Error("The news coverage ledger is invalid.");
  return artifact;
}

export async function loadStaticNews(filters = {}, { now = new Date(), fetchImpl = fetch } = {}) {
  const reviewedArtifact = await loadVerifiedArtifact(endpoint, fetchImpl);
  let liveArtifact;
  let liveError = null;
  try {
    liveArtifact = await loadVerifiedArtifact(liveEndpoint, fetchImpl);
  } catch (error) {
    liveError = error;
  }
  const metadata = liveArtifact || reviewedArtifact;
  const generatedAt = Date.parse(metadata.generatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isInteger(metadata.cadenceHours)) throw new Error("The news feed metadata is invalid.");
  const overdue = now.getTime() - generatedAt > 12 * 60 * 60 * 1000;
  const stories = mergeNews(reviewedArtifact.stories, liveArtifact?.stories);
  const sourceReports = liveArtifact?.sourceReports || [];
  return {
    items: stories.filter((item) => matches(item, filters)),
    nextCursor: null,
    sourceHealth: {
      state: liveError ? "degraded" : overdue ? "delayed" : "current",
      generatedAt: metadata.generatedAt,
      cadenceHours: metadata.cadenceHours,
      sourceReports,
      coverageLedger: coverageLedgerFromLiveFeed({ generatedAt: metadata.generatedAt, sourceReports }),
      ...(liveError ? { message: "Automatic official-source updates are temporarily unavailable; reviewed updates remain available." } : {}),
    },
  };
}

export function subscribeStaticNews(filters, onData, onError, { intervalMs = 120_000, ...options } = {}) {
  let cancelled = false;
  const load = async () => {
    try {
      const result = await loadStaticNews(filters, options);
      if (!cancelled) onData(result.items, { nextCursor: result.nextCursor, sourceHealth: result.sourceHealth });
    } catch (error) {
      if (!cancelled) onError?.(error);
    }
  };
  load();
  const interval = setInterval(load, intervalMs);
  return () => { cancelled = true; clearInterval(interval); };
}
