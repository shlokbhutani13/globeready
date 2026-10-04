#!/usr/bin/env node
// Post-deployment smoke checks. Read-only by default. Nothing here runs during development: it is for a
// deployed, explicitly named target, and it refuses to run without the environment that says so.
//
// Required:  SMOKE_BASE_URL          https origin of the API under test
//            SMOKE_TARGET            "disposable-staging" or "production-verification"
//            SMOKE_ALLOWED_HOST      the exact hostname of SMOKE_BASE_URL (a second confirmation)
// Optional:  SMOKE_STUDENT_TOKEN     ID token for a synthetic student (never printed)
//            SMOKE_ORIGIN            an origin the client is served from (CORS check)
// Destructive steps run only with SMOKE_ALLOW_DESTRUCTIVE=true AND SMOKE_DISPOSABLE_UID set to the uid of a
// disposable synthetic account. Account deletion is never run against any other account.

const targets = new Set(["disposable-staging", "production-verification"]);

export class SmokeRefusal extends Error {}

export function planSmoke(env) {
  const base = env.SMOKE_BASE_URL || "";
  let url;
  try { url = new URL(base); } catch { throw new SmokeRefusal("SMOKE_BASE_URL must be an absolute URL."); }
  if (url.protocol !== "https:") throw new SmokeRefusal("SMOKE_BASE_URL must use https.");
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new SmokeRefusal("SMOKE_BASE_URL must be an origin only.");
  }
  if (!targets.has(env.SMOKE_TARGET)) {
    throw new SmokeRefusal("SMOKE_TARGET must name the deployment under test: disposable-staging or production-verification.");
  }
  if (env.SMOKE_ALLOWED_HOST !== url.hostname) {
    throw new SmokeRefusal("SMOKE_ALLOWED_HOST must exactly match the hostname in SMOKE_BASE_URL.");
  }
  const destructive = env.SMOKE_ALLOW_DESTRUCTIVE === "true";
  if (env.SMOKE_ALLOW_DESTRUCTIVE && !destructive && env.SMOKE_ALLOW_DESTRUCTIVE !== "false") {
    throw new SmokeRefusal("SMOKE_ALLOW_DESTRUCTIVE must be exactly 'true' or 'false' when set.");
  }
  if (destructive && !env.SMOKE_DISPOSABLE_UID) {
    throw new SmokeRefusal("Destructive checks require SMOKE_DISPOSABLE_UID naming a disposable synthetic account.");
  }
  return {
    origin: url.origin,
    target: env.SMOKE_TARGET,
    studentToken: env.SMOKE_STUDENT_TOKEN || null,
    clientOrigin: env.SMOKE_ORIGIN || null,
    destructive,
    disposableUid: destructive ? env.SMOKE_DISPOSABLE_UID : null,
  };
}

// Each check returns { name, ok, detail }. Details never include tokens, bodies, or personal data.
export async function runSmoke(plan, { fetchImpl = fetch } = {}) {
  const results = [];
  const call = async (path, options = {}) => {
    const response = await fetchImpl(`${plan.origin}${path}`, { redirect: "manual", ...options });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return { status: response.status, headers: response.headers, body };
  };
  const check = async (name, fn) => {
    try {
      const result = await fn();
      results.push({ name, ok: result.ok, detail: result.detail || "" });
    } catch (error) {
      results.push({ name, ok: false, detail: `error: ${error?.name || "Error"}` });
    }
  };
  const bearer = plan.studentToken ? { Authorization: `Bearer ${plan.studentToken}` } : null;

  await check("liveness responds", async () => {
    const r = await call("/api/health/live");
    return { ok: r.status === 200 && r.body?.status === "ok", detail: `status ${r.status}` };
  });
  await check("readiness responds", async () => {
    const r = await call("/api/health/ready");
    return { ok: r.status === 200, detail: `status ${r.status}` };
  });
  await check("production mode is reported with auth configured", async () => {
    const r = await call("/api/health");
    return { ok: r.body?.mode === "production" && r.body?.services?.auth === true, detail: `mode ${r.body?.mode}` };
  });
  await check("unauthenticated profile access is refused", async () => {
    const r = await call("/api/profile");
    return { ok: r.status === 401, detail: `status ${r.status}` };
  });
  await check("a forged demo identity is refused", async () => {
    const r = await call("/api/tasks", { headers: { "x-demo-user": "forged-student" } });
    return { ok: r.status === 401, detail: `status ${r.status}` };
  });
  await check("a foreign origin receives no CORS grant", async () => {
    const r = await call("/api/health/live", { headers: { Origin: "https://attacker.test" } });
    return { ok: !r.headers.get("access-control-allow-origin"), detail: "no ACAO header" };
  });
  if (plan.clientOrigin) {
    await check("the configured client origin is allowed", async () => {
      const r = await call("/api/health/live", { headers: { Origin: plan.clientOrigin } });
      return { ok: r.headers.get("access-control-allow-origin") === plan.clientOrigin, detail: "ACAO matches" };
    });
  }
  await check("security headers are present", async () => {
    const r = await call("/api/health/live");
    return {
      ok: r.headers.get("x-content-type-options") === "nosniff" && Boolean(r.headers.get("content-security-policy")),
      detail: "nosniff and CSP",
    };
  });
  await check("news feed responds with a freshness summary", async () => {
    const r = await call("/api/news", bearer ? { headers: bearer } : {});
    return { ok: bearer ? r.status === 200 && Boolean(r.body?.data?.sourceHealth) : r.status === 401, detail: `status ${r.status}` };
  });
  if (bearer) {
    for (const path of ["/api/profile", "/api/tasks", "/api/documents", "/api/resources", "/api/account/export"]) {
      await check(`authenticated ${path} responds`, async () => {
        const r = await call(path, { headers: bearer });
        return { ok: r.status === 200, detail: `status ${r.status}` };
      });
    }
    await check("a student cannot reach the admin review queue", async () => {
      const r = await call("/api/admin/news/review", { headers: bearer });
      return { ok: r.status === 403, detail: `status ${r.status}` };
    });
  }
  await check("the scheduler endpoint refuses requests without its secret", async () => {
    const r = await call("/api/internal/news/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceIds: [], dryRun: true }),
    });
    return { ok: r.status === 401 || r.status === 503, detail: `status ${r.status}` };
  });

  if (plan.destructive && bearer) {
    await check("disposable account: create and delete a task", async () => {
      const created = await call("/api/tasks", {
        method: "POST",
        headers: { ...bearer, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Smoke test task", dueDate: "2099-01-01" }),
      });
      if (created.status !== 201) return { ok: false, detail: `create status ${created.status}` };
      const removed = await call(`/api/tasks/${created.body.data.id}`, { method: "DELETE", headers: bearer });
      return { ok: removed.status === 204, detail: `delete status ${removed.status}` };
    });
  }
  return results;
}

async function main() {
  let plan;
  try {
    plan = planSmoke(process.env);
  } catch (error) {
    console.error(`smoke refused: ${error.message}`);
    process.exit(2);
  }
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ plan: { ...plan, studentToken: plan.studentToken ? "provided" : null } }, null, 2));
    return;
  }
  const results = await runSmoke(plan);
  for (const result of results) console.log(JSON.stringify(result));
  const failed = results.filter((result) => !result.ok);
  console.log(JSON.stringify({ summary: { total: results.length, failed: failed.length, target: plan.target } }));
  process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
