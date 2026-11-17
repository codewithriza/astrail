import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { loadWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

async function forward(request: Request, workspaceId: string) {
  if (!hasServerNeonEnv()) return NextResponse.json({ error: "Workspace runtime requires Neon." }, { status: 503 });
  const workspace = await loadWorkspace(workspaceId);
  if (!workspace?.bundle_id || workspace.status !== "active") return NextResponse.json({ error: "Workspace endpoint is unavailable." }, { status: 404 });
  const target = new URL(`/api/mcp/bundles/${workspace.bundle_id}`, request.url);
  const headers = new Headers(request.headers); headers.set("x-astrail-workspace", workspaceId);
  const response = await fetch(target, { method: request.method, headers, body: request.method === "POST" ? await request.text() : undefined, redirect: "manual" });
  await createAdminClient().from("workspaces").update({ last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", workspaceId);
  return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}

export async function POST(request: Request, props: { params: Promise<{ workspaceId: string }> }) { return forward(request, (await props.params).workspaceId); }
export async function OPTIONS(request: Request, props: { params: Promise<{ workspaceId: string }> }) { return forward(request, (await props.params).workspaceId); }
