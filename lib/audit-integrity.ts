import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, stable(nested)]));
  return value;
}
export function canonicalAuditExport(rows: unknown[]) { return JSON.stringify(stable(rows)); }
export function auditRowsDigest(rows: unknown[]) { return createHash("sha256").update(canonicalAuditExport(rows)).digest("hex"); }
export function auditSigningConfigured() { return Boolean(process.env.AUDIT_EXPORT_SIGNING_KEY?.trim()); }
export function createAuditExportManifest(rows: unknown[], input: { userId: string; exportedAt: string; filters: unknown }) {
  const manifest = { version: 1, algorithm: "HMAC-SHA256", exported_at: input.exportedAt, user_id: input.userId, row_count: rows.length, rows_sha256: auditRowsDigest(rows), filters: stable(input.filters), signature_status: auditSigningConfigured() ? "signed" : "unsigned_signing_key_unavailable" };
  const signature = auditSigningConfigured() ? createHmac("sha256", process.env.AUDIT_EXPORT_SIGNING_KEY as string).update(JSON.stringify(manifest)).digest("hex") : null;
  return { manifest, signature };
}
export function verifyAuditExportManifest(rows: unknown[], manifest: Record<string, unknown>, signature: string | null) {
  const digestMatches = typeof manifest.rows_sha256 === "string" && auditRowsDigest(rows) === manifest.rows_sha256;
  if (!digestMatches || !signature || !auditSigningConfigured() || !/^[a-f0-9]{64}$/.test(signature)) return { valid: false, digestMatches, signatureValid: false };
  const expected = createHmac("sha256", process.env.AUDIT_EXPORT_SIGNING_KEY as string).update(JSON.stringify(manifest)).digest();
  const supplied = Buffer.from(signature, "hex");
  return { valid: supplied.length === expected.length && timingSafeEqual(supplied, expected), digestMatches, signatureValid: supplied.length === expected.length && timingSafeEqual(supplied, expected) };
}
