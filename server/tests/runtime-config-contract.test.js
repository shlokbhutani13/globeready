import { describe, expect, test } from "vitest";

import { ConfigError, configSummary, loadServerConfig, parseIntegerEnv } from "../src/runtime-config.js";

const productionEnv = {
  FIREBASE_PROJECT_ID: "globeready-prod-7",
  FIREBASE_STORAGE_BUCKET: "globeready-prod-7.firebasestorage.app",
  CLIENT_URL: "https://app.globeready-prod.test",
  RATE_LIMIT_SCOPE: "single-instance",
  NODE_ENV: "production",
};

function issuesFor(env) {
  try {
    loadServerConfig(env, { version: "1.2.3" });
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error.issues;
  }
  return [];
}

describe("production configuration contract", () => {
  test("a complete production environment loads with safe defaults", () => {
    const config = loadServerConfig(productionEnv, { version: "1.2.3" });
    expect(config.mode).toBe("production");
    expect(config.clientOrigins).toEqual(["https://app.globeready-prod.test"]);
    expect(config.trustProxy).toBe(false);
    expect(config.gemini.enabled).toBe(false);
    expect(config.newsSync.enabled).toBe(false);
    expect(config.limits.aiRequestsPerMinute).toBe(12);
    expect(Object.isFrozen(config)).toBe(true);
  });

  test("reports every missing requirement at once, not just the first", () => {
    const issues = issuesFor({ NODE_ENV: "production" });
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringMatching(/FIREBASE_PROJECT_ID is required/),
      expect.stringMatching(/FIREBASE_STORAGE_BUCKET is required/),
      expect.stringMatching(/CLIENT_URL is required/),
      expect.stringMatching(/RATE_LIMIT_SCOPE=single-instance is required/),
    ]));
  });

  test("production requires the document bucket that account deletion depends on", () => {
    const { FIREBASE_STORAGE_BUCKET, ...withoutBucket } = productionEnv;
    expect(issuesFor(withoutBucket).join(" ")).toMatch(/FIREBASE_STORAGE_BUCKET is required/);
  });

  test("dangerous placeholders are refused in production", () => {
    const issues = issuesFor({
      ...productionEnv,
      FIREBASE_PROJECT_ID: "your-project-id",
      CLIENT_URL: "https://example.com",
      GEMINI_API_KEY: "REPLACE_ME_with-real-key-value",
    });
    expect(issues.join(" ")).toMatch(/FIREBASE_PROJECT_ID still contains a placeholder/);
    expect(issues.join(" ")).toMatch(/GEMINI_API_KEY still contains a placeholder/);
  });

  test("production CLIENT_URL must be an https origin with no path, query, or credentials", () => {
    expect(issuesFor({ ...productionEnv, CLIENT_URL: "http://app.globeready-prod.test" }).join(" "))
      .toMatch(/https:\/\/ in production/);
    expect(issuesFor({ ...productionEnv, CLIENT_URL: "https://app.globeready-prod.test/path" }).join(" "))
      .toMatch(/origin only/);
    expect(issuesFor({ ...productionEnv, CLIENT_URL: "https://user:pw@app.globeready-prod.test" }).join(" "))
      .toMatch(/origin only/);
  });

  test("production origins must be https, except loopback for development against real Firebase", () => {
    expect(loadServerConfig({ ...productionEnv, CLIENT_URL: "http://localhost:5173" }).clientOrigins).toEqual(["http://localhost:5173"]);
    expect(issuesFor({ ...productionEnv, NODE_ENV: undefined, CLIENT_URL: "http://app.globeready-prod.test" }).join(" "))
      .toMatch(/https:\/\/ in production/);
  });

  test("a wildcard or unparseable origin is refused", () => {
    expect(issuesFor({ ...productionEnv, CLIENT_URL: "*" }).join(" ")).toMatch(/CLIENT_URL entry is not a valid URL/);
  });

  test("the Firebase project ID and bucket must be well formed", () => {
    expect(issuesFor({ ...productionEnv, FIREBASE_PROJECT_ID: "Bad_Project" }).join(" "))
      .toMatch(/not a valid Firebase project ID/);
    expect(issuesFor({ ...productionEnv, FIREBASE_STORAGE_BUCKET: "gs://bucket" }).join(" "))
      .toMatch(/not a valid bucket name/);
  });

  test("emulator variables are refused in production", () => {
    expect(() => loadServerConfig({ ...productionEnv, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8089" }))
      .toThrow(/Emulator host variables/);
  });

  test("malformed numeric limits fail instead of silently disabling the limiter", () => {
    expect(() => parseIntegerEnv({ AI_REQUESTS_PER_MINUTE: "abc" }, "AI_REQUESTS_PER_MINUTE", { fallback: 12, min: 1, max: 600 }))
      .toThrow(ConfigError);
    expect(() => parseIntegerEnv({ AI_REQUESTS_PER_MINUTE: "-1" }, "AI_REQUESTS_PER_MINUTE", { fallback: 12, min: 1, max: 600 }))
      .toThrow(ConfigError);
    expect(() => parseIntegerEnv({ AI_REQUESTS_PER_MINUTE: "0" }, "AI_REQUESTS_PER_MINUTE", { fallback: 12, min: 1, max: 600 }))
      .toThrow(ConfigError);
    expect(parseIntegerEnv({}, "AI_REQUESTS_PER_MINUTE", { fallback: 12, min: 1, max: 600 })).toBe(12);
  });

  test("a malformed limit is reported as a configuration issue", () => {
    expect(issuesFor({ ...productionEnv, AI_REQUESTS_PER_MINUTE: "lots" }).join(" "))
      .toMatch(/AI_REQUESTS_PER_MINUTE must be a whole number/);
  });

  test("boolean switches accept only true or false", () => {
    expect(issuesFor({ ...productionEnv, NEWS_SYNC_ENABLED: "yes" }).join(" "))
      .toMatch(/NEWS_SYNC_ENABLED must be exactly/);
    expect(issuesFor({ ...productionEnv, DOCUMENT_OCR_ENABLED: "1" }).join(" "))
      .toMatch(/DOCUMENT_OCR_ENABLED must be exactly/);
  });

  test("news synchronization cannot be enabled without a scheduler secret", () => {
    expect(issuesFor({ ...productionEnv, NEWS_SYNC_ENABLED: "true" }).join(" "))
      .toMatch(/NEWS_SYNC_ENABLED=true requires NEWS_SYNC_SECRET/);
  });

  test("experimental embeddings cannot be enabled in this release", () => {
    expect(issuesFor({ ...productionEnv, GEMINI_EMBEDDINGS_ENABLED: "true" }).join(" "))
      .toMatch(/not supported in this release/);
  });

  test("trust proxy accepts only false, loopback, or a small hop count", () => {
    expect(loadServerConfig({ ...productionEnv, TRUST_PROXY: "1" }).trustProxy).toBe(1);
    expect(loadServerConfig({ ...productionEnv, TRUST_PROXY: "loopback" }).trustProxy).toBe("loopback");
    expect(issuesFor({ ...productionEnv, TRUST_PROXY: "true" }).join(" ")).toMatch(/TRUST_PROXY must be/);
    expect(issuesFor({ ...productionEnv, TRUST_PROXY: "99" }).join(" ")).toMatch(/TRUST_PROXY must be/);
  });

  test("the listen address defaults to all interfaces in production and to loopback in local-user mode", () => {
    expect(loadServerConfig(productionEnv).host).toBe("0.0.0.0");
    const local = {
      LOCAL_USER_MODE: "true",
      FIREBASE_PROJECT_ID: "globeready-local",
      FIREBASE_STORAGE_BUCKET: "globeready-local.appspot.com",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8089",
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
      STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
    };
    expect(loadServerConfig(local).host).toBe("127.0.0.1");
  });

  test("local-user mode refuses any network interface, because its tokens are unsigned", () => {
    const local = {
      LOCAL_USER_MODE: "true",
      FIREBASE_PROJECT_ID: "globeready-local",
      FIREBASE_STORAGE_BUCKET: "globeready-local.appspot.com",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8089",
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
      STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
      HOST: "0.0.0.0",
    };
    expect(issuesFor(local).join(" ")).toMatch(/loopback address/);
    expect(loadServerConfig({ ...local, HOST: "::1" }).host).toBe("::1");
  });

  test("a malformed host is refused", () => {
    expect(issuesFor({ ...productionEnv, HOST: "bad host!" }).join(" ")).toMatch(/HOST must be/);
  });

  test("unknown log levels and malformed build identifiers are refused", () => {
    expect(issuesFor({ ...productionEnv, LOG_LEVEL: "verbose" }).join(" ")).toMatch(/LOG_LEVEL must be/);
    expect(issuesFor({ ...productionEnv, BUILD_ID: "bad build!" }).join(" ")).toMatch(/BUILD_ID may contain/);
  });

  test("admin UIDs must be well-formed identifiers", () => {
    expect(loadServerConfig({ ...productionEnv, ADMIN_UIDS: "admin-1, admin_2" }).adminUids).toEqual(["admin-1", "admin_2"]);
    expect(issuesFor({ ...productionEnv, ADMIN_UIDS: "bad uid,ok" }).join(" ")).toMatch(/ADMIN_UIDS must be/);
  });

  test("secrets are never echoed in configuration errors", () => {
    const secret = "AIzaSyDUMMYSECRETVALUE_12345";
    const issues = issuesFor({ ...productionEnv, GEMINI_API_KEY: `${secret} with space` });
    expect(issues.join(" ")).not.toContain("SECRETVALUE");
  });

  test("no mode flag means production, which refuses to start without its requirements", () => {
    expect(issuesFor({}).join(" ")).toMatch(/FIREBASE_PROJECT_ID is required/);
    expect(loadServerConfig({ DEMO_MODE: "true" }).mode).toBe("demo");
  });

  test("the diagnostic summary omits secrets, keys, and hostnames of private services", () => {
    const config = loadServerConfig({
      ...productionEnv,
      GEMINI_API_KEY: "GEMINI_SECRET_VALUE_1234567890",
      NEWS_SYNC_SECRET: "NEWS_SECRET_VALUE_1234567890",
    }, { version: "9.9.9" });
    const summary = JSON.stringify(configSummary(config));
    expect(summary).not.toContain("GEMINI_SECRET_VALUE");
    expect(summary).not.toContain("NEWS_SECRET_VALUE");
    expect(summary).not.toContain("globeready-prod-7");
    expect(summary).not.toContain("app.globeready-prod.test");
    expect(configSummary(config)).toMatchObject({ mode: "production", version: "9.9.9", gemini: "configured" });
  });
});
