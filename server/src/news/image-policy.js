const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

function canonicalAllowlistedUrl(value, allowedHosts) {
  if (typeof value !== "string" || !value || value.length > 2_000 || value !== value.trim()
    || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
    || url.href !== value || !allowedHosts.has(url.hostname)) return null;
  return url.href;
}

export function validateNewsImage(candidate, source = {}) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const allowedKeys = new Set(["url", "alt", "sourceUrl", "attribution", "contentType"]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return null;
  const allowedHosts = new Set(Array.isArray(source.allowedHosts) ? source.allowedHosts : []);
  const url = canonicalAllowlistedUrl(candidate.url, allowedHosts);
  const alt = typeof candidate.alt === "string" ? candidate.alt.trim() : "";
  if (!url || !alt || alt.length > 300) return null;
  if (candidate.contentType !== undefined && !imageTypes.has(candidate.contentType)) return null;
  const sourceUrl = candidate.sourceUrl === undefined
    ? null
    : canonicalAllowlistedUrl(candidate.sourceUrl, allowedHosts);
  if (candidate.sourceUrl !== undefined && !sourceUrl) return null;
  const attribution = typeof candidate.attribution === "string" ? candidate.attribution.trim() : "";
  if (attribution.length > 300) return null;
  return {
    url,
    alt,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(attribution ? { attribution } : {}),
  };
}
