import cors from "cors";
import express from "express";

export function createApp({ auth = null, assistant = null } = {}) {
  const app = express();
  const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";

  app.use(cors({ origin: allowedOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      ok: true,
      mode: auth && assistant ? "live" : "demo",
      services: { auth: Boolean(auth), ai: Boolean(assistant) },
    });
  });

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
