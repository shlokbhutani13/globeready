import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { describe, expect, test, vi } from "vitest";

import { fetchSource } from "../src/news/fetch-source.js";

const publicDns = async () => [{ address: "23.1.1.1", family: 4 }];

function htmlSource(overrides = {}) {
  return {
    url: "https://www.uscis.gov/newsroom/all-news",
    allowedHosts: ["www.uscis.gov"],
    acceptedContentTypes: ["text/html"],
    ...overrides,
  };
}

function trackedResponse({ status = 200, headers = {}, text = "body" } = {}) {
  const cancel = vi.fn(async () => {});
  let read = false;
  return {
    response: {
      status,
      headers: new Headers(headers),
      body: {
        cancel,
        getReader: () => ({
          cancel,
          read: async () => {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: new TextEncoder().encode(text) };
          },
        }),
      },
    },
    wasCancelled: () => cancel.mock.calls.length > 0,
  };
}

describe("official source fetching", () => {
  test("uses conditional headers and handles 304", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    const result = await fetchSource({
      url: "https://www.uscis.gov/newsroom/all-news",
      allowedHosts: ["www.uscis.gov"],
      etag: '"abc"',
      lastModified: "Mon, 01 Sep 2026 00:00:00 GMT",
    }, { fetchImpl, resolveHost: publicDns });

    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      "If-None-Match": '"abc"',
      "If-Modified-Since": "Mon, 01 Sep 2026 00:00:00 GMT",
      "User-Agent": "GlobeReadySourceMonitor/1.0 (+https://globe-ready.web.app/)",
    });
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
    expect(result).toEqual({
      status: 304,
      finalUrl: "https://www.uscis.gov/newsroom/all-news",
      contentType: "",
      text: "",
      etag: null,
      lastModified: null,
      notModified: true,
    });
  });

  test("rejects responses above five megabytes from content length", async () => {
    const headers = new Headers({
      "content-type": "text/html",
      "content-length": String(5 * 1024 * 1024 + 1),
    });

    await expect(fetchSource({
      url: "https://www.uscis.gov/news",
      allowedHosts: ["www.uscis.gov"],
    }, {
      fetchImpl: async () => new Response("x", { status: 200, headers }),
      resolveHost: publicDns,
    })).rejects.toThrow(/large/i);
  });

  test("stops a streamed response that exceeds five megabytes", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let reads = 0;
    const body = new ReadableStream({
      pull(controller) {
        reads += 1;
        controller.enqueue(chunk);
        if (reads === 6) controller.close();
      },
    });

    await expect(fetchSource(htmlSource(), {
      fetchImpl: async () => new Response(body, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      resolveHost: publicDns,
    })).rejects.toThrow(/large/i);
  });

  test("returns bounded response metadata and decoded text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("Official update", {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        etag: '"next"',
        "last-modified": "Tue, 02 Sep 2026 00:00:00 GMT",
      },
    }));

    await expect(fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns })).resolves.toEqual({
      status: 200,
      finalUrl: "https://www.uscis.gov/newsroom/all-news",
      contentType: "text/html",
      text: "Official update",
      etag: '"next"',
      lastModified: "Tue, 02 Sep 2026 00:00:00 GMT",
      notModified: false,
    });
  });

  test("rejects response content types outside the source allowlist", async () => {
    await expect(fetchSource(htmlSource(), {
      fetchImpl: async () => new Response("binary", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
      resolveHost: publicDns,
    })).rejects.toThrow(/content type/i);
  });

  test("revalidates DNS for every redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/next" } }))
      .mockResolvedValueOnce(new Response("must not be reached", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    const resolveHost = vi.fn()
      .mockResolvedValueOnce([{ address: "23.1.1.1", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    await expect(fetchSource(htmlSource(), { fetchImpl, resolveHost })).rejects.toThrow(/public/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("follows up to three validated redirects and returns the final URL", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/one" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/two" } }))
      .mockResolvedValueOnce(new Response(null, { status: 307, headers: { location: "/three" } }))
      .mockResolvedValueOnce(new Response("final", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));

    const result = await fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns });

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(result.finalUrl).toBe("https://www.uscis.gov/three");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://www.uscis.gov/newsroom/all-news",
      "https://www.uscis.gov/one",
      "https://www.uscis.gov/two",
      "https://www.uscis.gov/three",
    ]);
  });

  test("rejects a fourth redirect", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, { status: 308, headers: { location: "/again" } }),
    );

    await expect(fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns }))
      .rejects.toThrow(/redirect/i);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  test("rejects redirects without a location", async () => {
    await expect(fetchSource(htmlSource(), {
      fetchImpl: async () => new Response(null, { status: 302 }),
      resolveHost: publicDns,
    })).rejects.toThrow(/location/i);
  });

  test("applies one ten-second abort signal to the entire redirect chain", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutSignal);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/next" } }))
      .mockResolvedValueOnce(new Response("done", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));

    try {
      await fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns });
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(fetchImpl.mock.calls[0][1].signal).toBe(timeoutSignal);
      expect(fetchImpl.mock.calls[1][1].signal).toBe(timeoutSignal);
    } finally {
      timeout.mockRestore();
    }
  });

  test("honors an owning synchronization abort signal across the secure boundary", async () => {
    const owner = new AbortController();
    const fetchImpl = vi.fn(async (_url, { signal }) => {
      owner.abort(new Error("lease lost"));
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        if (signal.aborted) reject(signal.reason);
      });
    });

    await expect(fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns, signal: owner.signal }))
      .rejects.toThrow(/lease lost/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("pins the validated address while retaining the original TLS and Host names", async () => {
    const incoming = Readable.from([Buffer.from("Official update")]);
    Object.assign(incoming, {
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "text/html" },
    });
    const request = new EventEmitter();
    request.end = vi.fn();
    const requestImpl = vi.fn((url, options, onResponse) => {
      queueMicrotask(() => onResponse(incoming));
      return request;
    });
    const globalFetch = vi.spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("an unpinned global fetch must not run"));

    try {
      const result = await fetchSource(htmlSource(), {
        requestImpl,
        resolveHost: async () => [{ address: "23.1.1.1", family: 4 }],
      });

      expect(result.text).toBe("Official update");
      expect(globalFetch).not.toHaveBeenCalled();
      expect(requestImpl).toHaveBeenCalledTimes(1);
      const [url, options] = requestImpl.mock.calls[0];
      expect(url.href).toBe("https://www.uscis.gov/newsroom/all-news");
      expect(options.servername).toBe("www.uscis.gov");
      expect(options.headers.Host).toBe("www.uscis.gov");
      await expect(new Promise((resolve, reject) => {
        options.lookup("www.uscis.gov", {}, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      })).resolves.toEqual({ address: "23.1.1.1", family: 4 });
    } finally {
      globalFetch.mockRestore();
    }
  });

  test("rejects cross-domain redirects even when both hosts are allowlisted", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://www.dhs.gov/news" },
      }))
      .mockResolvedValueOnce(new Response("must not be reached", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));

    await expect(fetchSource(htmlSource({
      allowedHosts: ["www.uscis.gov", "www.dhs.gov"],
      etag: '"private-to-origin"',
    }), { fetchImpl, resolveHost: publicDns })).rejects.toThrow(/cross-domain/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("applies the overall deadline while DNS resolution is pending", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let releaseDns;
    const resolveHost = vi.fn(() => new Promise((resolve) => {
      releaseDns = resolve;
    }));
    const fetchImpl = vi.fn(async () => new Response("late", {
      status: 200,
      headers: { "content-type": "text/html" },
    }));

    try {
      const pending = fetchSource(htmlSource(), { fetchImpl, resolveHost });
      await vi.waitFor(() => expect(resolveHost).toHaveBeenCalledTimes(1));
      controller.abort(new DOMException("Source fetch timed out.", "TimeoutError"));
      releaseDns([{ address: "23.1.1.1", family: 4 }]);

      await expect(pending).rejects.toThrow(/timed out|timeout|aborted/i);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  test("applies the overall deadline while reading the response body", async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    let markReadStarted;
    const readStarted = new Promise((resolve) => {
      markReadStarted = resolve;
    });
    let releaseBody;
    let bodyCancelled = false;
    const body = {
      getReader: () => ({
        read: () => {
          markReadStarted();
          return new Promise((resolve) => {
            releaseBody = () => resolve({
              done: false,
              value: new TextEncoder().encode("late"),
            });
          });
        },
        cancel: async () => {
          bodyCancelled = true;
          releaseBody?.();
        },
      }),
    };

    try {
      const pending = fetchSource(htmlSource(), {
        fetchImpl: async () => ({
          body,
          status: 200,
          headers: new Headers({ "content-type": "text/html" }),
        }),
        resolveHost: publicDns,
      });
      await readStarted;
      controller.abort(new DOMException("Source fetch timed out.", "TimeoutError"));
      setTimeout(() => releaseBody?.(), 10);

      await expect(pending).rejects.toThrow(/timed out|timeout|aborted/i);
      expect(bodyCancelled).toBe(true);
    } finally {
      timeout.mockRestore();
    }
  });

  test("rejects non-success HTTP responses before returning content", async () => {
    const tracked = trackedResponse({
      status: 404,
      headers: { "content-type": "text/html" },
    });

    await expect(fetchSource(htmlSource(), {
      fetchImpl: async () => tracked.response,
      resolveHost: publicDns,
    })).rejects.toThrow(/404/);
    expect(tracked.wasCancelled()).toBe(true);
  });

  test("cancels redirect response bodies before following", async () => {
    const tracked = trackedResponse({ status: 302, headers: { location: "/next" } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(tracked.response)
      .mockResolvedValueOnce(new Response("done", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));

    await fetchSource(htmlSource(), { fetchImpl, resolveHost: publicDns });
    expect(tracked.wasCancelled()).toBe(true);
  });

  test.each([
    ["declared oversized body", { "content-type": "text/html", "content-length": String(5 * 1024 * 1024 + 1) }],
    ["disallowed response MIME", { "content-type": "application/octet-stream" }],
  ])("cancels a %s on early rejection", async (_label, headers) => {
    const tracked = trackedResponse({ headers });

    await expect(fetchSource(htmlSource(), {
      fetchImpl: async () => tracked.response,
      resolveHost: publicDns,
    })).rejects.toThrow();
    expect(tracked.wasCancelled()).toBe(true);
  });

  test.each([
    ["an empty entry", ["text/html", ""]],
    ["a non-string entry", ["text/html", null]],
    ["a wildcard entry", ["text/*"]],
  ])("rejects %s in configured MIME types", async (_label, acceptedContentTypes) => {
    const tracked = trackedResponse({ headers: { "content-type": "text/html" } });
    const fetchImpl = vi.fn(async () => tracked.response);

    await expect(fetchSource(htmlSource({ acceptedContentTypes }), {
      fetchImpl,
      resolveHost: publicDns,
    })).rejects.toThrow(/MIME|content type/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
