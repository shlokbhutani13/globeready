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
