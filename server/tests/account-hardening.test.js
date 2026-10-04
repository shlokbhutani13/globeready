import request from "supertest";
import { describe, expect, test, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createLogger } from "../src/logger.js";
import { createDemoStore } from "../src/store.js";
import { createUserRateLimiter } from "../src/rate-limit.js";

const now = () => Math.floor(Date.now() / 1000);
const authFor = (revoked = []) => ({
  verifyIdToken: vi.fn(async (token, checkRevoked) => {
    if (revoked.includes(token)) {
      if (checkRevoked) throw Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" });
    }
    if (token === "student-a" || token === "student-b") return { uid: token, auth_time: now() };
    throw new Error("invalid");
  }),
  deleteUser: vi.fn(async () => {}),
});

function lines() {
  const out = [];
  return { out, logger: createLogger({ level: "info", write: (line) => out.push(JSON.parse(line)) }) };
}

describe("token revocation and disabled accounts", () => {
  test("ID tokens are verified with the revocation check enabled", async () => {
    const auth = authFor();
    const app = createApp({ store: createDemoStore(), auth });
    await request(app).get("/api/tasks").set("Authorization", "Bearer student-a").expect(200);
    expect(auth.verifyIdToken).toHaveBeenCalledWith("student-a", true);
  });

  test("a revoked or disabled account's token is rejected even before it expires", async () => {
    const app = createApp({ store: createDemoStore(), auth: authFor(["student-a"]) });
    const response = await request(app).get("/api/tasks").set("Authorization", "Bearer student-a").expect(401);
    expect(response.body.error.code).toBe("invalid_token");
  });
});

describe("account deletion is safe under failure and retry", () => {
  test("deletion refuses to run when document storage is not configured, and changes nothing", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", { title: "Keep me", dueDate: "2026-12-01", completed: false });
    const auth = authFor();
    const app = createApp({ store, auth, account: {} });
    const response = await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(503);
    expect(response.body.error.code).toBe("account_deletion_unavailable");
    expect((await store.tasks.list("student-a"))).toHaveLength(1);
    expect(auth.deleteUser).not.toHaveBeenCalled();
  });

  test("a storage failure stops before Firestore or Auth change, and a retry completes the deletion", async () => {
    const store = createDemoStore();
    await store.tasks.create("student-a", { title: "Retry me", dueDate: "2026-12-01", completed: false });
    const auth = authFor();
    let attempts = 0;
    const app = createApp({
      store,
      auth,
      account: {
        deleteStoragePrefix: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("storage hiccup");
        },
        deleteAuthUser: (uid) => auth.deleteUser(uid),
      },
    });

    await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(500);
    expect(await store.tasks.list("student-a")).toHaveLength(1);
    expect(auth.deleteUser).not.toHaveBeenCalled();

    const retry = await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);
    expect(retry.body.data).toMatchObject({ deleted: true, authIdentity: "deleted" });
    expect(await store.tasks.list("student-a")).toEqual([]);
    expect(auth.deleteUser).toHaveBeenCalledWith("student-a");
  });

  test("an Auth identity that an earlier attempt already removed is treated as success", async () => {
    const store = createDemoStore();
    const missing = Object.assign(new Error("gone"), { code: "auth/user-not-found" });
    const app = createApp({
      store,
      auth: authFor(),
      account: {
        deleteStoragePrefix: async () => {},
        deleteAuthUser: async () => { throw missing; },
      },
    });
    const response = await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);
    expect(response.body.data.authIdentity).toBe("deleted");
  });

  test("any other Auth failure is surfaced, so the operator can see the deletion did not finish", async () => {
    const app = createApp({
      store: createDemoStore(),
      auth: authFor(),
      account: {
        deleteStoragePrefix: async () => {},
        deleteAuthUser: async () => { throw Object.assign(new Error("quota"), { code: "auth/internal-error" }); },
      },
    });
    const response = await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(500);
    expect(response.body.error.message).toBe("The request could not be completed.");
  });

  test("deletion requires the exact confirmation phrase", async () => {
    const app = createApp({ store: createDemoStore(), auth: authFor(), account: { deleteStoragePrefix: async () => {} } });
    await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "delete my account" }).expect(422);
  });

  test("deletion attempts are rate limited", async () => {
    const app = createApp({
      store: createDemoStore(),
      auth: authFor(),
      account: { deleteStoragePrefix: async () => {}, deleteAuthUser: async () => {} },
      accountDeletionLimiter: createUserRateLimiter({ limit: 1, windowMs: 60 * 60_000 }),
    });
    await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);
    await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(429);
  });

  test("exports are rate limited separately from deletion", async () => {
    const app = createApp({
      store: createDemoStore(),
      auth: authFor(),
      accountExportLimiter: createUserRateLimiter({ limit: 1, windowMs: 60 * 60_000 }),
    });
    await request(app).get("/api/account/export").set("Authorization", "Bearer student-a").expect(200);
    await request(app).get("/api/account/export").set("Authorization", "Bearer student-a").expect(429);
  });
});

describe("audit events are recorded separately from request logs", () => {
  test("an export and a deletion each produce an audit event with the actor and no personal content", async () => {
    const { out, logger } = lines();
    const store = createDemoStore();
    await store.tasks.create("student-a", { title: "Private title", dueDate: "2026-12-01", completed: false });
    const app = createApp({
      store,
      auth: authFor(),
      logger,
      auditLogger: logger.child({ channel: "audit" }),
      account: { deleteStoragePrefix: async () => {}, deleteAuthUser: async () => {} },
    });
    await request(app).get("/api/account/export").set("Authorization", "Bearer student-a").expect(200);
    await request(app).delete("/api/account").set("Authorization", "Bearer student-a")
      .send({ confirmation: "DELETE MY ACCOUNT" }).expect(200);

    const audit = out.filter((entry) => entry.event?.startsWith("audit."));
    expect(audit.map((entry) => entry.event)).toEqual(["audit.account_exported", "audit.account_deleted"]);
    expect(audit[1]).toMatchObject({ actorUid: "student-a", authIdentity: "deleted" });
    expect(JSON.stringify(out)).not.toContain("Private title");
  });

  test("a successful admin change is audited without its payload", async () => {
    const { out, logger } = lines();
    const app = createApp({
      store: createDemoStore(),
      auth: { verifyIdToken: async () => ({ uid: "local-admin", admin: true, auth_time: now() }) },
      logger,
      auditLogger: logger.child({ channel: "audit" }),
    });
    await request(app).post("/api/admin/news/sources").set("Authorization", "Bearer local-admin")
      .send({
        id: "audit-test-source",
        publisher: "Audit Test Publisher",
        adapter: "feed",
        url: "https://www.ssa.gov/feed.xml",
        allowedHosts: ["www.ssa.gov"],
        verified: false,
        enabled: false,
      })
      .expect(201);
    const audits = out.filter((entry) => entry.event === "audit.admin_news_mutation");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUid: "local-admin", method: "POST", status: 201 });
    expect(JSON.stringify(audits[0])).not.toContain("Audit Test Publisher");
  });

  test("a rejected admin change is not recorded as an audited mutation", async () => {
    const { out, logger } = lines();
    const app = createApp({
      store: createDemoStore(),
      auth: { verifyIdToken: async () => ({ uid: "local-admin", admin: true, auth_time: now() }) },
      logger,
      auditLogger: logger.child({ channel: "audit" }),
    });
    await request(app).post("/api/admin/news/sources").set("Authorization", "Bearer local-admin")
      .send({ id: "bad source id!" }).expect(422);
    expect(out.filter((entry) => entry.event === "audit.admin_news_mutation")).toHaveLength(0);
  });
});
