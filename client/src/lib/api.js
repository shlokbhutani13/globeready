import { auth, clientMode } from "./firebase";
import { authHeadersForMode } from "./runtime-mode";

const developmentApiUrl = "http://localhost:5051";

// Resolves the API origin for this build. Production builds must name an https origin explicitly; there is no
// localhost fallback in production, so a misconfigured release fails visibly instead of calling the wrong host.
export function resolveApiUrl(env, { PROD }) {
  const value = env.VITE_API_URL;
  if (!value) return PROD ? null : developmentApiUrl;
  let url;
  try { url = new URL(value); } catch { throw new Error("VITE_API_URL must be an absolute URL."); }
  if (PROD && url.protocol !== "https:") throw new Error("VITE_API_URL must use https in production builds.");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("VITE_API_URL must be an origin only.");
  }
  return url.origin;
}

const API_URL = resolveApiUrl(import.meta.env, import.meta.env);

function apiBase() {
  if (!API_URL) throw Object.assign(new Error("The service address is not configured for this build."), { code: "api_not_configured" });
  return API_URL;
}

async function authHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  return authHeadersForMode(clientMode, token);
}

// Reads a JSON body without trusting it. A proxy page or an empty body must not crash the caller.
async function readJson(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("The service returned an unexpected response."), { code: "unexpected_response" });
  }
}

export async function apiRequest(path, options = {}) {
  const base = apiBase();
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...options.headers,
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Request failed.");
    error.code = body?.error?.code;
    throw error;
  }
  return body?.data ?? body;
}

export async function apiDownload(path, filename) {
  const response = await fetch(`${apiBase()}${path}`, { headers: await authHeaders() });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message || "The export could not be created.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
