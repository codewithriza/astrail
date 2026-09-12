import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { createAdminClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { buildBundleEndpoint } from "@/lib/urls";

const Body = z.object({ server_id: z.string().uuid() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const payload = await request.json().catch(() => null);
  if (!hasServerNeonEnv()) {
    const serverId = payload && typeof payload === "object" && "server_id" in payload ? String(payload.server_id) : "";
    if (!serverId) return NextResponse.json({ error: "An integration is required." }, { status: 400 });
    return NextResponse.json({ linked: true, preview: true });
  }
  const parsed = Body.safeParse(payload); if (!parsed.success) return NextResponse.json({ error: "A valid integration is required." }, { status: 400 });
  const user = await getDashboardSessionUser(); const { id } = await props.params; const db = createAdminClient();
  const { data: workspace } = await db.from("workspaces").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  const { data: server } = await db.from("mcp_servers").select("id").eq("id", parsed.data.server_id).eq("user_id", user.id).maybeSingle();
  if (!workspace || !server) return NextResponse.json({ error: "Workspace or integration not found." }, { status: 404 });
  let bundleId = workspace.bundle_id as string | null;
  if (!bundleId) {
    const created = await db.from("mcp_bundles").insert({ user_id: user.id, name: workspace.name, is_public: false }).select("id").single();
    if (created.error || !created.data) return NextResponse.json({ error: created.error?.message ?? "Could not create workspace endpoint." }, { status: 500 });
    const createdBundleId = created.data.id;
    bundleId = createdBundleId;
    await db.from("mcp_bundles").update({ hosted_endpoint: buildBundleEndpoint(createdBundleId, request.url) }).eq("id", createdBundleId);
    await db.from("workspaces").update({ bundle_id: createdBundleId, updated_at: new Date().toISOString() }).eq("id", id);
  }
  if (!bundleId) return NextResponse.json({ error: "Workspace endpoint could not be created." }, { status: 500 });
  const { error } = await db.from("mcp_bundle_servers").upsert({ bundle_id: bundleId, server_id: parsed.data.server_id }, { onConflict: "bundle_id,server_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ linked: true, bundle_id: bundleId });
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const serverId = new URL(request.url).searchParams.get("server_id"); if (!serverId) return NextResponse.json({ error: "server_id is required." }, { status: 400 });
  if (!hasServerNeonEnv()) return NextResponse.json({ deleted: true, preview: true });
  const user = await getDashboardSessionUser(); const { id } = await props.params; const db = createAdminClient();
  const { data: workspace } = await db.from("workspaces").select("bundle_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!workspace?.bundle_id) return NextResponse.json({ deleted: true });
  const { error } = await db.from("mcp_bundle_servers").delete().eq("bundle_id", workspace.bundle_id).eq("server_id", serverId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ deleted: true });
}
