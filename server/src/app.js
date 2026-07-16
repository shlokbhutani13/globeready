import cors from "cors";
import express from "express";
import { createAssistant } from "./assistant.js";
import { createAuthMiddleware } from "./auth.js";
import { createDemoStore } from "./store.js";
import { assistantRouter } from "./routes/assistant.js";
import { documentsRouter } from "./routes/documents.js";
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
  app.use("/api/profile", authenticate, profileRouter(store));
  app.use("/api/tasks", authenticate, tasksRouter(store));
  app.use("/api/documents", authenticate, documentsRouter(store, assistant || createAssistant(), aiLimiter));
  app.use("/api/resources", authenticate, resourcesRouter(store));
  app.use("/api/assistant", authenticate, assistantRouter(store, assistant || createAssistant(), aiLimiter));

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
