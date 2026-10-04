export function mergedSources(registeredSources = [], storedSources = []) {
  const byId = new Map(storedSources.map((source) => [source.id, source]));
  for (const registered of registeredSources) {
    const stored = byId.get(registered.id);
    byId.set(registered.id, {
      ...(stored || {}),
      ...registered,
      ...(stored && Object.hasOwn(stored, "enabled") ? { enabled: stored.enabled } : {}),
      ...(stored && Object.hasOwn(stored, "cadenceHours") ? { cadenceHours: stored.cadenceHours } : {}),
    });
  }
  return [...byId.values()];
}

export function universityCoverage(sources, universityId) {
  const matches = (Array.isArray(sources) ? sources : []).filter(
    (source) => source?.universityId === universityId,
  );
  if (matches.length === 0) return { state: "no-verified-source", sources: [] };

  const verifiedEnabled = matches.filter((source) => source.verified === true && source.enabled === true);
  const state = verifiedEnabled.length === 0
    ? "verification-pending"
    : verifiedEnabled.length === matches.length
      ? "covered"
      : "partial";

  return {
    state,
    sources: matches.map((source) => ({
      publisher: typeof source.publisher === "string" ? source.publisher : "",
      verified: source.verified === true,
      enabled: source.enabled === true,
    })),
  };
}

export function sourceHealth(sources) {
  const active = (Array.isArray(sources) ? sources : []).filter((source) => source.verified === true && source.enabled === true);
  const checked = active.filter((source) => typeof source.lastCheckedAt === "string");
  const delayed = active.filter((source) => (Number(source.consecutiveFailures) || 0) > 0 || source.lastRunStatus === "failed");
  const lastCheckedAt = checked.map((source) => source.lastCheckedAt).sort().at(-1) || null;
  if (delayed.length > 0) {
    return {
      state: "delayed",
      lastCheckedAt,
      delayedPublishers: [...new Set(delayed.map((source) => String(source.publisher || "Official source").slice(0, 200)))],
    };
  }
  return { state: checked.length ? "current" : "not-checked", lastCheckedAt, delayedPublishers: [] };
}
