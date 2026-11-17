import { NextResponse } from "next/server";
import { presetServers } from "@/lib/preset-servers";
import type { McpServer } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const servers = presetServers.filter((server) => matchesSearch(server, search));

    return NextResponse.json({ servers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Marketplace failed to load.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function matchesSearch(server: McpServer, search: string) {
  if (!search) return true;
  const toolText = JSON.stringify(server.tools_json ?? []).toLowerCase();
  return (
    server.name.toLowerCase().includes(search) ||
    (server.description ?? "").toLowerCase().includes(search) ||
    toolText.includes(search)
  );
}
