export const onboardingStates = Object.freeze([
  "proposed", "verifying", "verified-disabled", "enabled", "delayed", "rejected",
]);

const transitions = new Map([
  ["proposed", new Set(["verifying", "rejected"])],
  ["verifying", new Set(["verified-disabled", "rejected"])],
  ["verified-disabled", new Set(["enabled", "rejected"])],
  ["enabled", new Set(["delayed", "verified-disabled"])],
  ["delayed", new Set(["enabled", "verified-disabled", "rejected"])],
  ["rejected", new Set(["proposed"])],
]);

const adapters = new Set(["federal-register", "feed", "index-page", "university-sitemap"]);
const robotsResults = new Set(["allowed", "not-found-allowed", "denied"]);
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;

function requiredText(value, label, max = 300) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label} is required.`);
  return value.trim();
}

function isoDate(value, label) {
  const text = requiredText(value, label, 50);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} is invalid.`);
  return text;
}

function verifiedFields(current, next) {
  const officialDomain = requiredText(next.officialDomain ?? current.officialDomain, "Official domain").toLowerCase();
  if (!domainPattern.test(officialDomain)) throw new Error("Official domain is invalid.");
  const sourceUrl = requiredText(next.sourceUrl ?? current.sourceUrl, "Source URL", 2_000);
  let url;
  try { url = new URL(sourceUrl); } catch { throw new Error("Source URL is invalid."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== officialDomain) {
    throw new Error("Source URL must use the official domain.");
  }
  const adapter = requiredText(next.adapter ?? current.adapter, "Adapter", 100);
  if (!adapters.has(adapter)) throw new Error("Adapter is invalid.");
  const robotsResult = requiredText(next.robotsResult ?? current.robotsResult, "Robots result", 100);
  if (!robotsResults.has(robotsResult)) throw new Error("Robots result is invalid.");
  const parserContractVersion = requiredText(
    next.parserContractVersion ?? current.parserContractVersion,
    "Parser contract version",
    100,
  );
  const cadenceHours = next.cadenceHours ?? current.cadenceHours;
  if (!Number.isInteger(cadenceHours) || cadenceHours < 1 || cadenceHours > 720) throw new Error("Cadence is invalid.");
  const topics = next.topics ?? current.topics;
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 20
    || topics.some((topic) => typeof topic !== "string" || !topic.trim() || topic.length > 100)) {
    throw new Error("Topics are required.");
  }
  return {
    officialDomain,
    sourceUrl: url.href,
    adapter,
    robotsResult,
    parserContractVersion,
    cadenceHours,
    topics: [...new Set(topics.map((topic) => topic.trim()))],
  };
}

export function validateOnboardingTransition(current = {}, next = {}) {
  const currentState = current.state || "proposed";
  const nextState = next.state;
  if (!onboardingStates.includes(currentState) || !onboardingStates.includes(nextState)
    || !transitions.get(currentState)?.has(nextState)) {
    throw new Error("Source onboarding transition is not allowed.");
  }

  const normalized = { ...current, state: nextState };
  if (["verified-disabled", "enabled", "delayed"].includes(nextState)) {
    Object.assign(normalized, verifiedFields(current, next));
  }
  if (["verified-disabled", "rejected"].includes(nextState)) {
    normalized.decisionAt = isoDate(next.decisionAt, "Decision time");
    normalized.decisionBy = requiredText(next.decisionBy, "Decision actor", 128);
  }
  if (nextState === "rejected") normalized.safeReason = requiredText(next.safeReason, "Safe reason", 500);
  return normalized;
}

export function onboardingChecklistComplete(onboarding = {}) {
  try {
    verifiedFields(onboarding, onboarding);
    return Boolean(onboarding.decisionAt && onboarding.decisionBy);
  } catch {
    return false;
  }
}
