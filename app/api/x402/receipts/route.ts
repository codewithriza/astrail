import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = (await (await createServerNeonClient()).auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasServiceRoleKey()) return NextResponse.json({ error: "x402 receipt storage is unavailable." }, { status: 503 });
  const serverId = z.string().uuid().safeParse(new URL(request.url).searchParams.get("server_id"));
  if (!serverId.success) return NextResponse.json({ error: "Valid server_id required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers").select("id").eq("id", serverId.data).eq("user_id", user.id).maybeSingle();
  if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  const { data, error } = await admin.from("x402_payment_receipts")
    .select("id,server_id,end_user_id,tool_name,trace_id,network,asset,amount,pay_to,status,transaction,settled_at,created_at,updated_at")
    .eq("server_id", serverId.data).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Apply database/migrations/x402.sql before viewing receipts." }, { status: 503 });
  return NextResponse.json({ receipts: data ?? [] });
}
