export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export const emulatorVariables = [
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_STORAGE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
];

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
