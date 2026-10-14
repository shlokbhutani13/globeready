const endpoint = "/data/news.json";
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

export async function loadStaticCoverage({ fetchImpl = fetch } = {}) {
  const artifact = await loadVerifiedArtifact(coverageEndpoint, fetchImpl);
  if (!Array.isArray(artifact.entries)) throw new Error("The news coverage ledger is invalid.");
  return artifact;
}

export async function loadStaticNews(filters = {}, { now = new Date(), fetchImpl = fetch } = {}) {
  const artifact = await loadVerifiedArtifact(endpoint, fetchImpl);
  const generatedAt = Date.parse(artifact.generatedAt);
  if (!Number.isFinite(generatedAt) || !Number.isInteger(artifact.cadenceHours)) throw new Error("The news feed metadata is invalid.");
  const overdue = now.getTime() - generatedAt > artifact.cadenceHours * 2 * 60 * 60 * 1000;
  return {
    items: (Array.isArray(artifact.stories) ? artifact.stories : []).filter((item) => matches(item, filters)),
    nextCursor: null,
    sourceHealth: { state: overdue ? "delayed" : "current", generatedAt: artifact.generatedAt, cadenceHours: artifact.cadenceHours },
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
