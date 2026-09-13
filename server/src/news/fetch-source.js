import { assertAllowedSourceUrl } from "./url-policy.js";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "GlobeReadySourceMonitor/1.0 (+https://globe-ready.web.app/)";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const defaultContentTypes = [
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/pdf",
  "application/rss+xml",
  "application/xhtml+xml",
  "application/xml",
  "text/html",
  "text/plain",
  "text/xml",
];

function responseContentType(response) {
  return (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function acceptedContentTypes(source) {
  const configured = source.acceptedContentTypes
    ?? source.acceptedMimeTypes
    ?? source.contentTypes
    ?? defaultContentTypes;
  if (!Array.isArray(configured) || configured.length === 0) {
    throw new Error("Source must configure at least one accepted content type.");
  }
  return configured.map((value) => String(value).split(";", 1)[0].trim().toLowerCase());
}

function contentTypeMatches(contentType, accepted) {
  return accepted.some((expected) => (
    expected === contentType
    || (expected.endsWith("/*") && contentType.startsWith(expected.slice(0, -1)))
  ));
}

async function readBoundedText(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
    throw new Error("Source response is too large.");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_BYTES) {
      await reader.cancel("Source response is too large.");
      throw new Error("Source response is too large.");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function fetchSource(source, { fetchImpl = fetch, resolveHost } = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Source fetch implementation is required.");
  }

  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const headers = { "User-Agent": USER_AGENT };
  if (source?.etag) headers["If-None-Match"] = source.etag;
  if (source?.lastModified) headers["If-Modified-Since"] = source.lastModified;

  let currentUrl = source?.url;
  let redirects = 0;

  while (true) {
    const allowedUrl = await assertAllowedSourceUrl(currentUrl, source, { resolveHost });
    currentUrl = allowedUrl.href;

    const response = await fetchImpl(currentUrl, {
      headers,
      redirect: "manual",
      signal,
    });

    if (redirectStatuses.has(response.status)) {
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Source exceeded the ${MAX_REDIRECTS}-redirect limit.`);
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Source redirect response is missing a Location header.");
      }
      currentUrl = new URL(location, currentUrl).href;
      redirects += 1;
      continue;
    }

    const contentType = responseContentType(response);
    const result = {
      status: response.status,
      finalUrl: currentUrl,
      contentType,
      text: "",
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      notModified: response.status === 304,
    };
    if (result.notModified) return result;

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      throw new Error("Source response is too large.");
    }
    if (!contentTypeMatches(contentType, acceptedContentTypes(source))) {
      throw new Error(`Source response content type is not allowed: ${contentType || "missing"}`);
    }

    result.text = await readBoundedText(response);
    return result;
  }
}
