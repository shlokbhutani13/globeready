import { randomUUID } from "node:crypto";

const requestIdPattern = /^[A-Za-z0-9._-]{8,128}$/u;
export const jsonBodyLimit = "100kb";

export function requestIdentity(request, response, next) {
  const supplied = request.get("x-request-id");
  request.requestId = supplied && requestIdPattern.test(supplied) ? supplied : randomUUID();
  response.setHeader("X-Request-Id", request.requestId);
  next();
}

// The route template (for example /api/tasks/:id), never the raw path, so IDs and other request data stay out of logs.
function routeTemplate(request) {
  if (!request.route?.path) return "unmatched";
  return `${request.baseUrl || ""}${request.route.path}`;
}

export function accessLog(logger) {
  return function accessLogger(request, response, next) {
    const started = process.hrtime.bigint();
    let finished = false;
    const record = (event, fields) => {
      const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
      const common = {
        requestId: request.requestId,
        method: request.method,
        route: routeTemplate(request),
        latencyMs: Math.round(latencyMs * 10) / 10,
      };
      if (event === "http.request") {
        const level = response.statusCode >= 500 ? "error" : response.statusCode >= 400 ? "warn" : "info";
        logger[level](event, { ...common, status: response.statusCode });
      } else {
        logger.warn(event, { ...common, ...fields });
      }
    };
    response.on("finish", () => {
      finished = true;
      record("http.request");
    });
    response.on("close", () => {
      if (!finished) record("http.aborted");
    });
    next();
  };
}

export function securityHeaders(_request, response, next) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("Cache-Control", "no-store");
  next();
}

// A request that carries a body must declare JSON. GET and bodiless requests pass through.
export function requireJsonBodies(request, response, next) {
  const length = request.get("content-length");
  const hasBody = (length !== undefined && length !== "0") || request.get("transfer-encoding") !== undefined;
  if (!hasBody) return next();
  const type = (request.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json") {
    return response.status(415).json({
      error: { code: "unsupported_media_type", message: "Send request bodies as application/json." },
    });
  }
  return next();
}

export function notFound(_request, response) {
  response.status(404).json({ error: { code: "not_found", message: "Route not found." } });
}

const parseErrors = {
  "entity.parse.failed": { status: 400, code: "invalid_json", message: "The request body is not valid JSON." },
  "entity.too.large": { status: 413, code: "payload_too_large", message: "The request body is too large." },
  "encoding.unsupported": { status: 415, code: "unsupported_media_type", message: "The request body encoding is not supported." },
  "charset.unsupported": { status: 415, code: "unsupported_media_type", message: "The request body encoding is not supported." },
  "request.aborted": { status: 400, code: "request_aborted", message: "The request was interrupted." },
};

export function errorHandler(logger) {
  return function handleError(error, request, response, _next) {
    if (response.headersSent) return response.end();
    const known = parseErrors[error?.type];
    let status = known?.status || (Number.isInteger(error?.status) ? error.status : 500);
    let code = known?.code || error?.code || "internal_error";
    let message = known?.message || "The request could not be completed.";
    // Only errors that deliberately carry a user-safe message are shown. Everything else is generic.
    if (!known && typeof error?.safeMessage === "string" && status < 500) message = error.safeMessage;
    if (status >= 500) {
      code = typeof error?.code === "string" && /^[a-z_]+$/u.test(error.code) ? error.code : "internal_error";
      message = typeof error?.safeMessage === "string" ? error.safeMessage : "The request could not be completed.";
    }
    if (typeof code !== "string" || !/^[a-z_]+$/u.test(code)) code = "internal_error";
    logger[status >= 500 ? "error" : "warn"]("http.error", {
      requestId: request.requestId,
      method: request.method,
      route: routeTemplate(request),
      status,
      errorCode: code,
    });
    response.status(status).json({ error: { code, message } });
  };
}
