import { timingSafeEqual, randomBytes, scryptSync } from "crypto";

export function createRawApiKey() {
  return `ag_${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(rawKey: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(rawKey, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyApiKey(rawKey: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const candidate = scryptSync(rawKey, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;

  return timingSafeEqual(candidate, expected);
}

export function previewApiKey(rawKey: string) {
  return `${rawKey.slice(0, 7)}...${rawKey.slice(-4)}`;
}
