import { NextResponse } from "next/server";
import { z } from "zod";
import { createTaskToken, hashTaskToken } from "@/lib/runtime/composable-authorization";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

export const runtime = "nodejs";
const Action = z.enum(["read", "draft", "write", "send", "destructive"]);
const CreateSchema = z.object({
  server_id: z.string().uuid(), agent_id: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/),
  purpose: z.string().trim().min(3).max(500), issuer: z.string().trim().min(1).max(120),
  ttl_seconds: z.number().int().min(60).max(3600).default(900),
  allowed_tools: z.array(z.string().min(1).max(240)).max(200).default([]),
  allowed_actions: z.array(Action).max(5).default([]), approval_actions: z.array(Action).max(5).default([]),
  allowed_resources: z.array(z.string().min(1).max(240)).max(200).default([]),
  allowed_scopes: z.array(z.string().min(1).max(240)).max(200).default([]),
}).strict();

export async function POST(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "Task authorization requires workspace storage." }, { status: 503 });
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task authorization.", details: parsed.error.flatten() }, { status: 400 });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers").select("id").eq("id", parsed.data.server_id).eq("user_id", auth.user.id).maybeSingle();
  if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  const rawToken = createTaskToken();
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + parsed.data.ttl_seconds * 1000).toISOString();
  const { data, error } = await admin.from("task_authorizations").insert({
    user_id: auth.user.id, server_id: parsed.data.server_id, agent_id: parsed.data.agent_id,
    token_hash: hashTaskToken(rawToken), nonce, issuer: parsed.data.issuer, purpose: parsed.data.purpose,
    allowed_tools: parsed.data.allowed_tools, allowed_actions: parsed.data.allowed_actions,
    approval_actions: parsed.data.approval_actions, allowed_resources: parsed.data.allowed_resources,
    allowed_scopes: parsed.data.allowed_scopes, expires_at: expiresAt,
  }).select("id,server_id,agent_id,nonce,issuer,purpose,allowed_tools,allowed_actions,approval_actions,allowed_resources,allowed_scopes,expires_at,created_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ authorization: data, raw_token: rawToken, note: "Store this token now; it is displayed only once." }, { status: 201 });
}

export async function GET() {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ authorizations: [] });
  const { data: auth } = await (await createServerNeonClient()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await createAdminClient().from("task_authorizations")
    .select("id,server_id,agent_id,nonce,issuer,purpose,allowed_tools,allowed_actions,approval_actions,allowed_resources,allowed_scopes,expires_at,revoked_at,created_at")
    .eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(100);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ authorizations: data ?? [] });
}
