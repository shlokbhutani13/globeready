import cors from "cors";
import express from "express";
import { createAdminMiddleware, createSchedulerMiddleware } from "./admin-auth.js";
import { createAssistant } from "./assistant.js";
import { createAuthMiddleware } from "./auth.js";
import { defaultNewsSources } from "./news/default-sources.js";
import { createReminderService } from "./reminders.js";
import { createDemoStore } from "./store.js";
import { adminNewsRouter } from "./routes/admin-news.js";
import { assistantRouter } from "./routes/assistant.js";
import { documentsRouter } from "./routes/documents.js";
import { internalNewsRouter } from "./routes/internal-news.js";
import { newsRouter } from "./routes/news.js";
import { profileRouter } from "./routes/profile.js";
import { createUserRateLimiter } from "./rate-limit.js";
import { resourcesRouter } from "./routes/resources.js";
import { tasksRouter } from "./routes/tasks.js";

export function createApp({
  auth = null,
  assistant = createAssistant(),
  store = createDemoStore(),
  aiLimiter = createUserRateLimiter({
    limit: Number(process.env.AI_REQUESTS_PER_MINUTE || 12),
  }),
  sourceSuggestionLimiter = createUserRateLimiter({
    limit: Number(process.env.NEWS_SOURCE_SUGGESTIONS_PER_HOUR || 5),
    windowMs: 60 * 60_000,
  }),
  newsQueryLimiter = createUserRateLimiter({
    limit: Number(process.env.NEWS_QUERIES_PER_MINUTE || 60),
  }),
  adminMutationLimiter = createUserRateLimiter({
    limit: Number(process.env.NEWS_ADMIN_MUTATIONS_PER_MINUTE || 30),
  }),
  newsSync = null,
  snapshotStore = null,
  adminUids = process.env.ADMIN_UIDS || [],
  schedulerSecret = process.env.NEWS_SYNC_SECRET,
  newsSyncEnabled = process.env.NEWS_SYNC_ENABLED === "true",
  registeredNewsSources = defaultNewsSources,
  clock = () => new Date(),
  reminders = createReminderService({ store, clock }),
} = {}) {
  const app = express();
  const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      mode: auth ? "live" : "demo",
      services: { auth: Boolean(auth), ai: assistant?.mode === "live" },
    });
  });

  const authenticate = createAuthMiddleware(auth);
  const requireAdmin = createAdminMiddleware({ adminUids });
  const requireScheduler = createSchedulerMiddleware(schedulerSecret);
  app.use("/api/profile", authenticate, profileRouter(store));
  app.use("/api/tasks", authenticate, tasksRouter(store));
  app.use("/api/documents", authenticate, documentsRouter(store, assistant || createAssistant(), aiLimiter));
  app.use("/api/resources", authenticate, resourcesRouter(store));
  app.use("/api/assistant", authenticate, assistantRouter(store, assistant || createAssistant(), aiLimiter));
  app.use("/api/news", authenticate, newsRouter(store, {
    sourceSuggestionLimiter,
    newsQueryLimiter,
    registeredSources: registeredNewsSources,
  }));
  app.post("/api/notifications/sync", authenticate, async (request, response) => {
    response.json({ data: await reminders.sync(request.user.uid) });
  });
  app.use("/api/admin/news", authenticate, requireAdmin, adminNewsRouter(store, {
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

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "Route not found." } });
  });

  app.use((error, _request, response, _next) => {
    console.error("GlobeReady API error", error?.message);
    response.status(error?.status || 500).json({
      error: {
        code: error?.code || "internal_error",
        message: error?.safeMessage || "The request could not be completed.",
      },
    });
  });

  return app;
}
