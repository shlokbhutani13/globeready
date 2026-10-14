// Display choices live only in this browser (localStorage). They hold no personal data and are never sent anywhere.
export const displayChoices = {
  textSize: [["default", "Standard"], ["large", "Large"], ["larger", "Largest"]],
  contrast: [["default", "Standard"], ["high", "High contrast"]],
  motion: [["system", "Follow my device"], ["reduce", "Reduce motion"]],
};
export const defaultDisplay = { textSize: "default", contrast: "default", motion: "system" };
const storageKey = "globeready:display";

export function sanitizeDisplay(value = {}) {
  const clean = { ...defaultDisplay };
  for (const [key, choices] of Object.entries(displayChoices)) {
    if (choices.some(([id]) => id === value?.[key])) clean[key] = value[key];
  }
  return clean;
}

export function loadDisplay(storage = globalThis.localStorage) {
  try { return sanitizeDisplay(JSON.parse(storage?.getItem(storageKey) || "{}")); } catch { return { ...defaultDisplay }; }
}

export function saveDisplay(value, storage = globalThis.localStorage) {
  const clean = sanitizeDisplay(value);
  try { storage?.setItem(storageKey, JSON.stringify(clean)); } catch { /* storage can be unavailable; the choice still applies this visit */ }
  return clean;
}

export function applyDisplay(value, root = globalThis.document?.documentElement) {
  const clean = sanitizeDisplay(value);
  if (!root) return clean;
  root.dataset.textSize = clean.textSize;
  root.dataset.contrast = clean.contrast;
  root.dataset.motion = clean.motion;
  return clean;
}
