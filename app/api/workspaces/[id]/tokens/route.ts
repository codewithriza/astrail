import { NextResponse } from "next/server";
import { z } from "zod";
import { createRawApiKey, hashApiKey, previewApiKey } from "@/lib/api-keys";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { createAdminClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

const Body = z.object({ name: z.string().trim().min(1).max(80), permission: z.enum(["read_only", "execute"]).default("execute") });

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  if (!hasServerNeonEnv()) return NextResponse.json({ tokens: [] }); const user = await getDashboardSessionUser(); const { id } = await props.params;
  const { data, error } = await createAdminClient().from("api_keys").select("id,name,key_preview,last_used,created_at,workspace_id,agent_policy").eq("workspace_id", id).eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const parsed = Body.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Token name is required." }, { status: 400 });
  const rawKey = createRawApiKey(); if (!hasServerNeonEnv()) return NextResponse.json({ token: { name: parsed.data.name, key_preview: previewApiKey(rawKey) }, rawKey, preview: true });
  const user = await getDashboardSessionUser(); const { id } = await props.params; const db = createAdminClient();
  const { data: workspace } = await db.from("workspaces").select("id").eq("id", id).eq("user_id", user.id).maybeSingle(); if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  const agent_policy = parsed.data.permission === "read_only" ? { read_only: true, allowed_actions: ["read"] } : {};
  const { data, error } = await db.from("api_keys").insert({ user_id: user.id, workspace_id: id, name: parsed.data.name, key_hash: hashApiKey(rawKey), key_preview: previewApiKey(rawKey), agent_policy }).select("id,name,key_preview,last_used,created_at,workspace_id,agent_policy").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ token: data, rawKey }, { status: 201 });
}
