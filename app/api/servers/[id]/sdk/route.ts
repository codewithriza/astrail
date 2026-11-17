import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkBillingAllowance, recordBillingUsage } from "@/lib/billing/usage";
import { buildSdkTarGz } from "@/lib/sdk-archive";
import { buildSdkBundle } from "@/lib/sdk-export";
import { localDemoServers } from "@/lib/local-demo";
import { loadLocalPreviewServer } from "@/lib/local-preview-servers";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { ApiKey, McpServer } from "@/lib/types";

type ApiKeyRow = ApiKey & {
  key_hash: string;
};

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

async function validateServerApiKey(server: McpServer, rawKey: string | null) {
  if (!rawKey || !hasServiceRoleKey()) return false;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,user_id,name,key_hash,key_preview,last_used,created_at")
    .eq("user_id", server.user_id);

  if (error) return false;
  const matchingKey = ((data ?? []) as ApiKeyRow[]).find((key) => verifyApiKey(rawKey, key.key_hash));
  if (!matchingKey) return false;

  await admin
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", matchingKey.id);

  return true;
}

async function loadServerForSession(id: string) {
  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) {
    return { response: NextResponse.json({ error: "Unauthorized." }, { status: 401 }) };
  }

  const { data, error } = await neon
    .from("mcp_servers")
    .select("*")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();

  if (error || !data) {
    return { response: NextResponse.json({ error: "Server not found." }, { status: 404 }) };
  }

  return { server: data as McpServer };
}

function sdkBundleResponse(server: McpServer, request?: Request) {
  const bundle = buildSdkBundle(server);
  const format = request ? new URL(request.url).searchParams.get("format") : null;
  if (format === "tgz" || format === "tar.gz") {
    const archive = buildSdkTarGz(bundle);
    const filename = `${server.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "astrail"}-sdk.tar.gz`;
    return new NextResponse(archive, {
      headers: {
        "content-type": "application/gzip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  }
  return NextResponse.json(bundle);
}

async function buildMeteredSdkResponse(server: McpServer, request?: Request) {
  const billing = await checkBillingAllowance(server.user_id, "sdk_export");

  if (!billing.allowed) {
    return NextResponse.json({
      error: "Monthly SDK export credits reached.",
      billing: billing.summary,
      billingAction: {
        meter: billing.meter,
        creditCost: billing.cost,
      },
    }, { status: 402 });
  }

  const recorded = await recordBillingUsage({
    userId: server.user_id,
    meter: "sdk_export",
    serverId: server.id,
    toolName: "sdk_export",
    dedupePerPeriod: true,
  });

  if (!recorded) {
    console.warn("astrail.billing.sdk_export.record_failed", {
      serverId: server.id,
      userId: server.user_id,
    });
  }

  return sdkBundleResponse(server, request);
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    const server = (await loadLocalPreviewServer(params.id, request.url))
      ?? localDemoServers().find((item) => item.id === params.id);
    if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    return sdkBundleResponse(server, request);
  }

  if (hasServiceRoleKey()) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("mcp_servers")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Server not found." }, { status: 404 });
    }

    const server = data as McpServer;
    if (await validateServerApiKey(server, getBearerToken(request))) {
      return buildMeteredSdkResponse(server, request);
    }

    const sessionResult = await loadServerForSession(params.id);
    if (sessionResult.response) return sessionResult.response;
    return buildMeteredSdkResponse(sessionResult.server, request);
  }

  const sessionResult = await loadServerForSession(params.id);
  if (sessionResult.response) return sessionResult.response;
  return buildMeteredSdkResponse(sessionResult.server, request);
}
