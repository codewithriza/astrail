import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eligibleX402Domains } from "@/lib/runtime/x402";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ServerIdSchema = z.string().uuid();
const CreateDomainSchema = z.object({
  server_id: z.string().uuid(),
  domain: z.string().trim().toLowerCase().max(253).regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
}).strict();

async function currentUser() {
  const neon = await createServerNeonClient();
  return (await neon.auth.getUser()).data.user ?? null;
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasServiceRoleKey()) return NextResponse.json({ error: "x402 verification storage is unavailable." }, { status: 503 });
  const serverId = ServerIdSchema.safeParse(new URL(request.url).searchParams.get("server_id"));
  if (!serverId.success) return NextResponse.json({ error: "Valid server_id required." }, { status: 400 });
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers")
    .select("id,user_id,endpoint_map,source_url")
    .eq("id", serverId.data).eq("user_id", user.id).maybeSingle();
  if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  const { data, error } = await admin.from("x402_domain_verifications")
    .select("id,server_id,domain,status,verified_at,last_error,created_at,updated_at")
    .eq("server_id", serverId.data).eq("user_id", user.id).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Apply database/migrations/x402.sql before configuring x402." }, { status: 503 });
  return NextResponse.json({
    eligible_domains: eligibleX402Domains(server as unknown as McpServer),
    verifications: data ?? [],
    method: "https_file",
    challenge_path: "/.well-known/astrail-domain-verification.txt",
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!hasServiceRoleKey()) return NextResponse.json({ error: "x402 verification storage is unavailable." }, { status: 503 });
  const parsed = CreateDomainSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid HTTPS upstream domain." }, { status: 400 });
  const admin = createAdminClient();
  const { data: server } = await admin.from("mcp_servers")
    .select("id,user_id,endpoint_map,source_url")
    .eq("id", parsed.data.server_id).eq("user_id", user.id).maybeSingle();
  if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
  if (!eligibleX402Domains(server as unknown as McpServer).includes(parsed.data.domain)) {
    return NextResponse.json({ error: "That domain is not bound to this server's imported API endpoints." }, { status: 400 });
  }
  const challenge = `astrail-domain-verification=${randomBytes(24).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(challenge).digest("hex");
  const { data, error } = await admin.from("x402_domain_verifications").upsert({
    server_id: parsed.data.server_id,
    user_id: user.id,
    domain: parsed.data.domain,
    token_hash: tokenHash,
    status: "pending",
    verified_at: null,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "server_id,domain" })
    .select("id,domain,status,created_at,updated_at").single();
  if (error || !data) return NextResponse.json({ error: "Could not create domain challenge. Apply database/migrations/x402.sql first." }, { status: 503 });
  return NextResponse.json({
    verification: data,
    challenge: {
      url: `https://${parsed.data.domain}/.well-known/astrail-domain-verification.txt`,
      value: challenge,
      note: "Publish this exact value over HTTPS, then click Verify. A new challenge replaces the old one.",
    },
  });
}
