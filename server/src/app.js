import cors from "cors";
import express from "express";
import { createAdminMiddleware, createSchedulerMiddleware } from "./admin-auth.js";
import { createAssistant } from "./assistant.js";
import { createAuthMiddleware } from "./auth.js";
import { defaultNewsSources } from "./news/default-sources.js";
import { createReminderService } from "./reminders.js";
import { createDemoStore } from "./store.js";
import { accountRouter } from "./routes/account.js";
import { adminNewsRouter } from "./routes/admin-news.js";
import { assistantRouter } from "./routes/assistant.js";
import { documentsRouter } from "./routes/documents.js";
import { internalNewsRouter } from "./routes/internal-news.js";
import { newsRouter } from "./routes/news.js";
import { profileRouter } from "./routes/profile.js";
import { createUserRateLimiter } from "./rate-limit.js";
import { resourcesRouter } from "./routes/resources.js";
import { tasksRouter } from "./routes/tasks.js";
import {
  accessLog, errorHandler, jsonBodyLimit, notFound, requestIdentity, requireJsonBodies, securityHeaders,
} from "./http.js";
import { noopLogger } from "./logger.js";

const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const allowedRequestHeaders = ["Authorization", "Content-Type", "X-Request-Id"];
const exposedResponseHeaders = ["X-Request-Id", "Content-Disposition", "Retry-After"];

export function createApp({
  auth = null,
  assistant = createAssistant(),
  store = createDemoStore(),
  aiLimiter = createUserRateLimiter({ limit: 12 }),
  sourceSuggestionLimiter = createUserRateLimiter({ limit: 5, windowMs: 60 * 60_000 }),
  newsQueryLimiter = createUserRateLimiter({ limit: 60 }),
  adminMutationLimiter = createUserRateLimiter({ limit: 30 }),
  accountExportLimiter = createUserRateLimiter({
    limit: 6,
    windowMs: 60 * 60_000,
    message: "Too many export requests. Try again later.",
  }),
  accountDeletionLimiter = createUserRateLimiter({
    limit: 5,
    windowMs: 60 * 60_000,
    message: "Too many deletion attempts. Try again later.",
  }),
  newsSync = null,
  snapshotStore = null,
  adminUids = [],
  schedulerSecret,
  newsSyncEnabled = false,
  registeredNewsSources = defaultNewsSources,
  clock = () => new Date(),
  reminders = createReminderService({ store, clock }),
  account = {},
  recentLoginWindowMs,
  demoMode = process.env.DEMO_MODE === "true",
  deleteStoredFile = null,
  runtimeMode,
  clientOrigins = ["http://localhost:5173"],
  trustProxy = false,
  version = "0.0.0",
  buildId = "unset",
  readiness = () => true,
  logger = noopLogger,
  auditLogger = logger.child ? logger.child({ channel: "audit" }) : noopLogger,
} = {}) {
  const app = express();
  const mode = runtimeMode || (auth ? "production" : demoMode ? "demo" : "unconfigured");

  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);
  app.use(requestIdentity);
  app.use(accessLog(logger));
  app.use(securityHeaders);
  app.use(cors({
    origin: clientOrigins.length ? clientOrigins : false,
    methods: allowedMethods,
    allowedHeaders: allowedRequestHeaders,
    exposedHeaders: exposedResponseHeaders,
    maxAge: 600,
    credentials: false,
  }));
  app.use(requireJsonBodies);
  app.use(express.json({ limit: jsonBodyLimit, strict: true }));
  app.use((request, _response, next) => {
    request.body ??= {};
    next();
  });

  // Liveness: the process is running. It never depends on external services.
  app.get("/api/health/live", (_request, response) => {
    response.json({ status: "ok" });
  });
  // Readiness: the app finished initializing and is accepting traffic (false during shutdown).
  app.get("/api/health/ready", (_request, response) => {
    const ready = readiness() === true;
    response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
  });
  // Legacy summary, kept for existing clients. Reports the runtime mode and capabilities, never secrets.
  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      mode,
      version,
      build: buildId,
      services: { auth: Boolean(auth), ai: assistant?.mode === "live" },
    });
  });

  const authenticate = createAuthMiddleware(auth, { demoMode });
  const requireAdmin = createAdminMiddleware({ adminUids });
  const requireScheduler = createSchedulerMiddleware(schedulerSecret);
  app.use("/api/profile", authenticate, profileRouter(store));
  app.use("/api/tasks", authenticate, tasksRouter(store));
  app.use("/api/documents", authenticate, documentsRouter(store, assistant || createAssistant(), aiLimiter, { deleteStoredFile }));
  app.use("/api/resources", authenticate, resourcesRouter(store));
  app.use("/api/assistant", authenticate, assistantRouter(store, assistant || createAssistant(), aiLimiter));
  app.use("/api/news", authenticate, newsRouter(store, {
    sourceSuggestionLimiter,
    newsQueryLimiter,
    registeredSources: registeredNewsSources,
    clock,
  }));
  app.use("/api/account", authenticate, accountRouter(store, {
    account,
    clock,
    recentLoginWindowMs,
    exportLimiter: accountExportLimiter,
    deletionLimiter: accountDeletionLimiter,
    auditLogger,
  }));
  app.post("/api/notifications/sync", authenticate, async (request, response) => {
    response.json({ data: await reminders.sync(request.user.uid) });
  });
  app.use("/api/admin/news", authenticate, requireAdmin, auditAdminMutations(auditLogger), adminNewsRouter(store, {
    newsSync,
    snapshotStore,
    newsSyncEnabled,
    registeredSources: registeredNewsSources,
    adminMutationLimiter,
    clock,
  }));
  app.use("/api/internal/news", requireScheduler, internalNewsRouter(store, {
    newsSync,
    newsSyncEnabled,
    defaultSourceIds: registeredNewsSources.map(({ id }) => id),
  }));

  app.use(notFound);
  app.use(errorHandler(logger));

  return app;
}

// Every successful admin change is recorded as an audit event, separate from ordinary request logs.
function auditAdminMutations(auditLogger) {
  return function audit(request, response, next) {
    if (request.method === "GET" || request.method === "OPTIONS") return next();
    response.on("finish", () => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        auditLogger.info("audit.admin_news_mutation", {
          actorUid: request.user?.uid,
          method: request.method,
          path: request.path.replace(/[A-Za-z0-9:_-]{24,}/gu, ":id"),
          status: response.statusCode,
          requestId: request.requestId,
        });
      }
    });
    return next();
  };
}
