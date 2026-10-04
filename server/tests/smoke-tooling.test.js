import { describe, expect, test, vi } from "vitest";

import { planSmoke, runSmoke, SmokeRefusal } from "../../scripts/smoke/production-smoke.mjs";

const base = {
  SMOKE_BASE_URL: "https://api.globeready-prod.test",
  SMOKE_TARGET: "production-verification",
  SMOKE_ALLOWED_HOST: "api.globeready-prod.test",
};

describe("smoke tooling refuses to run without an explicit target", () => {
  test("no environment means no run", () => {
    expect(() => planSmoke({})).toThrow(SmokeRefusal);
  });

  test("the target must be plain https and an origin only", () => {
    expect(() => planSmoke({ ...base, SMOKE_BASE_URL: "http://api.globeready-prod.test" })).toThrow(/https/);
    expect(() => planSmoke({ ...base, SMOKE_BASE_URL: "https://api.globeready-prod.test/v1" })).toThrow(/origin only/);
    expect(() => planSmoke({ ...base, SMOKE_BASE_URL: "not a url" })).toThrow(/absolute URL/);
  });

  test("a named deployment kind is required", () => {
    expect(() => planSmoke({ ...base, SMOKE_TARGET: "production" })).toThrow(/SMOKE_TARGET/);
    expect(() => planSmoke({ ...base, SMOKE_TARGET: undefined })).toThrow(/SMOKE_TARGET/);
  });

  test("the allowed host must match the target exactly", () => {
    expect(() => planSmoke({ ...base, SMOKE_ALLOWED_HOST: "api.other.test" })).toThrow(/exactly match/);
    expect(() => planSmoke({ ...base, SMOKE_ALLOWED_HOST: "api.globeready-prod.test.evil" })).toThrow(/exactly match/);
  });

  test("destructive checks need an explicit flag and a disposable account", () => {
    expect(() => planSmoke({ ...base, SMOKE_ALLOW_DESTRUCTIVE: "true" })).toThrow(/SMOKE_DISPOSABLE_UID/);
    expect(() => planSmoke({ ...base, SMOKE_ALLOW_DESTRUCTIVE: "yes" })).toThrow(/exactly 'true' or 'false'/);
    expect(planSmoke({ ...base, SMOKE_ALLOW_DESTRUCTIVE: "false" }).destructive).toBe(false);
    expect(planSmoke({ ...base, SMOKE_ALLOW_DESTRUCTIVE: "true", SMOKE_DISPOSABLE_UID: "synthetic-1" }))
      .toMatchObject({ destructive: true, disposableUid: "synthetic-1" });
  });

  test("a valid, read-only plan keeps destructive checks off", () => {
    expect(planSmoke(base)).toMatchObject({ origin: "https://api.globeready-prod.test", destructive: false, disposableUid: null });
  });
});

// Authenticated responses are keyed as "auth:<path>" so an anonymous probe and a signed-in check never share a route.
function fakeFetch(routes) {
  return vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    const authed = Boolean(options.headers?.Authorization);
    const method = options.method || "GET";
    const route = routes[`${method} ${path}`] || routes[authed ? `auth:${path}` : path]
      || { status: 404, body: { error: { code: "not_found" } } };
    const headers = new Headers(route.headers || {});
    return new Response(route.body === undefined ? null : JSON.stringify(route.body), { status: route.status, headers });
  });
}

const healthy = {
  "/api/news": { status: 401, body: { error: { code: "authentication_required" } } },
  "/api/health/live": { status: 200, body: { status: "ok" }, headers: { "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } },
  "/api/health/ready": { status: 200, body: { status: "ready" } },
  "/api/health": { status: 200, body: { ok: true, mode: "production", services: { auth: true } } },
  "/api/profile": { status: 401, body: { error: { code: "authentication_required" } } },
  "/api/tasks": { status: 401, body: { error: { code: "demo_identity_required" } } },
  "/api/internal/news/sync": { status: 401, body: { error: { code: "invalid_scheduler_secret" } } },
};

describe("read-only smoke checks", () => {
  test("a healthy anonymous deployment passes the public and refusal checks", async () => {
    const results = await runSmoke(planSmoke(base), { fetchImpl: fakeFetch(healthy) });
    expect(results.filter((result) => !result.ok)).toEqual([]);
    expect(results.map((result) => result.name)).toContain("a forged demo identity is refused");
  });

  test("a foreign origin that receives a CORS grant fails the check", async () => {
    const routes = {
      ...healthy,
      "/api/health/live": { ...healthy["/api/health/live"], headers: { "access-control-allow-origin": "https://attacker.test" } },
    };
    const results = await runSmoke(planSmoke(base), { fetchImpl: fakeFetch(routes) });
    expect(results.find((result) => result.name === "a foreign origin receives no CORS grant").ok).toBe(false);
  });

  test("a mode other than production fails the check", async () => {
    const routes = { ...healthy, "/api/health": { status: 200, body: { mode: "local-user", services: { auth: true } } } };
    const results = await runSmoke(planSmoke(base), { fetchImpl: fakeFetch(routes) });
    expect(results.find((result) => result.name === "production mode is reported with auth configured").ok).toBe(false);
  });

  test("the scheduler accepts only refusals without the secret", async () => {
    const routes = { ...healthy, "/api/internal/news/sync": { status: 200, body: { data: {} } } };
    const results = await runSmoke(planSmoke(base), { fetchImpl: fakeFetch(routes) });
    expect(results.find((result) => result.name === "the scheduler endpoint refuses requests without its secret").ok).toBe(false);
  });
});

describe("authenticated checks never leak the token and stay out of destructive paths by default", () => {
  test("a student token is sent as a bearer header and never appears in results", async () => {
    const fetchImpl = fakeFetch({
      ...healthy,
      "auth:/api/news": { status: 200, body: { data: { items: [], sourceHealth: { state: "not-checked" } } } },
      "auth:/api/profile": { status: 200, body: { data: {} } },
      "auth:/api/tasks": { status: 200, body: { data: [] } },
      "auth:/api/documents": { status: 200, body: { data: [] } },
      "auth:/api/resources": { status: 200, body: { data: [] } },
      "auth:/api/account/export": { status: 200, body: { data: {} } },
      "auth:/api/admin/news/review": { status: 403, body: { error: { code: "admin_required" } } },
    });
    const plan = planSmoke({ ...base, SMOKE_STUDENT_TOKEN: "TOKEN-VALUE-MUST-NOT-LEAK" });
    const results = await runSmoke(plan, { fetchImpl });
    expect(JSON.stringify(results)).not.toContain("TOKEN-VALUE-MUST-NOT-LEAK");
    expect(fetchImpl.mock.calls.some(([, options]) => options?.headers?.Authorization === "Bearer TOKEN-VALUE-MUST-NOT-LEAK")).toBe(true);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(fetchImpl.mock.calls.some(([url, options]) => (options?.method === "DELETE") || String(url).includes("account/delete"))).toBe(false);
  });

  test("the task create and delete check runs only when destructive checks are enabled for a disposable account", async () => {
    const fetchImpl = fakeFetch({
      ...healthy,
      "POST /api/tasks": { status: 201, body: { data: { id: "task-1" } } },
      "DELETE /api/tasks/task-1": { status: 204 },
    });
    const withoutFlag = await runSmoke(planSmoke({ ...base, SMOKE_STUDENT_TOKEN: "t" }), { fetchImpl });
    expect(withoutFlag.some((result) => result.name.startsWith("disposable account"))).toBe(false);

    const withFlag = await runSmoke(planSmoke({
      ...base, SMOKE_STUDENT_TOKEN: "t", SMOKE_ALLOW_DESTRUCTIVE: "true", SMOKE_DISPOSABLE_UID: "synthetic-1",
    }), { fetchImpl: fakeFetch({
      ...healthy,
      "POST /api/tasks": { status: 201, body: { data: { id: "task-1" } } },
      "DELETE /api/tasks/task-1": { status: 204 },
    }) });
    expect(withFlag.find((result) => result.name.startsWith("disposable account")).ok).toBe(true);
  });
});
