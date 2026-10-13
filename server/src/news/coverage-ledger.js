const defaultCadenceHours = 12;
const hourMilliseconds = 60 * 60_000;

function validDate(value) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? { value, timestamp } : null;
}

function sortedRuns(runs, sourceId) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.sourceId === sourceId && validDate(run.endedAt))
    .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt));
}

function cadenceFor(source) {
  return Number.isInteger(source?.cadenceHours) && source.cadenceHours > 0
    ? source.cadenceHours
    : defaultCadenceHours;
}

function safeReason(source, status) {
  if (typeof source?.pendingReason === "string" && source.pendingReason.trim()) {
    return source.pendingReason.trim().slice(0, 500);
  }
  if (status === "failing") return "The latest source check failed.";
  if (status === "delayed") return "The source has not completed a successful check on schedule.";
  if (status === "not-checked") return "This source has not completed a successful check yet.";
  if (status === "disabled") return "This verified source is not currently monitored.";
  if (status === "pending") return "This source is awaiting verification.";
  return null;
}

function statusFor(source, latestRun, lastSuccess, now) {
  if (source?.verified !== true) return "pending";
  if (source?.enabled !== true) return "disabled";
  if (latestRun && latestRun.status !== "success") return "failing";
  if (!lastSuccess) return "not-checked";
  if (now.getTime() - Date.parse(lastSuccess.endedAt) > 2 * cadenceFor(source) * hourMilliseconds) return "delayed";
  return "active";
}

function text(value, fallback = "") {
  return typeof value === "string" ? value.slice(0, 300) : fallback;
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, 20).map((item) => item.slice(0, 100))
    : [];
}

export function buildCoverageLedger({ sources = [], runs = [], now = new Date() } = {}) {
  const currentTime = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date();
  const entries = (Array.isArray(sources) ? sources : []).map((source) => {
    const sourceRuns = sortedRuns(runs, source?.id);
    const latestRun = sourceRuns[0] || null;
    const lastSuccess = sourceRuns.find((run) => run.status === "success") || null;
    const status = statusFor(source, latestRun, lastSuccess, currentTime);
    return {
      id: text(source?.id),
      publisher: text(source?.publisher, "Official source"),
      authority: text(source?.authority || source?.sourceType, source?.universityId ? "university" : "federal"),
      jurisdiction: text(source?.jurisdiction, "US"),
      topics: stringList(source?.topics),
      universityId: text(source?.universityId) || null,
      status,
      cadenceHours: cadenceFor(source),
      lastSuccessAt: lastSuccess?.endedAt || null,
      safeReason: safeReason(source, status),
      lastAttemptAt: latestRun?.endedAt || null,
      consecutiveFailures: latestRun?.status === "success" ? 0 : Number(latestRun?.consecutiveFailures) || (latestRun ? 1 : 0),
      latestRunStatus: text(latestRun?.status) || null,
      latestErrorCode: text(latestRun?.errorCode) || null,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  return {
    summary: {
      total: entries.length,
      active: entries.filter(({ status }) => status === "active").length,
      pending: entries.filter(({ status }) => status === "pending").length,
      disabled: entries.filter(({ status }) => status === "disabled").length,
      delayed: entries.filter(({ status }) => status === "delayed").length,
      failing: entries.filter(({ status }) => status === "failing").length,
      notChecked: entries.filter(({ status }) => status === "not-checked").length,
    },
    entries,
  };
}

const publicFields = [
  "id", "publisher", "authority", "jurisdiction", "topics", "universityId", "status",
  "cadenceHours", "lastSuccessAt", "safeReason",
];
const adminFields = [
  ...publicFields, "lastAttemptAt", "consecutiveFailures", "latestRunStatus", "latestErrorCode",
];

function project(ledger, fields) {
  return {
    summary: { ...ledger.summary },
    entries: ledger.entries.map((entry) => Object.fromEntries(fields.map((field) => [field, entry[field]]))),
  };
}

export function publicCoverageLedger(ledger) {
  return project(ledger, publicFields);
}

export function adminCoverageLedger(ledger) {
  return project(ledger, adminFields);
}
