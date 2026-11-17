import { createHash } from "node:crypto";

const DEFAULT_REFRESH_FRACTION = 0.85;
const DEFAULT_JITTER_FRACTION = 0.02;

function boundedFraction(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function deterministicRefreshFraction(credentialId: string) {
  const base = boundedFraction(process.env.ASTRAIL_OAUTH_REFRESH_FRACTION, DEFAULT_REFRESH_FRACTION, 0.8, 0.9);
  const jitter = boundedFraction(process.env.ASTRAIL_OAUTH_REFRESH_JITTER, DEFAULT_JITTER_FRACTION, 0, 0.05);
  const bucket = createHash("sha256").update(credentialId).digest().readUInt16BE(0) / 65535;
  return Math.min(0.9, Math.max(0.8, base + ((bucket * 2) - 1) * jitter));
}

export function oauthRefreshDue(input: {
  credentialId: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  originalTtlSeconds?: number | null;
}, now = Date.now()) {
  if (!input.expiresAt) return false;
  const expires = Date.parse(input.expiresAt);
  if (!Number.isFinite(expires)) return true;
  const ttlMs = input.originalTtlSeconds && input.originalTtlSeconds > 0
    ? input.originalTtlSeconds * 1000
    : input.issuedAt ? expires - Date.parse(input.issuedAt) : 0;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) return expires - 60_000 <= now;
  const issued = input.issuedAt ? Date.parse(input.issuedAt) : expires - ttlMs;
  return now >= issued + ttlMs * deterministicRefreshFraction(input.credentialId);
}

export function tokenLifetime(expiresAt: string | null, issuedAt = new Date()) {
  if (!expiresAt) return { issuedAt: issuedAt.toISOString(), ttlSeconds: null };
  const ttlSeconds = Math.max(1, Math.round((Date.parse(expiresAt) - issuedAt.getTime()) / 1000));
  return { issuedAt: issuedAt.toISOString(), ttlSeconds };
}
