import crypto from "node:crypto";
import { isRequestOriginAllowed } from "./origin-policy";

const attempts = new Map<string, { count: number; resetAt: number }>();

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function hashIp(ip: string) {
  const pepper = process.env.IP_HASH_PEPPER || process.env.NEON_AUTH_COOKIE_SECRET || "dev-pepper";
  return crypto.createHmac("sha256", pepper).update(ip).digest("hex");
}

export function rateLimit(key: string, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  if (current.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  }

  current.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export function originAllowed(request: Request) {
  return isRequestOriginAllowed(request);
}
