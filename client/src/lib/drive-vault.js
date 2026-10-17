// Optional original-file vault in the student's OWN Google Drive, inside the hidden app-data folder. Only this app can
// see that folder (it does not appear in the Drive website), GlobeReady's servers never receive the files, and the
// access token lives in memory only. Needs the owner's Google OAuth client id (VITE_GOOGLE_CLIENT_ID).
export const driveScope = "https://www.googleapis.com/auth/drive.appdata";
export const maxVaultFileBytes = 10 * 1024 * 1024;
export const maxVaultFiles = 50;
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const api = "https://www.googleapis.com";

export const googleClientId = () => String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
export const vaultConfigured = () => /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(googleClientId());

export function validateVaultFile(file, existingCount = 0) {
  if (!file || !allowedTypes.has(file.type)) return "Choose a PDF, PNG or JPEG file.";
  if (file.size > maxVaultFileBytes) return "Files must be 10 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  if (existingCount >= maxVaultFiles) return `The vault holds up to ${maxVaultFiles} files. Delete one first.`;
  return "";
}

export function safeName(name) {
  const cleaned = String(name || "document").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "").trim().slice(0, 120);
  return cleaned || "document";
}

export function loadGoogleIdentity({ documentImpl = globalThis.document, windowImpl = globalThis.window } = {}) {
  return new Promise((resolve, reject) => {
    if (windowImpl?.google?.accounts?.oauth2) return resolve(windowImpl.google);
    const script = documentImpl.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => (windowImpl.google?.accounts?.oauth2 ? resolve(windowImpl.google) : reject(new Error("Google sign-in did not load.")));
    script.onerror = () => reject(new Error("Google sign-in could not be loaded. Check your connection."));
    documentImpl.head.appendChild(script);
  });
}

// Resolves with an access token that is valid for this page only. Never stored.
export async function requestDriveAccess({ clientId = googleClientId(), load = loadGoogleIdentity } = {}) {
  if (!vaultConfigured() && !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(clientId)) throw new Error("The document vault is not set up for this site yet.");
  const google = await load();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: driveScope,
      callback: (response) => (response?.access_token ? resolve(response.access_token) : reject(new Error(response?.error_description || "Google did not allow access."))),
      error_callback: () => reject(new Error("Google access was cancelled.")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

async function call(token, path, options = {}, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(`${api}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (response.status === 401) throw new Error("Your Google access expired. Choose Connect Google Drive again.");
  if (!response.ok) throw new Error(`Google Drive returned an error (${response.status}).`);
  return response;
}

export async function listVault(token, fetchImpl) {
  const query = "/drive/v3/files?spaces=appDataFolder&pageSize=100&orderBy=createdTime%20desc&fields=files(id%2Cname%2Csize%2CcreatedTime%2CmimeType)";
  const body = await (await call(token, query, {}, fetchImpl)).json();
  return (body.files || []).map((file) => ({ id: file.id, name: file.name, size: Number(file.size) || 0, createdTime: file.createdTime, mimeType: file.mimeType }));
}

export async function uploadToVault(token, file, fetchImpl) {
  const boundary = `globeready${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: safeName(file.name), parents: ["appDataFolder"], mimeType: file.type });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    file, `\r\n--${boundary}--`,
  ]);
  const result = await (await call(token, "/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname", {
    method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  }, fetchImpl)).json();
  return result;
}

export async function downloadFromVault(token, id, fetchImpl) {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) throw new Error("That file id is not valid.");
  return (await call(token, `/drive/v3/files/${id}?alt=media`, {}, fetchImpl)).blob();
}

export async function deleteFromVault(token, id, fetchImpl) {
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) throw new Error("That file id is not valid.");
  await call(token, `/drive/v3/files/${id}`, { method: "DELETE" }, fetchImpl);
  return true;
}
