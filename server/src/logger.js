const severities = { debug: 10, info: 20, warn: 30, error: 40 };

// Field names that must never reach logs, whatever value they carry.
const forbiddenKeyPattern = /(authorization|cookie|token|password|secret|private|credential|api[-_]?key|excerpt|question|answer|prompt|text|body|email|document|content|evidence|profile)/iu;
const maxStringLength = 200;

function safeValue(value) {
  if (typeof value === "string") return value.length > maxStringLength ? `${value.slice(0, maxStringLength)}…` : value;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Error) return value.code || value.name || "Error";
  return undefined;
}

export function sanitizeLogFields(fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (forbiddenKeyPattern.test(key)) continue;
    const cleaned = safeValue(value);
    if (cleaned !== undefined) safe[key] = cleaned;
  }
  return safe;
}

// One JSON object per line, so Cloud Logging or any collector can parse it without a paid provider.
export function createLogger({
  level = "info",
  write = (line) => process.stdout.write(`${line}\n`),
  clock = () => new Date(),
  base = {},
} = {}) {
  if (!severities[level]) throw new Error("Log level must be debug, info, warn, or error.");
  const threshold = severities[level];

  const emit = (severity, event, fields) => {
    if (severities[severity] < threshold) return;
    write(JSON.stringify({
      timestamp: clock().toISOString(),
      severity: severity.toUpperCase(),
      event,
      ...base,
      ...sanitizeLogFields(fields),
    }));
  };

  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (extra) => createLogger({ level, write, clock, base: { ...base, ...sanitizeLogFields(extra) } }),
  };
}

export const noopLogger = Object.freeze({
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() { return noopLogger; },
});
