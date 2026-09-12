import { createHash } from "crypto";

export type CachedUpstreamResponse = {
  status: number;
  contentType: string | null;
  body: unknown;
  bodyBytes: number;
  truncated: boolean;
  cachedAt: string;
};

type CacheEntry = CachedUpstreamResponse & {
  expiresAt: number;
  lastSeenAt: number;
};

const entries = new Map<string, CacheEntry>();
const TTL_MS = positiveInteger(process.env.ASTRAIL_RUNTIME_RESPONSE_CACHE_TTL_MS, 30_000);
const MAX_ENTRIES = positiveInteger(process.env.ASTRAIL_RUNTIME_RESPONSE_CACHE_ENTRIES, 2_000);
const MAX_BODY_BYTES = positiveInteger(process.env.ASTRAIL_RUNTIME_RESPONSE_CACHE_BODY_BYTES, 262_144);
let lastPrunedAt = 0;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function responseCacheEnabled() {
  return (process.env.ASTRAIL_RUNTIME_RESPONSE_CACHE ?? "on").toLowerCase() !== "off";
}

// Key includes the credential secret hash so two callers with different
// credentials (e.g. per-end-user tokens) can never share a cached body.
export function responseCacheKey(serverId: string, url: URL, credentialSecret: string | null) {
  return createHash("sha256")
    .update(serverId)
    .update("|")
    .update(url.toString())
    .update("|")
    .update(credentialSecret ?? "anonymous")
    .digest("hex");
}

function pruneExpired(now: number, force = false) {
  if (!force && now - lastPrunedAt < Math.min(TTL_MS, 30_000)) return;
  lastPrunedAt = now;
  for (const [key, entry] of Array.from(entries.entries())) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
}

function evictOldest() {
  let oldestKey: string | null = null;
  let oldestSeenAt = Number.POSITIVE_INFINITY;
  for (const [key, entry] of Array.from(entries.entries())) {
    if (entry.lastSeenAt < oldestSeenAt) {
      oldestSeenAt = entry.lastSeenAt;
      oldestKey = key;
    }
  }
  if (oldestKey) entries.delete(oldestKey);
}

export function getCachedUpstreamResponse(key: string, now = Date.now()): CachedUpstreamResponse | null {
  if (!responseCacheEnabled()) return null;
  pruneExpired(now);
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(key);
    return null;
  }
  entry.lastSeenAt = now;
  return {
    status: entry.status,
    contentType: entry.contentType,
    body: entry.body,
    bodyBytes: entry.bodyBytes,
    truncated: entry.truncated,
    cachedAt: entry.cachedAt,
  };
}

export function storeCachedUpstreamResponse(key: string, response: CachedUpstreamResponse, now = Date.now()) {
  if (!responseCacheEnabled()) return;
  if (response.truncated || response.bodyBytes > MAX_BODY_BYTES) return;
  pruneExpired(now, true);
  if (entries.size >= MAX_ENTRIES) evictOldest();
  entries.set(key, {
    ...response,
    expiresAt: now + TTL_MS,
    lastSeenAt: now,
  });
}

export function clearResponseCacheForTesting() {
  entries.clear();
}
