import { NextResponse } from "next/server";
import { localDemoServers } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ servers: localDemoServers(), preview: true });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const db = await createDataClient();
  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ servers: (data ?? []) as McpServer[] });
}
