import { createRequire } from "node:module";

export class ConfigError extends Error {
  constructor(message, issues = [message]) {
    super(message);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export const emulatorVariables = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
];

// Runtime modes are mutually exclusive. "production" is the default when no mode flag is set.
export const runtimeModes = Object.freeze(["production", "demo", "local-user"]);

const serviceAccountPattern = /@[a-z0-9-]+\.iam\.gserviceaccount\.com$/u;
const placeholderPattern = /(your[-_ ]|example\.|changeme|replace[-_ ]?me|placeholder|<[^>]+>|xxx)/iu;
const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u;
const bucketPattern = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/u;
const buildIdPattern = /^[A-Za-z0-9._-]{1,64}$/u;
const uidListPattern = /^[A-Za-z0-9:_-]{1,128}$/u;

function readFlag(env, name) {
  const value = env[name];
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new ConfigError(`${name} must be exactly 'true' or 'false' when set.`);
}

function isLoopbackHostPort(value) {
  return /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(value || "");
}

export function integrationConfigForRuntime(mode, env = process.env) {
  if (mode === "local-user") {
    return { geminiApiKey: undefined, geminiEmbeddingsEnabled: false, newsSyncEnabled: false };
  }
  return {
    geminiApiKey: env.GEMINI_API_KEY,
    geminiEmbeddingsEnabled: env.GEMINI_EMBEDDINGS_ENABLED === "true",
    newsSyncEnabled: env.NEWS_SYNC_ENABLED === "true",
  };
}

export function resolveRuntimeMode(env = process.env) {
  const demo = readFlag(env, "DEMO_MODE");
  const local = readFlag(env, "LOCAL_USER_MODE");
  if (demo && local) {
    throw new ConfigError("DEMO_MODE and LOCAL_USER_MODE cannot both be true.");
  }
  if ((demo || local) && env.NODE_ENV === "production") {
    throw new ConfigError(`${demo ? "DEMO_MODE" : "LOCAL_USER_MODE"}=true is not allowed when NODE_ENV=production.`);
  }
  if (local) {
    const missing = emulatorVariables.filter((name) => !env[name]);
    if (missing.length) {
      throw new ConfigError(`LOCAL_USER_MODE requires ${missing.join(", ")} to be set.`);
    }
    if (/^https?:\/\//.test(env.FIREBASE_STORAGE_EMULATOR_HOST)) {
      throw new ConfigError("FIREBASE_STORAGE_EMULATOR_HOST must be host:port without a URL scheme.");
    }
    if (!/^https?:\/\//.test(env.STORAGE_EMULATOR_HOST)) {
      throw new ConfigError("STORAGE_EMULATOR_HOST must be an http(s) URL for the Google Storage client.");
    }
    for (const name of ["FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
      if (!isLoopbackHostPort(env[name])) throw new ConfigError(`${name} must use a loopback host in local-user mode.`);
    }
    let storageUrl;
    try { storageUrl = new URL(env.STORAGE_EMULATOR_HOST); } catch { throw new ConfigError("STORAGE_EMULATOR_HOST must be a valid loopback URL."); }
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(storageUrl.hostname)) {
      throw new ConfigError("STORAGE_EMULATOR_HOST must use a loopback host in local-user mode.");
    }
    return { mode: "local-user" };
  }
  const present = emulatorVariables.filter((name) => env[name]);
  if (present.length) {
    throw new ConfigError(`Emulator host variables (${present.join(", ")}) are set without LOCAL_USER_MODE=true. Refusing to start.`);
  }
  return { mode: demo ? "demo" : "production" };
}

export function isDemoMode(env = process.env) {
  return resolveRuntimeMode(env).mode === "demo";
}

// Integer settings: an unset value uses the fallback; anything malformed or out of range is refused,
// never coerced to NaN (which would silently disable a limit).
export function parseIntegerEnv(env, name, { fallback, min, max }) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/u.test(value)) throw new ConfigError(`${name} must be a whole number from ${min} to ${max}.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new ConfigError(`${name} must be a whole number from ${min} to ${max}.`);
  return parsed;
}

export function parseBooleanEnv(env, name, fallback) {
  const value = env[name];
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ConfigError(`${name} must be exactly 'true' or 'false' when set.`);
}

// Loopback origins may use http in production mode, so a developer can run against real Firebase on localhost.
// Any other production origin must be https.
function parseOrigins(value, { requireHttps }) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    let url;
    try { url = new URL(entry); } catch { throw new ConfigError(`CLIENT_URL entry is not a valid URL: ${entry.slice(0, 80)}`); }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (requireHttps && url.protocol !== "https:" && !loopback) throw new ConfigError("CLIENT_URL must use https:// in production.");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new ConfigError("CLIENT_URL must use https:// or http://.");
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
      throw new ConfigError("CLIENT_URL must be an origin only, with no path, query, or credentials.");
    }
    return url.origin;
  });
}

function parseTrustProxy(value) {
  if (value === undefined || value === "" || value === "false") return false;
  if (value === "loopback") return "loopback";
  if (/^[1-3]$/u.test(value)) return Number(value);
  throw new ConfigError("TRUST_PROXY must be 'false', 'loopback', or a hop count from 1 to 3.");
}

function packageVersion() {
  return createRequire(import.meta.url)("../package.json").version;
}

// Validates the whole environment and returns one typed configuration object.
// Every problem is collected so an operator can fix them in one pass. Secret values are never echoed.
export function loadServerConfig(env = process.env, { version = packageVersion() } = {}) {
  const issues = [];
  let mode;
  try {
    mode = resolveRuntimeMode(env).mode;
  } catch (error) {
    throw error instanceof ConfigError ? error : new ConfigError("Runtime mode could not be resolved.");
  }
  const production = mode === "production";
  const collect = (fn, fallback) => {
    try { return fn(); } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      issues.push(...error.issues);
      return fallback;
    }
  };

  const ints = {
    aiRequestsPerMinute: collect(() => parseIntegerEnv(env, "AI_REQUESTS_PER_MINUTE", { fallback: 12, min: 1, max: 600 }), 12),
    newsQueriesPerMinute: collect(() => parseIntegerEnv(env, "NEWS_QUERIES_PER_MINUTE", { fallback: 60, min: 1, max: 6000 }), 60),
    newsSourceSuggestionsPerHour: collect(() => parseIntegerEnv(env, "NEWS_SOURCE_SUGGESTIONS_PER_HOUR", { fallback: 5, min: 1, max: 500 }), 5),
    newsAdminMutationsPerMinute: collect(() => parseIntegerEnv(env, "NEWS_ADMIN_MUTATIONS_PER_MINUTE", { fallback: 30, min: 1, max: 600 }), 30),
    accountExportsPerHour: collect(() => parseIntegerEnv(env, "ACCOUNT_EXPORTS_PER_HOUR", { fallback: 6, min: 1, max: 100 }), 6),
    accountDeletionsPerHour: collect(() => parseIntegerEnv(env, "ACCOUNT_DELETIONS_PER_HOUR", { fallback: 5, min: 1, max: 100 }), 5),
    geminiTimeoutMs: collect(() => parseIntegerEnv(env, "GEMINI_TIMEOUT_MS", { fallback: 20_000, min: 1_000, max: 60_000 }), 20_000),
    port: collect(() => parseIntegerEnv(env, "PORT", { fallback: 5051, min: 1, max: 65_535 }), 5051),
    shutdownTimeoutMs: collect(() => parseIntegerEnv(env, "SHUTDOWN_TIMEOUT_MS", { fallback: 10_000, min: 1_000, max: 60_000 }), 10_000),
  };
  const ocrEnabled = collect(() => parseBooleanEnv(env, "DOCUMENT_OCR_ENABLED", true), true);
  const newsSyncEnabled = collect(() => parseBooleanEnv(env, "NEWS_SYNC_ENABLED", false), false);
  const embeddingsEnabled = collect(() => parseBooleanEnv(env, "GEMINI_EMBEDDINGS_ENABLED", false), false);
  if (embeddingsEnabled) issues.push("GEMINI_EMBEDDINGS_ENABLED=true is not supported in this release; keep it false.");

  // Local-user mode accepts unsigned emulator tokens, so it must never listen on a network interface.
  const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
  const host = env.HOST || (mode === "local-user" ? "127.0.0.1" : "0.0.0.0");
  if (!/^[A-Za-z0-9.:-]{1,253}$/u.test(host)) issues.push("HOST must be an IP address or localhost.");
  if (mode === "local-user" && !loopbackHosts.has(host)) {
    issues.push("HOST must be a loopback address (127.0.0.1, ::1, or localhost) in local-user mode, because emulator tokens are unsigned.");
  }

  const logLevel = env.LOG_LEVEL || "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel)) issues.push("LOG_LEVEL must be debug, info, warn, or error.");

  const trustProxy = collect(() => parseTrustProxy(env.TRUST_PROXY), false);
  const buildId = env.BUILD_ID || "unset";
  if (!buildIdPattern.test(buildId)) issues.push("BUILD_ID may contain only letters, digits, dot, underscore, and hyphen (1 to 64 characters).");

  const rateLimitScope = env.RATE_LIMIT_SCOPE || "";
  if (rateLimitScope && rateLimitScope !== "single-instance") {
    issues.push("RATE_LIMIT_SCOPE must be 'single-instance' when set.");
  }

  const adminUids = (env.ADMIN_UIDS || "").split(",").map((uid) => uid.trim()).filter(Boolean);
  if (adminUids.some((uid) => !uidListPattern.test(uid))) issues.push("ADMIN_UIDS must be a comma-separated list of Firebase UIDs.");

  const newsSyncSecret = env.NEWS_SYNC_SECRET || "";
  if (newsSyncSecret && (newsSyncSecret.length < 16 || newsSyncSecret.length > 512)) {
    issues.push("NEWS_SYNC_SECRET must be 16 to 512 characters when set.");
  }
  if (newsSyncEnabled && !newsSyncSecret) issues.push("NEWS_SYNC_ENABLED=true requires NEWS_SYNC_SECRET.");

  const geminiApiKey = mode === "local-user" ? undefined : (env.GEMINI_API_KEY || undefined);
  if (geminiApiKey && /\s/u.test(geminiApiKey)) issues.push("GEMINI_API_KEY must not contain whitespace.");

  const projectId = env.FIREBASE_PROJECT_ID || "";
  const storageBucket = env.FIREBASE_STORAGE_BUCKET || "";
  let clientOrigins = ["http://localhost:5173"];
  const clientUrlProvided = Boolean(env.CLIENT_URL);
  if (production) {
    for (const [name, value] of [["FIREBASE_PROJECT_ID", projectId], ["FIREBASE_STORAGE_BUCKET", storageBucket], ["CLIENT_URL", env.CLIENT_URL || ""]]) {
      if (!value) issues.push(`${name} is required in production.`);
      else if (placeholderPattern.test(value)) issues.push(`${name} still contains a placeholder value.`);
    }
    if (projectId && !projectIdPattern.test(projectId)) issues.push("FIREBASE_PROJECT_ID is not a valid Firebase project ID.");
    if (storageBucket && !bucketPattern.test(storageBucket)) issues.push("FIREBASE_STORAGE_BUCKET is not a valid bucket name.");
    if (!rateLimitScope) {
      issues.push("RATE_LIMIT_SCOPE=single-instance is required in production: the rate limiter is per instance, so the deployment must run one instance.");
    }
    if (env.FIREBASE_CLIENT_EMAIL && !serviceAccountPattern.test(env.FIREBASE_CLIENT_EMAIL)) {
      issues.push("FIREBASE_CLIENT_EMAIL must be a service-account email address.");
    }
    if (env.FIREBASE_CLIENT_EMAIL && placeholderPattern.test(env.FIREBASE_CLIENT_EMAIL)) {
      issues.push("FIREBASE_CLIENT_EMAIL still contains a placeholder value.");
    }
    if (geminiApiKey && placeholderPattern.test(geminiApiKey)) issues.push("GEMINI_API_KEY still contains a placeholder value.");
  }
  if (clientUrlProvided) {
    clientOrigins = collect(() => parseOrigins(env.CLIENT_URL, { requireHttps: production }), clientOrigins);
  } else if (production) {
    clientOrigins = [];
  }

  if (issues.length) {
    throw new ConfigError(`Invalid configuration for ${mode} mode.`, issues);
  }

  return Object.freeze({
    mode,
    production,
    version,
    buildId,
    logLevel,
    port: ints.port,
    host,
    shutdownTimeoutMs: ints.shutdownTimeoutMs,
    clientOrigins,
    trustProxy,
    rateLimitScope: rateLimitScope || "development-in-memory",
    firebase: Object.freeze({ projectId: projectId || null, storageBucket: storageBucket || null }),
    adminUids,
    limits: Object.freeze({
      aiRequestsPerMinute: ints.aiRequestsPerMinute,
      newsQueriesPerMinute: ints.newsQueriesPerMinute,
      newsSourceSuggestionsPerHour: ints.newsSourceSuggestionsPerHour,
      newsAdminMutationsPerMinute: ints.newsAdminMutationsPerMinute,
      accountExportsPerHour: ints.accountExportsPerHour,
      accountDeletionsPerHour: ints.accountDeletionsPerHour,
    }),
    gemini: Object.freeze({
      enabled: Boolean(geminiApiKey),
      apiKey: geminiApiKey,
      model: env.GEMINI_MODEL || "gemini-2.5-flash",
      embeddingModel: env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
      timeoutMs: ints.geminiTimeoutMs,
      embeddingsEnabled,
    }),
    ocrEnabled,
    newsSync: Object.freeze({ enabled: newsSyncEnabled, secret: newsSyncSecret || undefined }),
  });
}

// Safe, non-secret summary for startup logs and /api/health. Never includes keys, secrets, or hostnames of private services.
export function configSummary(config) {
  return {
    mode: config.mode,
    version: config.version,
    build: config.buildId,
    logLevel: config.logLevel,
    trustProxy: config.trustProxy,
    rateLimitScope: config.rateLimitScope,
    clientOriginCount: config.clientOrigins.length,
    firebaseProject: config.firebase.projectId ? "configured" : "not-configured",
    storageBucket: config.firebase.storageBucket ? "configured" : "not-configured",
    gemini: config.gemini.enabled ? "configured" : "not-configured",
    documentOcr: config.ocrEnabled ? "enabled" : "disabled",
    newsSync: config.newsSync.enabled ? "enabled" : "disabled",
  };
}
