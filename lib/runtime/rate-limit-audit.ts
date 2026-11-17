const MAX_AUDIT_WINDOWS = 10_000;
const persistedWindows = new Map<string, number>();

export function shouldPersistRateLimitAudit(key: string, resetAt: number, now = Date.now()) {
  if (persistedWindows.get(key) === resetAt) return false;
  if (persistedWindows.size >= MAX_AUDIT_WINDOWS) {
    persistedWindows.forEach((expiry, entry) => {
      if (expiry <= now) persistedWindows.delete(entry);
    });
    if (persistedWindows.size >= MAX_AUDIT_WINDOWS) return false;
  }
  persistedWindows.set(key, resetAt);
  return true;
}
