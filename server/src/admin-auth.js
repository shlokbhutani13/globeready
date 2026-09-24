import { createHash, timingSafeEqual } from "node:crypto";

const uidPattern = /^[A-Za-z0-9:_-]{1,128}$/u;

function configuredUids(value) {
  if (Array.isArray(value)) {
    return value.every((uid) => typeof uid === "string" && uidPattern.test(uid))
      ? new Set(value)
      : new Set();
  }
  if (typeof value !== "string" || !value) return new Set();
  const entries = value.split(",").map((uid) => uid.trim());
  return entries.length > 0 && entries.every((uid) => uidPattern.test(uid))
    ? new Set(entries)
    : new Set();
}

function unauthorized(response, status, code, message) {
  return response.status(status).json({ error: { code, message } });
}

export function createAdminMiddleware({ adminUids = [] } = {}) {
  const allowedUids = configuredUids(adminUids);
  return function requireAdmin(request, response, next) {
    if (request.user?.admin === true || allowedUids.has(request.user?.uid)) return next();
    return unauthorized(response, 403, "admin_required", "Administrator access is required.");
  };
}

function secretDigest(value) {
  return createHash("sha256").update(value, "utf8").digest();
}

function validSecret(value) {
  return typeof value === "string" && value.length >= 16 && value.length <= 512
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function createSchedulerMiddleware(secret) {
  const configured = validSecret(secret) ? secretDigest(secret) : null;
  return function requireScheduler(request, response, next) {
    if (!configured) {
      return unauthorized(response, 503, "scheduler_unavailable", "Scheduler authentication is not configured.");
    }
    const authorization = request.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const supplied = secretDigest(token);
    if (!validSecret(token) || !timingSafeEqual(configured, supplied)) {
      return unauthorized(response, 401, "invalid_scheduler_secret", "Scheduler authentication failed.");
    }
    return next();
  };
}
