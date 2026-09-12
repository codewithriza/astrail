type Bucket = {
  count: number;
  resetAt: number;
  lastSeenAt: number;
};

const buckets = new Map<string, Bucket>();
const WINDOW_MS = positiveInteger(process.env.ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS, 60_000);
const DEFAULT_LIMIT = positiveInteger(process.env.ASTRAIL_RUNTIME_RATE_LIMIT_MAX, 120);
const MAX_BUCKETS = positiveInteger(process.env.ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS, 5_000);
let lastPrunedAt = 0;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function pruneExpiredBuckets(now: number, force = false) {
  if (!force && now - lastPrunedAt < Math.min(WINDOW_MS, 60_000)) return;
  lastPrunedAt = now;

  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function evictOldestBucket() {
  let oldestKey: string | null = null;
  let oldestSeenAt = Number.POSITIVE_INFINITY;

  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.lastSeenAt < oldestSeenAt) {
      oldestSeenAt = bucket.lastSeenAt;
      oldestKey = key;
    }
  }

  if (oldestKey) buckets.delete(oldestKey);
}

export function checkRuntimeRateLimit(key: string, limit = DEFAULT_LIMIT) {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (!existing && buckets.size >= MAX_BUCKETS) {
      pruneExpiredBuckets(now, true);
      if (buckets.size >= MAX_BUCKETS) evictOldestBucket();
    }

    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS, lastSeenAt: now });
    return { allowed: true, remaining: limit - 1, resetAt: now + WINDOW_MS };
  }

  if (existing.count >= limit) {
    existing.lastSeenAt = now;
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  existing.lastSeenAt = now;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

export function runtimeRateLimitStats() {
  return {
    bucketCount: buckets.size,
    maxBuckets: MAX_BUCKETS,
    windowMs: WINDOW_MS,
    defaultLimit: DEFAULT_LIMIT,
  };
}

export function resetRuntimeRateLimitForTests() {
  buckets.clear();
  lastPrunedAt = 0;
}
