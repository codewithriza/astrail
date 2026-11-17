import { NextResponse } from "next/server";
import { z } from "zod";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";

const RetentionSchema = z.object({ days: z.number().int().min(7).max(3650) }).strict();
const RETENTION_BATCH_SIZE = 100;

export async function DELETE(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "Audit retention requires workspace storage." }, { status: 503 });
  const { data: userData } = await (await createServerNeonClient()).auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = RetentionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid retention policy.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const cutoff = new Date(Date.now() - body.days * 86_400_000).toISOString();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_audit_logs", { p_user_id: userData.user.id, p_cutoff: cutoff, p_limit: RETENTION_BATCH_SIZE });
  if (error) return NextResponse.json({ error: error.message, storage_gap: "Retention procedure unavailable; no evidence was deleted." }, { status: 500 });
  const result = Array.isArray(data) ? data[0] : data;
  const deleted = Number(result?.deleted_count ?? 0), held = Number(result?.held_count ?? 0);
  return NextResponse.json({ deleted, held, cutoff, has_more: deleted === RETENTION_BATCH_SIZE, legal_hold_enforced: true });
}
