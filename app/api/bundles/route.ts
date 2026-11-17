import { NextResponse } from "next/server";
import { checkHostedEndpointAllowance, getBillingUsageSummary, hostedEndpointLimitPayload, isHostedEndpointLimitError } from "@/lib/billing/usage";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient } from "@/lib/neon/server";
import { buildBundleEndpoint } from "@/lib/urls";

type CreateBundleBody = {
  name?: string;
  serverIds?: string[];
};

export async function POST(request: Request) {
  if (!hasServerNeonEnv()) {
    let body: CreateBundleBody;
    try {
      body = (await request.json()) as CreateBundleBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const name = body.name?.trim();
    const serverIds = Array.isArray(body.serverIds)
      ? Array.from(new Set(body.serverIds.filter((id) => typeof id === "string" && id.length > 0)))
      : [];

    if (!name) return NextResponse.json({ error: "Bundle name is required." }, { status: 400 });
    if (serverIds.length === 0) return NextResponse.json({ error: "Select at least one server." }, { status: 400 });

    return NextResponse.json({
      bundle: {
        id: "local-work-stack",
        name,
        hosted_endpoint: "/api/mcp/bundles/local-work-stack",
        is_public: false,
        created_at: new Date().toISOString(),
        preview: true,
      },
    });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: CreateBundleBody;
  try {
    body = (await request.json()) as CreateBundleBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = body.name?.trim();
  const serverIds = Array.isArray(body.serverIds)
    ? Array.from(new Set(body.serverIds.filter((id) => typeof id === "string" && id.length > 0)))
    : [];

  if (!name) return NextResponse.json({ error: "Bundle name is required." }, { status: 400 });
  if (serverIds.length === 0) return NextResponse.json({ error: "Select at least one server." }, { status: 400 });

  const endpointAllowance = await checkHostedEndpointAllowance(userData.user.id);
  if (!endpointAllowance.allowed) {
    if (endpointAllowance.reason === "unavailable") {
      return NextResponse.json({ error: "Hosted endpoint capacity is temporarily unavailable. Retry shortly." }, { status: 503 });
    }
    return NextResponse.json(hostedEndpointLimitPayload(endpointAllowance.summary), { status: 402 });
  }

  const admin = createAdminClient();
  const { data: ownedServers, error: serverError } = await admin
    .from("mcp_servers")
    .select("id")
    .eq("user_id", userData.user.id)
    .in("id", serverIds);

  if (serverError) return NextResponse.json({ error: serverError.message }, { status: 500 });

  const ownedIds = (ownedServers ?? []).map((server) => server.id);
  if (ownedIds.length !== serverIds.length) {
    return NextResponse.json({ error: "One or more selected servers are not in your gateway." }, { status: 400 });
  }

  const { data: bundle, error: bundleError } = await admin
    .from("mcp_bundles")
    .insert({
      user_id: userData.user.id,
      name,
      is_public: false,
    })
    .select("id,name,hosted_endpoint,is_public,created_at")
    .single();

  if (bundleError || !bundle) {
    return NextResponse.json({ error: bundleError?.message ?? "Could not create bundle." }, { status: 500 });
  }

  const endpoint = buildBundleEndpoint(bundle.id, request.url);
  const { error: endpointError } = await admin
    .from("mcp_bundles")
    .update({ hosted_endpoint: endpoint })
    .eq("id", bundle.id);
  if (endpointError) {
    const { error: cleanupError } = await admin.from("mcp_bundles").delete().eq("id", bundle.id);
    if (cleanupError) {
      return NextResponse.json({ error: "Bundle creation failed and automatic cleanup could not complete." }, { status: 500 });
    }
    if (isHostedEndpointLimitError(endpointError)) {
      const summary = await getBillingUsageSummary(userData.user.id);
      return NextResponse.json(hostedEndpointLimitPayload(summary), { status: 402 });
    }
    return NextResponse.json({ error: endpointError.message }, { status: 500 });
  }

  const { error: linkError } = await admin
    .from("mcp_bundle_servers")
    .insert(ownedIds.map((serverId) => ({ bundle_id: bundle.id, server_id: serverId })));

  if (linkError) {
    const { error: cleanupError } = await admin.from("mcp_bundles").delete().eq("id", bundle.id);
    if (cleanupError) {
      return NextResponse.json({ error: "Bundle links failed and automatic cleanup could not complete." }, { status: 500 });
    }
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ bundle: { ...bundle, hosted_endpoint: endpoint } });
}
