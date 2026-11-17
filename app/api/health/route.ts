import { NextResponse } from "next/server";
import { validateRuntimeEnv } from "@/lib/env-validation";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import { hasServerNeonEnv } from "@/lib/neon/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();
const SCHEMA_PROBE_TTL_MS = 60_000;
let schemaProbeCache: { expiresAt: number; result: Awaited<ReturnType<typeof runRuntimeTableChecks>> } | null = null;
let schemaProbeInFlight: Promise<Awaited<ReturnType<typeof runRuntimeTableChecks>>> | null = null;

async function runRuntimeTableChecks() {
  if (!hasServiceRoleKey()) {
    return {
      status: "degraded",
      storage: "structured_log",
      note: "Persistent runtime storage is not enabled.",
    };
  }

  const admin = createAdminClient();
  const probes = [
    ["api_keys", "id,end_user_id,actor_role"],
    ["mcp_servers", "id,field_mappings,execution_policy,runtime_policy,schema_fingerprint,schema_checked_at,schema_drift_detected"],
    ["tool_call_logs", "id,trace_id,end_user_id,actor_role,api_key_id,client_name,credential_refs,arguments_redacted"],
    ["mcp_bundles", "id,hosted_endpoint,is_public"],
    ["mcp_bundle_servers", "bundle_id,server_id"],
    ["hosted_endpoint_slots", "user_id,slot,resource_kind,resource_id"],
    ["api_credentials", "id,security_scheme,security_binding,client_id,client_secret_ciphertext,connect_status,connect_state,pkce_verifier_ciphertext,end_user_id,access_token_ciphertext,refresh_token_ciphertext,revocation_status"],
    ["tool_approval_requests", "id,arguments_ciphertext,status,expires_at"],
    ["tool_execution_dedup", "id,idempotency_key,claim_token,lease_expires_at"],
    ["tool_schema_versions", "id,version,endpoint_map,diff"],
    ["webhook_endpoints", "id,secret_ciphertext,signature_header,event_id_header"],
    ["webhook_events", "id,event_id,payload,status"],
    ["integration_schema_versions", "id,fingerprint,change_summary"],
    ["integration_cost_events", "id,category,minutes,amount"],
    ["integration_cost_totals", "user_id,category,minutes,amount,events"],
    ["billing_webhook_events", "id,dodo_event_id,processing_result"],
    ["billing_subscriptions", "id,entitlement_status,paid_confirmed_at,dodo_last_event_id"],
    ["billing_payment_events", "id,dodo_event_id,dodo_payment_id,status"],
    ["billing_usage", "id,usage_type,quantity"],
    ["x402_domain_verifications", "id,domain,status"],
    ["x402_payment_challenges", "id,requirement_fingerprint,expires_at"],
    ["x402_payment_receipts", "id,payment_fingerprint,network,asset,amount,status"],
  ] as const;
  const checks = await Promise.all(probes.map(([table, column]) => admin.from(table).select(column).limit(1)));
  const missingCount = checks.filter(({ error }) => Boolean(error)).length;

  return {
    status: missingCount === 0 ? "ready" : "degraded",
    storage: missingCount === 0 ? "database_logs" : "structured_fallback",
    missing_count: missingCount,
    probe_count: probes.length,
  };
}

async function checkRuntimeTables() {
  const now = Date.now();
  if (schemaProbeCache && schemaProbeCache.expiresAt > now) return schemaProbeCache.result;
  if (schemaProbeInFlight) return schemaProbeInFlight;

  schemaProbeInFlight = runRuntimeTableChecks();
  try {
    const result = await schemaProbeInFlight;
    schemaProbeCache = { expiresAt: Date.now() + SCHEMA_PROBE_TTL_MS, result };
    return result;
  } finally {
    schemaProbeInFlight = null;
  }
}

function checkStatus(env: ReturnType<typeof validateRuntimeEnv>, name: string) {
  return env.checks.find((check) => check.name === name)?.status ?? "missing";
}

function checkNote(env: ReturnType<typeof validateRuntimeEnv>, name: string) {
  return env.checks.find((check) => check.name === name)?.note;
}

function mcpEdgeRateLimitStatus(env: ReturnType<typeof validateRuntimeEnv>) {
  const disabled = process.env.ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED === "true";
  const redisReady = checkStatus(env, "ASTRAIL_RATE_LIMIT_REDIS_REST_URL or UPSTASH_REDIS_REST_URL") === "ready"
    && checkStatus(env, "ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN or UPSTASH_REDIS_REST_TOKEN") === "ready";

  return {
    status: disabled ? "disabled" : redisReady ? "distributed" : "memory_fallback",
    distributed: redisReady,
    mode: process.env.RATE_LIMIT_MODE ?? "unset",
    max_body_bytes: process.env.ASTRAIL_MCP_EDGE_MAX_BODY_BYTES ?? "256000",
  };
}

function edgeProtectionStatus(env: ReturnType<typeof validateRuntimeEnv>) {
  const checks = {
    provider: checkStatus(env, "ASTRAIL_EDGE_PROVIDER"),
    ddos: checkStatus(env, "ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED"),
    waf: checkStatus(env, "ASTRAIL_EDGE_WAF_CONFIRMED"),
    bot_protection: checkStatus(env, "ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED"),
    body_size_limit: checkStatus(env, "ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED"),
  };
  const ready = Object.values(checks).every((status) => status === "ready");

  return {
    status: ready ? "ready" : "degraded",
    ...checks,
    provider_name: checkNote(env, "ASTRAIL_EDGE_PROVIDER"),
  };
}

export async function GET() {
  const env = validateRuntimeEnv();
  const schema = await checkRuntimeTables();
  const previewMode = !hasServerNeonEnv();
  const ready = env.status === "ready" && schema.status === "ready";

  return NextResponse.json({
    status: ready ? "ready" : previewMode ? "preview" : "degraded",
    runtime: "nextjs-hosted-mcp-gateway",
    protocol_version: "2024-11-05",
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    rate_limit_mode: process.env.RATE_LIMIT_MODE ? "configured" : "standard",
    mcp_edge_rate_limit: mcpEdgeRateLimitStatus(env),
    edge_protection: edgeProtectionStatus(env),
    config: { status: env.status },
    schema,
    timestamp: new Date().toISOString(),
  }, {
    status: ready || previewMode ? 200 : 503,
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
    },
  });
}
