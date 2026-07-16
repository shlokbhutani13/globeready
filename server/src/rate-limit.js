export function createUserRateLimiter({
  limit = 12,
  windowMs = 60_000,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();

  return function rateLimit(request, response, next) {
    const key = request.user?.uid || request.ip;
    const currentTime = now();
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : current;

    if (bucket.count >= limit) {
      response.set("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000))));
      return response.status(429).json({
        error: {
          code: "rate_limit_exceeded",
          message: "Too many AI requests. Wait a moment and try again.",
        },
      });
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.resetAt <= currentTime) buckets.delete(bucketKey);
      }
    }
    return next();
  };
}
