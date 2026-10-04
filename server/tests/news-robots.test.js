import { describe, expect, test, vi } from "vitest";

import { createRobotsPolicy, isPathAllowed, parseRobots } from "../src/news/robots.js";

const source = { id: "uni-a", url: "https://www.example-university.edu/news/sitemap.xml" };

describe("robots.txt rules", () => {
  test("the general group applies when no group names this monitor", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /private/\n");
    expect(isPathAllowed(groups, "/news/today")).toBe(true);
    expect(isPathAllowed(groups, "/private/records")).toBe(false);
  });

  test("a group naming GlobeReadySourceMonitor takes precedence over the general group", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /\n\nUser-agent: GlobeReadySourceMonitor\nDisallow:\n");
    expect(isPathAllowed(groups, "/news/today")).toBe(true);
  });

  test("the longest matching rule wins, and allow wins a tie", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /news/\nAllow: /news/public/\nDisallow: /tie\nAllow: /tie\n");
    expect(isPathAllowed(groups, "/news/public/a")).toBe(true);
    expect(isPathAllowed(groups, "/news/other")).toBe(false);
    expect(isPathAllowed(groups, "/tie")).toBe(true);
  });

  test("wildcards and end anchors are honoured", () => {
    const groups = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*q=\n");
    expect(isPathAllowed(groups, "/files/report.pdf")).toBe(false);
    expect(isPathAllowed(groups, "/files/report.pdf?v=2")).toBe(true);
    expect(isPathAllowed(groups, "/search?q=x")).toBe(false);
  });

  test("comments, blank lines, and unknown fields are ignored", () => {
    const groups = parseRobots("# comment\n\nSitemap: https://x.example/sitemap.xml\nUser-agent: *  # all bots\nDisallow: /skip # inline\n");
    expect(isPathAllowed(groups, "/skip/page")).toBe(false);
    expect(isPathAllowed(groups, "/open")).toBe(true);
  });

  test("with no applicable group, everything is allowed", () => {
    expect(isPathAllowed(parseRobots("User-agent: OtherBot\nDisallow: /\n"), "/anything")).toBe(true);
  });
});

describe("robots policy for a source", () => {
  test("a missing robots.txt (404) allows the source", async () => {
    const fetchSource = vi.fn(async () => { throw new Error("Source returned HTTP status 404."); });
    const policy = createRobotsPolicy({ fetchSource });
    expect(await policy.isAllowed(source)).toBe(true);
  });

  test("a disallowed path refuses the source", async () => {
    const fetchSource = vi.fn(async () => ({ text: "User-agent: *\nDisallow: /news/\n" }));
    const policy = createRobotsPolicy({ fetchSource });
    expect(await policy.isAllowed(source)).toBe(false);
  });

  test("an allowed path is accepted and robots.txt is requested from the source's own host only", async () => {
    const fetchSource = vi.fn(async () => ({ text: "User-agent: *\nDisallow: /private/\n" }));
    const policy = createRobotsPolicy({ fetchSource });
    expect(await policy.isAllowed(source)).toBe(true);
    expect(fetchSource).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.example-university.edu/robots.txt",
      allowedHosts: ["www.example-university.edu"],
      acceptedContentTypes: ["text/plain"],
    }));
  });

  test("a server error, timeout, or unreadable robots file refuses the source (fail closed)", async () => {
    for (const message of ["Source returned HTTP status 500.", "The operation was aborted due to timeout", "Source response content type is not allowed: text/html"]) {
      const fetchSource = vi.fn(async () => { throw new Error(message); });
      expect(await createRobotsPolicy({ fetchSource }).isAllowed(source)).toBe(false);
    }
  });

  test("a policy decision is cached per origin for an hour", async () => {
    let now = 0;
    const fetchSource = vi.fn(async () => ({ text: "User-agent: *\nDisallow:\n" }));
    const policy = createRobotsPolicy({ fetchSource, clock: () => now });
    await policy.isAllowed(source);
    await policy.isAllowed({ id: "uni-b", url: "https://www.example-university.edu/other" });
    expect(fetchSource).toHaveBeenCalledTimes(1);
    now = 2 * 60 * 60_000;
    await policy.isAllowed(source);
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  test("a failed read is retried after a short interval, not cached for an hour", async () => {
    let now = 0;
    const fetchSource = vi.fn(async () => { throw new Error("Source returned HTTP status 503."); });
    const policy = createRobotsPolicy({ fetchSource, clock: () => now });
    expect(await policy.isAllowed(source)).toBe(false);
    now = 16 * 60_000;
    expect(await policy.isAllowed(source)).toBe(false);
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  test("the policy requires a fetch function", () => {
    expect(() => createRobotsPolicy({})).toThrow(/fetch function/);
  });
});
