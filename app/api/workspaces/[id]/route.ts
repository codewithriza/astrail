import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { createUserDataClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

const PatchSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), environment: z.string().trim().regex(/^[a-z0-9_-]+$/i).max(32).optional(), status: z.enum(["active", "archived"]).optional() }).strict();

export async function GET(_: Request, props: { params: Promise<{ id: string }> }) {
  if (!hasServerNeonEnv()) return NextResponse.json({ workspace: null, integrations: [], tokens: [] });
  const user = await getDashboardSessionUser(); const { id } = await props.params; const db = createUserDataClient();
  const { data: workspace, error } = await db.from("workspaces").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  const [links, tokens] = await Promise.all([
    workspace.bundle_id ? db.from("mcp_bundle_servers").select("server_id").eq("bundle_id", workspace.bundle_id) : Promise.resolve({ data: [] }),
    db.from("api_keys").select("id,name,key_preview,last_used,created_at,workspace_id").eq("workspace_id", id).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ workspace, integrations: links.data ?? [], tokens: tokens.data ?? [] });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid workspace update." }, { status: 400 });
  if (!hasServerNeonEnv()) return NextResponse.json({ workspace: { ...(parsed.data), id: "local-workspace" }, preview: true });
  const user = await getDashboardSessionUser(); const { id } = await props.params;
  const { data, error } = await createUserDataClient().from("workspaces").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Workspace not found." }, { status: error ? 500 : 404 });
  return NextResponse.json({ workspace: data });
}

export async function DELETE(_: Request, props: { params: Promise<{ id: string }> }) {
  if (!hasServerNeonEnv()) return NextResponse.json({ deleted: true, preview: true });
  const user = await getDashboardSessionUser(); const { id } = await props.params;
  const { error } = await createUserDataClient().from("workspaces").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ deleted: true });
}
