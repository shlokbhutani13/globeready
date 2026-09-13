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
});
