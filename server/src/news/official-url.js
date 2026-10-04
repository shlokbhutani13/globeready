import { canonicalSourceHostname } from "./url-policy.js";

const maximumUrlLength = 2_000;
const officialSuffixes = [".gov", ".edu"];

function officialHostnameSuffixes(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((suffix) =>
    typeof suffix !== "string" || !/^\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(suffix))) {
    throw new Error("Official hostname suffixes are invalid.");
  }
  return [...new Set(values)];
}

export function canonicalOfficialHostname(value, { allowedSuffixes = officialSuffixes } = {}) {
  if (typeof value !== "string" || !value || value.length > 253) {
    throw new Error("Official hostname is invalid.");
  }
  const suffixes = officialHostnameSuffixes(allowedSuffixes);
  const hostname = canonicalSourceHostname(value);
  if (hostname !== value || !suffixes.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Official hostname must be a canonical .gov or .edu DNS name.");
  }
  return hostname;
}

export function parseOfficialUrl(value, {
  allowedSuffixes = officialSuffixes,
  maxLength = maximumUrlLength,
  allowSearch = false,
} = {}) {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new Error("Official URL length limit is invalid.");
  }
  if (typeof value !== "string" || !value || value.length > maxLength
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error("Official URL is invalid.");
  }
  const match = /^https:\/\/([^/?#]+)([^#]*)$/u.exec(value);
  if (!match || match[1].includes("@") || match[1].includes(":")) {
    throw new Error("Official URL must use HTTPS without credentials or a port.");
  }
  let url;
  try { url = new URL(value); } catch { throw new Error("Official URL is invalid."); }
  const hostname = canonicalOfficialHostname(url.hostname, { allowedSuffixes });
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
    || (!allowSearch && url.search) || url.hostname !== hostname || url.href !== value) {
    throw new Error("Official URL must be canonical HTTPS without credentials, ports, or fragments.");
  }
  return url;
}

export function canonicalOfficialUrl(value, options) {
  return parseOfficialUrl(value, options);
}
