import { NextResponse } from "next/server";
import { z } from "zod";
import { localDemoServers, updateLocalDemoServer } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer, McpToolPolicy } from "@/lib/types";

export const runtime = "nodejs";

const UpdatePolicySchema = z.object({
  server_id: z.string().min(1),
  tool_name: z.string().min(1).max(240),
  policy: z.enum(["allow", "approval", "block"]),
}).strict();

function updateToolPolicy(server: McpServer, toolName: string, policy: McpToolPolicy) {
  let found = false;
  const tools = (server.tools_json ?? []).map((tool) => {
    if (tool.name !== toolName) return tool;
    found = true;
    return { ...tool, policy };
  });
  return { found, tools };
}

export async function PATCH(request: Request) {
  const body = UpdatePolicySchema.parse(await request.json());

  if (!hasServerNeonEnv()) {
    const server = localDemoServers().find((item) => item.id === body.server_id);
    if (!server) return NextResponse.json({ error: "Integration not found." }, { status: 404 });
    const result = updateToolPolicy(server, body.tool_name, body.policy);
    if (!result.found) return NextResponse.json({ error: "Tool not found." }, { status: 404 });
    updateLocalDemoServer(server.id, { tools_json: result.tools });
    return NextResponse.json({ policy: body.policy, preview: true });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin.from("mcp_servers")
    .select("*").eq("id", body.server_id).eq("user_id", userData.user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Integration not found." }, { status: 404 });

  const server = data as McpServer;
  const result = updateToolPolicy(server, body.tool_name, body.policy);
  if (!result.found) return NextResponse.json({ error: "Tool not found." }, { status: 404 });

  const updated = await admin.from("mcp_servers").update({
    tools_json: result.tools,
    generation_version: Math.max(1, Number(server.generation_version) || 1) + 1,
  }).eq("id", server.id).eq("user_id", userData.user.id).select("id").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 500 });
  return NextResponse.json({ policy: body.policy });
}
