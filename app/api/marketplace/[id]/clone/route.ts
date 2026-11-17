import { NextResponse } from "next/server";
import { checkHostedEndpointAllowance, getBillingUsageSummary, hostedEndpointLimitPayload, isHostedEndpointLimitError } from "@/lib/billing/usage";
import { findPresetServer } from "@/lib/preset-servers";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import { buildMcpEndpoint } from "@/lib/urls";
import { previewApiKey, verifyApiKey } from "@/lib/api-keys";

export const runtime = "nodejs";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

async function authenticatedUserId(request: Request) {
  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (userData.user) return userData.user.id;

  const rawKey = bearerToken(request);
  if (!rawKey?.startsWith("ag_")) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("api_keys")
    .select("id,user_id,key_hash")
    .eq("key_preview", previewApiKey(rawKey))
    .limit(10);
  if (error) return null;
  const match = (data ?? []).find((row) => typeof row.key_hash === "string" && verifyApiKey(rawKey, row.key_hash));
  if (!match) return null;
  await admin.from("api_keys").update({ last_used: new Date().toISOString() }).eq("id", match.id);
  return match.user_id as string;
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    const source = findPresetServer(params.id);
    if (!source) return NextResponse.json({ error: "Public MCP server not found." }, { status: 404 });
    return NextResponse.json({
      id: source.id,
      hosted_endpoint: `/api/mcp/${source.id}`,
      preview: true,
    });
  }

  const userId = await authenticatedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const endpointAllowance = await checkHostedEndpointAllowance(userId);
  if (!endpointAllowance.allowed) {
    if (endpointAllowance.reason === "unavailable") {
      return NextResponse.json({ error: "Hosted endpoint capacity is temporarily unavailable. Retry shortly." }, { status: 503 });
    }
    return NextResponse.json(hostedEndpointLimitPayload(endpointAllowance.summary), { status: 402 });
  }

  const admin = createAdminClient();
  const source = findPresetServer(params.id);
  if (!source) return NextResponse.json({ error: "Public MCP server not found." }, { status: 404 });

  const { data: inserted, error: insertError } = await admin
    .from("mcp_servers")
    .insert({
      user_id: userId,
      name: source.name,
      description: source.description,
      source_url: source.source_url,
      source_type: "preset",
      generated_code: source.generated_code,
      tools_json: source.tools_json ?? [],
      endpoint_map: source.endpoint_map ?? [],
      runtime_policy: source.runtime_policy ?? null,
      execution_policy: source.execution_policy ?? null,
      diagnostics: source.diagnostics ?? {
        warnings: ["Cloned from Astrail endpoint catalog."],
      },
      status: (source.endpoint_map?.length ?? 0) > 0 ? "live" : source.status === "preset" ? "preset" : "live",
      validation_status: source.validation_status ?? "passed",
      generation_status: source.generation_status ?? "completed",
      is_public: false,
      call_count: 0,
      generation_version: typeof source.generation_version === "number" ? source.generation_version : 1,
      protocol_version: source.protocol_version ?? "2024-11-05",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Could not add server." }, { status: 500 });
  }

  const hostedEndpoint = buildMcpEndpoint(inserted.id, request.url);
  const { error: endpointError } = await admin
    .from("mcp_servers")
    .update({ hosted_endpoint: hostedEndpoint })
    .eq("id", inserted.id);
  if (endpointError) {
    const { error: cleanupError } = await admin.from("mcp_servers").delete().eq("id", inserted.id);
    if (cleanupError) {
      return NextResponse.json({ error: "Marketplace clone failed and automatic cleanup could not complete." }, { status: 500 });
    }
    if (isHostedEndpointLimitError(endpointError)) {
      const summary = await getBillingUsageSummary(userId);
      return NextResponse.json(hostedEndpointLimitPayload(summary), { status: 402 });
    }
    return NextResponse.json({ error: endpointError.message }, { status: 500 });
  }

  return NextResponse.json({ id: inserted.id, hosted_endpoint: hostedEndpoint });
}
