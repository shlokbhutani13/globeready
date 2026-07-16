const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5051";

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-demo-user": "globeready-demo",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Request failed.");
  return body?.data ?? body;
}
