import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp-oauth-resource";
export async function GET(request: Request) {
  const metadata = protectedResourceMetadata(new URL(request.url).origin);
  return metadata ? NextResponse.json(metadata, { headers: { "cache-control": "public, max-age=300" } }) : NextResponse.json({ error: "MCP OAuth resource server is not configured." }, { status: 503 });
}
