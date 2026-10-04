import { auth, clientMode } from "./firebase";
import { authHeadersForMode } from "./runtime-mode";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5051";
async function authHeaders() {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : "";
  return authHeadersForMode(clientMode, token);
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(body?.error?.message || "Request failed.");
    error.code = body?.error?.code;
    throw error;
  }
  return body?.data ?? body;
}

export async function apiDownload(path, filename) {
  const response = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
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
