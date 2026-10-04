import "dotenv/config";

import { createApp } from "./app.js";
import { createAssistant, createLocalFallback, createUnavailableAssistant } from "./assistant.js";
import { createFirebaseAdmin } from "./firebase-admin.js";
import { createFirestoreStore } from "./firestore-store.js";
import { createGeminiAssistant } from "./gemini.js";
import { createLifecycle } from "./lifecycle.js";
import { createLogger } from "./logger.js";
import { createLocalOcr } from "./ocr.js";
import { createUserRateLimiter } from "./rate-limit.js";
import { ConfigError, configSummary, loadServerConfig } from "./runtime-config.js";
import { createFeedAdapter } from "./news/adapters/feed.js";
import { createIndexPageAdapter } from "./news/adapters/index-page.js";
import { createUniversitySitemapAdapter } from "./news/adapters/university-sitemap.js";
import { defaultNewsSources } from "./news/default-sources.js";
import { fetchSource } from "./news/fetch-source.js";
import { createRobotsPolicy } from "./news/robots.js";
import { createNewsSync } from "./news/sync-news.js";
import { createDemoStore } from "./store.js";

const authCheckTimeoutMs = 10_000;

let config;
try {
  config = loadServerConfig(process.env);
} catch (error) {
  const issues = error instanceof ConfigError ? error.issues : ["configuration could not be loaded."];
  for (const issue of issues) console.error(`GlobeReady refused to start: ${issue}`);
  process.exit(1);
}

const logger = createLogger({
  level: config.logLevel,
  base: { service: "globeready-api", version: config.version, build: config.buildId, mode: config.mode },
});

function refuseToStart(reason) {
  logger.error("startup.refused", { reason });
  console.error(`GlobeReady refused to start: ${reason}`);
  process.exit(1);
}

let firebase = null;
try {
  firebase = createFirebaseAdmin(process.env);
} catch (error) {
  refuseToStart(error instanceof ConfigError ? error.message : "configuration could not be loaded.");
}

if (firebase) {
  // Verifies that the configured credentials can reach Firebase Auth before the server accepts traffic.
  const timer = setTimeout(() => refuseToStart("Firebase Admin did not respond in time."), authCheckTimeoutMs);
  try {
    await firebase.auth.listUsers(1);
  } catch {
    refuseToStart("Firebase Admin could not reach Firebase Auth with the configured credentials.");
  } finally {
    clearTimeout(timer);
  }
}

const store = firebase?.firestore ? createFirestoreStore(firebase.firestore) : createDemoStore();
const fallback = config.mode === "local-user"
  ? createLocalFallback()
  : config.mode === "demo" ? createAssistant() : createUnavailableAssistant();
const ocr = config.ocrEnabled ? createLocalOcr() : null;
const assistant = createGeminiAssistant({
  answerUnavailableLabel: config.mode === "local-user" ? " in local mode" : "",
  apiKey: config.gemini.apiKey,
  embeddingsEnabled: config.gemini.embeddingsEnabled,
  model: config.gemini.model,
  embeddingModel: config.gemini.embeddingModel,
  timeoutMs: config.gemini.timeoutMs,
  bucket: firebase?.bucket,
  store,
  fallback,
  ocr,
});
const newsSync = createNewsSync({
  store,
  fetchSource,
  robotsPolicy: createRobotsPolicy({ fetchSource }),
  adapters: {
    feed: createFeedAdapter(),
    "index-page": createIndexPageAdapter(),
    "university-sitemap": createUniversitySitemapAdapter(),
  },
});

let ready = false;
const app = createApp({
  runtimeMode: config.mode,
  demoMode: config.mode === "demo",
  auth: firebase?.auth || null,
  store,
  assistant,
  newsSync,
  newsSyncEnabled: config.newsSync.enabled,
  snapshotStore: store.snapshots || null,
  schedulerSecret: config.newsSync.secret,
  adminUids: config.adminUids,
  registeredNewsSources: defaultNewsSources,
  aiLimiter: createUserRateLimiter({ limit: config.limits.aiRequestsPerMinute }),
  newsQueryLimiter: createUserRateLimiter({ limit: config.limits.newsQueriesPerMinute }),
  sourceSuggestionLimiter: createUserRateLimiter({
    limit: config.limits.newsSourceSuggestionsPerHour,
    windowMs: 60 * 60_000,
  }),
  adminMutationLimiter: createUserRateLimiter({ limit: config.limits.newsAdminMutationsPerMinute }),
  accountExportLimiter: createUserRateLimiter({
    limit: config.limits.accountExportsPerHour,
    windowMs: 60 * 60_000,
    message: "Too many export requests. Try again later.",
  }),
  accountDeletionLimiter: createUserRateLimiter({
    limit: config.limits.accountDeletionsPerHour,
    windowMs: 60 * 60_000,
    message: "Too many deletion attempts. Try again later.",
  }),
  clientOrigins: config.clientOrigins,
  trustProxy: config.trustProxy,
  version: config.version,
  buildId: config.buildId,
  readiness: () => ready && !lifecycle.isShuttingDown(),
  logger,
  deleteStoredFile: firebase?.bucket
    ? (path) => firebase.bucket.file(path).delete({ ignoreNotFound: true })
    : null,
  account: {
    deleteStoragePrefix: firebase?.bucket
      ? (uid) => firebase.bucket.deleteFiles({ prefix: `users/${uid}/` })
      : undefined,
    deleteAuthUser: firebase ? (uid) => firebase.auth.deleteUser(uid) : null,
  },
});

const server = app.listen(config.port, config.host, () => {
  ready = true;
  logger.info("startup.ready", configSummary(config));
});
server.on("error", (error) => {
  refuseToStart(error?.code === "EADDRINUSE" ? `port ${config.port} is already in use.` : "the HTTP server could not start.");
});

const lifecycle = createLifecycle({
  server,
  logger,
  timeoutMs: config.shutdownTimeoutMs,
  onShutdown: async () => {
    await ocr?.shutdown?.();
    await firebase?.firestore?.terminate?.().catch(() => {});
  },
});
