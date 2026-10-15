// A tiny signal so Home and Next steps refresh when a private life tool changes this browser's saved data.
export const LIFE_EVENT = "globeready:life-changed";
export const notifyLifeChanged = () => { try { globalThis.dispatchEvent?.(new Event(LIFE_EVENT)); } catch { /* not in a browser */ } };
