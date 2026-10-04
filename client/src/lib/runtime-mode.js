export function resolveClientMode(env, { DEV, PROD }) {
  const readFlag = (name) => {
    const value = env[name];
    if (value === undefined || value === "" || value === "false") return false;
    if (value === "true") return true;
    throw new Error(`${name} must be 'true' or 'false' when set.`);
  };
  const local = readFlag("VITE_LOCAL_USER_MODE");
  const demo = readFlag("VITE_DEMO_MODE");
  if (local && demo) {
    throw new Error("VITE_LOCAL_USER_MODE and VITE_DEMO_MODE cannot both be true.");
  }
  if ((local || demo) && PROD) {
    throw new Error(`${local ? "Local-user" : "Demo"} mode cannot run in a production build.`);
  }
  if (local) return "local-user";
  if (demo) return "demo";
  return "production";
}

export function authHeadersForMode(mode, token) {
  if (token) return { Authorization: `Bearer ${token}` };
  return mode === "demo" ? { "x-demo-user": "globeready-demo" } : {};
}

export function firebaseAppName(config, mode) {
  const identity = [mode, config.projectId || "", config.appId || "", config.storageBucket || ""].join("|");
  return `globeready-${encodeURIComponent(identity)}`;
}
