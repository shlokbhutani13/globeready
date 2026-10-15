const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u;
const ENTRY_KEYS = new Set(["id", "name", "domain", "reviewedOn", "offices"]);
const OFFICE_KEYS = new Set(["id", "label", "url", "allowedExternalReason"]);
export const universityOfficeTypes = new Set(["international", "dso", "career", "health", "safety", "housing", "registrar", "tax"]);

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function bounded(value, maximum) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function onDomain(url, domain) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && (parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

export function validateUniversityRegistry(entries, now = new Date()) {
  const errors = [];
  if (!Array.isArray(entries)) return { valid: false, errors: ["Registry must be an array."] };
  const ids = new Set();
  entries.forEach((entry, index) => {
    const at = `Entry ${index + 1}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { errors.push(`${at} must be an object.`); return; }
    for (const key of Object.keys(entry)) if (!ENTRY_KEYS.has(key)) errors.push(`${at} has unsupported field ${key}.`);
    if (!bounded(entry.id, 100) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id || "")) errors.push(`${at} has an invalid id.`);
    if (ids.has(entry.id)) errors.push(`${at} has a duplicate id.`); else ids.add(entry.id);
    if (!bounded(entry.name, 200)) errors.push(`${at} name must be 1 to 200 characters.`);
    if (!bounded(entry.domain, 253) || entry.domain !== entry.domain?.toLowerCase() || !DOMAIN.test(entry.domain || "")) errors.push(`${at} has an invalid normalized domain.`);
    if (!isCalendarDate(entry.reviewedOn) || entry.reviewedOn > now.toISOString().slice(0, 10)) errors.push(`${at} has an invalid review date.`);
    if (!Array.isArray(entry.offices) || entry.offices.length > 20) errors.push(`${at} offices must be an array of at most 20 items.`);
    else entry.offices.forEach((office, officeIndex) => {
      const officeAt = `${at} office ${officeIndex + 1}`;
      if (!office || typeof office !== "object" || Array.isArray(office)) { errors.push(`${officeAt} must be an object.`); return; }
      for (const key of Object.keys(office)) if (!OFFICE_KEYS.has(key)) errors.push(`${officeAt} has unsupported field ${key}.`);
      if (!universityOfficeTypes.has(office.id)) errors.push(`${officeAt} has an unknown office type.`);
      if (!bounded(office.label, 200)) errors.push(`${officeAt} label must be 1 to 200 characters.`);
      let secure = false;
      try { secure = new URL(office.url).protocol === "https:"; } catch { secure = false; }
      if (!bounded(office.url, 500) || !secure) errors.push(`${officeAt} must use a valid HTTPS URL.`);
      if (secure && !onDomain(office.url, entry.domain) && !bounded(office.allowedExternalReason, 300)) errors.push(`${officeAt} is off-domain and needs an allowed external reason.`);
      if (office.allowedExternalReason !== undefined && !bounded(office.allowedExternalReason, 300)) errors.push(`${officeAt} external reason must be 1 to 300 characters.`);
    });
  });
  return { valid: errors.length === 0, errors };
}

export function coverageForUniversity(profile = {}, registry = []) {
  const name = typeof profile.university === "string" ? profile.university.trim() : "";
  const domainValue = typeof profile.officialUniversityDomain === "string" ? profile.officialUniversityDomain.trim().toLowerCase() : "";
  const domain = DOMAIN.test(domainValue) ? domainValue : "";
  if (!name) return { state: "none", name: "", domain: "", entry: null };
  const id = typeof profile.universityId === "string" ? profile.universityId : name.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const entry = registry.find((item) => item.id === id || (domain && item.domain === domain)) || null;
  if (entry) return { state: "reviewed", name, domain: entry.domain, entry };
  return { state: "general-only", name, domain, entry: null };
}
