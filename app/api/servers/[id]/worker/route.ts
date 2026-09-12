import { NextResponse } from "next/server";
import { buildWorkerBundle } from "@/lib/worker-export";
import { localDemoServers } from "@/lib/local-demo";
import { loadLocalPreviewServer } from "@/lib/local-preview-servers";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    const server = (await loadLocalPreviewServer(params.id, request.url))
      ?? localDemoServers().find((item) => item.id === params.id);
    if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    return NextResponse.json(buildWorkerBundle(server));
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await createAdminClient()
    .from("mcp_servers")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", userData.user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  return NextResponse.json(buildWorkerBundle(data as McpServer));
}
