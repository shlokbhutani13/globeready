export function resolveClientMode(env, { DEV, PROD }) {
  const readFlag = (name) => {
    const value = env[name];
    if (value === undefined || value === "" || value === "false") return false;
    if (value === "true") return true;
    throw new Error(`${name} must be 'true' or 'false' when set.`);
  };
  const local = readFlag("VITE_LOCAL_USER_MODE");
  const demo = readFlag("VITE_DEMO_MODE");
  const zeroCostPublic = readFlag("VITE_ZERO_COST_PUBLIC");
  if ([local, demo, zeroCostPublic].filter(Boolean).length > 1) {
    throw new Error("Local-user, demo, and zero-cost-public modes cannot be combined; no two modes may both be true.");
  }
  if ((local || demo) && PROD) {
    throw new Error(`${local ? "Local-user" : "Demo"} mode cannot run in a production build.`);
  }
  if (local) return "local-user";
  if (demo) return "demo";
  if (zeroCostPublic) {
    if (DEV || !PROD) throw new Error("Zero-cost-public mode requires a production build.");
    return "zero-cost-public";
  }
  return "production";
}

export function validateZeroCostPublicConfig(env) {
  if (env.VITE_ZERO_COST_PUBLIC !== "true") return false;
  const forbidden = [
    "VITE_API_URL", "VITE_FIREBASE_STORAGE_BUCKET", "VITE_LOCAL_USER_MODE", "VITE_DEMO_MODE",
  ].filter((name) => env[name] && env[name] !== "false");
  if (env.VITE_DOCUMENT_UPLOADS_ENABLED === "true") forbidden.push("VITE_DOCUMENT_UPLOADS_ENABLED");
  if (forbidden.length) throw new Error(`zero-cost-public cannot use ${forbidden.join(", ")}.`);
  return true;
}

export function authHeadersForMode(mode, token) {
  if (token) return { Authorization: `Bearer ${token}` };
  return mode === "demo" ? { "x-demo-user": "globeready-demo" } : {};
}

export function firebaseAppName(config, mode) {
  const identity = [mode, config.projectId || "", config.appId || "", config.storageBucket || ""].join("|");
  return `globeready-${encodeURIComponent(identity)}`;
}
