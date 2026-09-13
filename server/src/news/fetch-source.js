import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import { resolveAllowedSourceUrl } from "./url-policy.js";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "GlobeReadySourceMonitor/1.0 (+https://globe-ready.web.app/)";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const mimePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
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
    throw new Error("Source must configure at least one accepted MIME content type.");
  }

  return configured.map((value) => {
    if (typeof value !== "string") {
      throw new Error("Source MIME content type entries must be strings.");
    }
    const contentType = value.split(";", 1)[0].trim().toLowerCase();
    if (!mimePattern.test(contentType)) {
      throw new Error(`Source MIME content type entry is invalid: ${value || "empty"}`);
    }
    return contentType;
  });
}

function abortReason(signal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Source fetch aborted.", "AbortError");
}

function withinDeadline(operation, signal) {
  if (signal.aborted) return Promise.reject(abortReason(signal));

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(operation).then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function nodeHeaders(headers) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers || {})) {
    if (Array.isArray(value)) {
      for (const entry of value) result.append(name, entry);
    } else if (value !== undefined) {
      result.append(name, value);
    }
  }
  return result;
}

function createPinnedLookup(addresses) {
  const selected = addresses[0];
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) {
      callback(null, addresses.map(({ address, family }) => ({ address, family })));
      return;
    }
    callback(null, selected.address, selected.family);
  };
}

function requestPinned(url, { addresses, headers, requestImpl, signal }) {
  return new Promise((resolve, reject) => {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const options = {
      headers: { ...headers, Host: url.host },
      lookup: createPinnedLookup(addresses),
      method: "GET",
      servername: isIP(hostname) ? undefined : hostname,
      signal,
    };

    let request;
    try {
      request = requestImpl(url, options, (incoming) => {
        const status = incoming.statusCode || 0;
        const noResponseBody = status === 204 || status === 205 || status === 304;
        if (noResponseBody) incoming.resume();
        resolve({
          body: noResponseBody ? null : Readable.toWeb(incoming),
          headers: nodeHeaders(incoming.headers),
          status,
        });
      });
    } catch (error) {
      reject(error);
      return;
    }
    request.once("error", reject);
    request.end();
  });
}

async function cancelResponseBody(response, signal) {
  if (!response?.body || typeof response.body.cancel !== "function") return;
  try {
    await withinDeadline(response.body.cancel(), signal);
  } catch {
    // Preserve the policy/status error that caused cancellation.
  }
}

async function readBoundedText(response, signal) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedBytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await withinDeadline(reader.read(), signal);
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_BYTES) {
        throw new Error("Source response is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Keep the read, limit, or timeout error.
    }
    throw error;
  }

  return text + decoder.decode();
}

export async function fetchSource(source, {
  fetchImpl,
  requestImpl = httpsRequest,
  resolveHost,
} = {}) {
  if (fetchImpl !== undefined && typeof fetchImpl !== "function") {
    throw new Error("Source fetch implementation must be a function.");
  }
  if (typeof requestImpl !== "function") {
    throw new Error("Source HTTPS request implementation must be a function.");
  }

  const allowedContentTypes = acceptedContentTypes(source || {});
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const headers = { "User-Agent": USER_AGENT };
  if (source?.etag) headers["If-None-Match"] = source.etag;
  if (source?.lastModified) headers["If-Modified-Since"] = source.lastModified;

  let currentUrl = source?.url;
  let redirects = 0;
  let originalOrigin;

  while (true) {
    const resolved = await withinDeadline(
      resolveAllowedSourceUrl(currentUrl, source, { resolveHost }),
      signal,
    );
    const allowedUrl = resolved.url;
    if (!originalOrigin) originalOrigin = allowedUrl.origin;
    currentUrl = allowedUrl.href;

    const response = fetchImpl
      ? await withinDeadline(fetchImpl(currentUrl, {
        headers,
        redirect: "manual",
        signal,
      }), signal)
      : await withinDeadline(requestPinned(allowedUrl, {
        addresses: resolved.addresses,
        headers,
        requestImpl,
        signal,
      }), signal);

    if (redirectStatuses.has(response.status)) {
      await cancelResponseBody(response, signal);
      if (redirects >= MAX_REDIRECTS) {
        throw new Error(`Source exceeded the ${MAX_REDIRECTS}-redirect limit.`);
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("Source redirect response is missing a Location header.");
      }
      const redirectUrl = new URL(location, currentUrl);
      if (redirectUrl.origin !== originalOrigin) {
        throw new Error("Source returned a cross-domain redirect.");
      }
      currentUrl = redirectUrl.href;
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
    if (result.notModified) {
      await cancelResponseBody(response, signal);
      return result;
    }
    if (response.status < 200 || response.status > 299) {
      await cancelResponseBody(response, signal);
      throw new Error(`Source returned HTTP status ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      await cancelResponseBody(response, signal);
      throw new Error("Source response is too large.");
    }
    if (!allowedContentTypes.includes(contentType)) {
      await cancelResponseBody(response, signal);
      throw new Error(`Source response content type is not allowed: ${contentType || "missing"}`);
    }

    result.text = await readBoundedText(response, signal);
    return result;
  }
}
