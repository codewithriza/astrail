import { NextResponse } from "next/server";
import { z } from "zod";
import { localDemoServers, updateLocalDemoServer } from "@/lib/local-demo";
import { loadLocalPreviewServer } from "@/lib/local-preview-servers";
import { findEndpointForTool } from "@/lib/runtime/execute-tool";
import { normalizeFieldMappings } from "@/lib/runtime/field-mapping";
import { redactSensitive, visibleEndpointsForRequest, visibleToolsForRequest } from "@/lib/runtime/permissions";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer, McpTool } from "@/lib/types";
import { resolveMcpEndpoint } from "@/lib/urls";

export const runtime = "nodejs";

const RuntimePermissionPatternSchema = z.union([
  z.string().min(1).max(240),
  z.object({
    pattern: z.string().min(1).max(240),
    regex: z.boolean().optional(),
    match: z.enum(["sdk_method", "endpoint_id", "tool_name", "operation_id", "method_path", "resource", "tag", "path", "http_method"]).optional(),
    note: z.string().max(1000).optional(),
  }).strict(),
]);

const RuntimePolicySchema = z.object({
  business_context: z.string().trim().max(4000).optional(),
  argument_retention: z.enum(["none","keys_only","redacted"]).optional(),
  allow_http_gets: z.boolean().optional(),
  read_only: z.boolean().optional(),
  allowed_actions: z.array(z.enum(["read", "draft", "write", "send", "destructive"])).max(5).optional(),
  blocked_actions: z.array(z.enum(["read", "draft", "write", "send", "destructive"])).max(5).optional(),
  allowed_methods: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  blocked_methods: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  allowed_resources: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  blocked_resources: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  roles: z.record(z.string().min(1).max(64), z.object({
    max_action_level: z.enum(["read", "draft", "write", "send", "destructive"]).optional(),
    allowed_tools: z.array(z.string().min(1).max(240)).max(500).optional(),
    blocked_tools: z.array(z.string().min(1).max(240)).max(500).optional(),
    note: z.string().max(1000).optional(),
  }).strict()).optional(),
  x402: z.object({
    enabled: z.boolean().optional(),
    allowed_networks: z.array(z.string().trim().min(1).max(120)).max(32).optional(),
    allowed_assets: z.array(z.string().trim().min(1).max(240)).min(1).max(32).optional(),
    max_amount_per_call: z.string().regex(/^\d{1,78}$/).nullable().optional(),
    daily_limit: z.string().regex(/^\d{1,78}$/).nullable().optional(),
    approval_threshold: z.string().regex(/^\d{1,78}$/).nullable().optional(),
    require_domain_verification: z.literal(true).optional(),
  }).strict().superRefine((policy, context) => {
    if (policy.enabled === true && (!policy.allowed_assets || policy.allowed_assets.length === 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowed_assets"], message: "At least one exact x402 asset is required." });
    }
    if (policy.enabled === true && !policy.max_amount_per_call) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["max_amount_per_call"], message: "A per-call x402 limit is required." });
    }
    if (policy.enabled === true && !policy.daily_limit) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["daily_limit"], message: "A daily x402 limit is required." });
    }
  }).optional(),
}).strict();

const UpdateServerSchema = z.object({
  is_public: z.boolean().optional(),
  business_context: z.string().trim().max(4000).nullable().optional(),
  tools_json: z.array(z.object({
    name: z.string().min(1).max(240),
    description: z.string().min(1).max(4000),
    enabled: z.boolean().optional(),
    input_schema: z.record(z.string(), z.unknown()).optional(),
    method: z.string().optional(),
    path: z.string().optional(),
    policy: z.enum(["allow", "approval", "block"]).optional(),
    x_astrail: z.object({
      business_context: z.string().trim().max(1200).optional(),
      use_when: z.string().trim().max(600).optional(),
      avoid_when: z.string().trim().max(600).optional(),
      edge_case_notes: z.string().trim().max(1200).optional(),
    }).passthrough().optional(),
  }).passthrough()).max(1000).optional(),
  field_mappings: z.unknown().optional(),
  execution_policy: z.object({
    max_attempts: z.number().int().min(1).max(4).optional(),
    timeout_ms: z.number().int().min(1000).max(30000).optional(),
    base_delay_ms: z.number().int().min(0).max(2000).optional(),
    retry_statuses: z.array(z.number().int().refine((status) => status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599), "Only timeout, rate-limit, and server-error statuses can be retried.")).max(30).optional(),
    retry_writes: z.boolean().optional(),
    idempotency_header: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/i).optional(),
  }).strict().optional(),
  runtime_policy: RuntimePolicySchema.optional(),
  runtime_policy_patch: RuntimePolicySchema.optional(),
}).strict();

function mergeBusinessContext(
  policy: McpServer["runtime_policy"],
  businessContext: string | null
) {
  const next = { ...(policy ?? {}) };
  if (businessContext) next.business_context = businessContext;
  else delete next.business_context;
  return next;
}

function publicServerDto(server: McpServer) {
  const tools = visibleToolsForRequest(server, server.tools_json ?? [], findEndpointForTool);
  return redactSensitive({
    id: server.id,
    name: server.name,
    description: server.description,
    source_url: server.source_url,
    source_type: server.source_type,
    category: server.category ?? null,
    tools_json: tools,
    endpoint_map: visibleEndpointsForRequest(server),
    status: server.status ?? null,
    validation_status: server.validation_status ?? null,
    generation_status: server.generation_status ?? null,
    is_public: server.is_public,
    hosted_endpoint: resolveMcpEndpoint(server.id, server.hosted_endpoint),
    call_count: server.call_count,
    generation_version: server.generation_version ?? null,
    protocol_version: server.protocol_version ?? null,
    created_at: server.created_at,
  });
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    const server = (await loadLocalPreviewServer(params.id, request.url))
      ?? localDemoServers().find((item) => item.id === params.id);
    if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    return NextResponse.json({ server: server.is_public ? publicServerDto(server) : server });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  const db = await createDataClient();

  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Server not found." }, { status: 404 });
  }

  const server = data as McpServer;
  const isOwner = server.user_id === userData.user?.id;
  if (!server.is_public && !isOwner) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  return NextResponse.json({ server: isOwner ? server : publicServerDto(server) });
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    const parsed = UpdateServerSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid server update.", details: parsed.error.flatten() }, { status: 400 });
    const body = parsed.data;
    const existing = (await loadLocalPreviewServer(params.id, request.url))
      ?? localDemoServers().find((item) => item.id === params.id);
    if (!existing) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    let runtimePolicy = body.runtime_policy;
    if (body.runtime_policy_patch) {
      runtimePolicy = { ...(runtimePolicy ?? existing.runtime_policy ?? {}), ...body.runtime_policy_patch };
    }
    if (body.business_context !== undefined) {
      runtimePolicy = mergeBusinessContext(runtimePolicy ?? existing.runtime_policy, body.business_context);
    }
    const server = updateLocalDemoServer(params.id, {
      ...(typeof body.is_public === "boolean" ? { is_public: body.is_public } : {}),
      ...(body.tools_json ? { tools_json: body.tools_json as McpTool[] } : {}),
      ...("field_mappings" in body ? { field_mappings: body.field_mappings === null ? null : normalizeFieldMappings(body.field_mappings) } : {}),
      ...(body.execution_policy ? { execution_policy: body.execution_policy } : {}),
      ...(runtimePolicy ? { runtime_policy: runtimePolicy } : {}),
    });
    if (!server) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    return NextResponse.json({
      server,
      preview: true,
    });
  }

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();

  if (!userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const parsed = UpdateServerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid server update.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const db = await createDataClient();
  const updatePayload: Record<string, unknown> = {};

  if (typeof body.is_public === "boolean") updatePayload.is_public = body.is_public;
  if (body.tools_json) {
    updatePayload.tools_json = body.tools_json;
    updatePayload.generation_version = Date.now();
  }
  if ("field_mappings" in body) {
    if (body.field_mappings === null) {
      updatePayload.field_mappings = null;
    } else {
      const normalized = normalizeFieldMappings(body.field_mappings);
      if (!normalized) {
        return NextResponse.json({
          error: "field_mappings must contain at least one valid rule. Argument rules need an \"argument\" name; response rules need a \"field\" path.",
        }, { status: 400 });
      }
      updatePayload.field_mappings = normalized;
    }
  }
  if (body.execution_policy) updatePayload.execution_policy = body.execution_policy;
  let runtimePolicy = body.runtime_policy;
  let runtimePolicySnapshot: McpServer["runtime_policy"] | null | undefined;
  if (body.runtime_policy_patch || (body.business_context !== undefined && !runtimePolicy)) {
    const { data: current, error: currentError } = await db
      .from("mcp_servers")
      .select("runtime_policy")
      .eq("id", params.id)
      .eq("user_id", userData.user.id)
      .single();
    if (currentError || !current) return NextResponse.json({ error: "Server not found." }, { status: 404 });
    runtimePolicySnapshot = (current as Pick<McpServer, "runtime_policy">).runtime_policy ?? null;
    runtimePolicy = { ...(runtimePolicy ?? runtimePolicySnapshot ?? {}), ...(body.runtime_policy_patch ?? {}) };
  }
  if (body.business_context !== undefined) {
    runtimePolicy = mergeBusinessContext(runtimePolicy, body.business_context);
  }
  if (runtimePolicy) updatePayload.runtime_policy = runtimePolicy;

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: "No supported updates provided." }, { status: 400 });
  }

  let updateQuery = db
    .from("mcp_servers")
    .update(updatePayload)
    .eq("id", params.id)
    .eq("user_id", userData.user.id);
  if (runtimePolicySnapshot !== undefined) {
    updateQuery = runtimePolicySnapshot === null
      ? updateQuery.is("runtime_policy", null)
      : updateQuery.filter("runtime_policy", "eq", JSON.stringify(runtimePolicySnapshot));
  }
  const { data, error } = await updateQuery
    .select("*")
    .maybeSingle();

  if (!error && !data && runtimePolicySnapshot !== undefined) {
    return NextResponse.json({ error: "Runtime policy changed. Refresh and retry." }, { status: 409 });
  }
  if (error || !data) {
    return NextResponse.json({ error: "Could not update server." }, { status: 400 });
  }

  return NextResponse.json({ server: data as McpServer });
}
