// Rate limiting uses a small store contract so a shared backend can replace the in-memory store later.
// Contract: async increment(key, windowMs, nowMs) -> { count, resetAt } (resetAt in epoch milliseconds).
// The in-memory store is per process. Production must declare single-instance operation (see RATE_LIMIT_SCOPE).
export function createMemoryRateLimitStore({ now = () => Date.now(), maxKeys = 10_000 } = {}) {
  const buckets = new Map();
  return {
    scope: "in-memory-per-instance",
    async increment(key, windowMs) {
      const currentTime = now();
      const current = buckets.get(key);
      const bucket = !current || current.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : current;
      bucket.count += 1;
      buckets.set(key, bucket);
      if (buckets.size > maxKeys) {
        for (const [bucketKey, value] of buckets) {
          if (value.resetAt <= currentTime) buckets.delete(bucketKey);
        }
      }
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
  };
}

export function createUserRateLimiter({
  limit = 12,
  windowMs = 60_000,
  store = createMemoryRateLimitStore(),
  message = "Too many requests. Wait a moment and try again.",
  code = "rate_limit_exceeded",
} = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Rate limit must be a positive integer.");
  return async function rateLimit(request, response, next) {
    try {
      const key = request.user?.uid ? `uid:${request.user.uid}` : `ip:${request.ip}`;
      const { count, resetAt } = await store.increment(key, windowMs);
      if (count > limit) {
        const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
        response.set("Retry-After", String(retryAfter));
        return response.status(429).json({ error: { code, message } });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}
