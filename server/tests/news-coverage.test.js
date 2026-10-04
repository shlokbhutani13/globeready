import { describe, expect, test } from "vitest";

import { mergedSources, universityCoverage } from "../src/news/coverage.js";

describe("universityCoverage", () => {
  test("reports no-verified-source when nothing is registered for the university", () => {
    expect(universityCoverage([], "unc-chapel-hill")).toEqual({ state: "no-verified-source", sources: [] });
  });

  test("reports verification-pending when every matching source is unverified", () => {
    const sources = [{ id: "s1", universityId: "unc-chapel-hill", publisher: "UNC", verified: false, enabled: false }];
    expect(universityCoverage(sources, "unc-chapel-hill").state).toBe("verification-pending");
  });

  test("reports covered when every matching source is verified and enabled", () => {
    const sources = [{ id: "s1", universityId: "unc-chapel-hill", publisher: "UNC", verified: true, enabled: true }];
    expect(universityCoverage(sources, "unc-chapel-hill").state).toBe("covered");
  });

  test("reports partial when some but not all matching sources are verified and enabled", () => {
    const sources = [
      { id: "s1", universityId: "unc-chapel-hill", publisher: "UNC Registrar", verified: true, enabled: true },
      { id: "s2", universityId: "unc-chapel-hill", publisher: "UNC ISSS", verified: false, enabled: false },
    ];
    expect(universityCoverage(sources, "unc-chapel-hill").state).toBe("partial");
  });

  test("never leaks operational fields like url, allowedHosts, or adapter", () => {
    const sources = [{
      id: "s1",
      universityId: "unc-chapel-hill",
      publisher: "UNC",
      verified: true,
      enabled: true,
      url: "https://unc.edu/secret-sitemap.xml",
      allowedHosts: ["unc.edu"],
      adapter: "university-sitemap",
    }];
    const result = universityCoverage(sources, "unc-chapel-hill");
    expect(result.sources[0]).toEqual({ publisher: "UNC", verified: true, enabled: true });
  });

  test("ignores sources belonging to a different university", () => {
    const sources = [{ id: "s1", universityId: "other-school", publisher: "Other", verified: true, enabled: true }];
    expect(universityCoverage(sources, "unc-chapel-hill").state).toBe("no-verified-source");
  });
});

describe("mergedSources", () => {
  test("preserves the registered trust fields while honoring stored runtime overrides", () => {
    const registered = [{ id: "federal-register", publisher: "Federal Register", verified: true, enabled: true }];
    const stored = [{ id: "federal-register", enabled: false }];
    const merged = mergedSources(registered, stored);
    expect(merged).toEqual([{ id: "federal-register", publisher: "Federal Register", verified: true, enabled: false }]);
  });

  test("includes admin-added sources that are not in the registered list", () => {
    const stored = [{ id: "custom-u", universityId: "custom-u", publisher: "Custom U", verified: true, enabled: true }];
    const merged = mergedSources([], stored);
    expect(merged).toEqual(stored);
  });
});
