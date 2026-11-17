import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
const Schema = z.object({ name: z.string().min(1).max(120), reason: z.string().min(3).max(500), server_id: z.string().uuid().optional(), ends_at: z.string().datetime().optional() }).strict();
const ReleaseSchema = z.object({ id: z.string().uuid() }).strict();
export async function POST(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "Legal holds require workspace storage.", storage_gap: true }, { status: 503 });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid legal hold.", details: parsed.error.flatten() }, { status: 400 });
  const { data, error } = await createAdminClient().from("audit_legal_holds").insert({ ...parsed.data, user_id: auth.user.id, created_by: auth.user.id }).select("id,name,reason,server_id,starts_at,ends_at,released_at,created_at").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ hold: data }, { status: 201 });
}
export async function GET() {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ holds: [], storage_gap: true });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await createAdminClient().from("audit_legal_holds").select("id,name,reason,server_id,starts_at,ends_at,released_at,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ holds: data ?? [], storage_gap: false });
}
export async function PATCH(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "Legal holds require workspace storage.", storage_gap: true }, { status: 503 });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = ReleaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid legal hold release." }, { status: 400 });
  const { data, error } = await createAdminClient().from("audit_legal_holds").update({ released_at: new Date().toISOString() }).eq("id", parsed.data.id).eq("user_id", auth.user.id).is("released_at", null).select("id,released_at").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return data ? NextResponse.json({ hold: data }) : NextResponse.json({ error: "Active legal hold not found." }, { status: 404 });
}
