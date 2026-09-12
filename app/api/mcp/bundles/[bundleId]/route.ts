import { NextResponse } from "next/server";
import { configuredCorsOrigins } from "@/lib/cors-origins";
import { normalizeOrigin, requestOrigin } from "@/lib/origin-policy";
import { verifyApiKey } from "@/lib/api-keys";
import { defaultToolPolicy } from "@/lib/agent-tool-profile";
import { agentFacingToolDescription } from "@/lib/tool-governance";
import { checkBillingAllowance } from "@/lib/billing/usage";
import { executeToolFromEndpointMap, type RuntimeCredential, type ToolExecutionResult } from "@/lib/runtime/execute-tool";
import { findEndpointForTool } from "@/lib/runtime/execute-tool";
import { auditMcpSecurityEvent, redactedArgumentsForLog, sanitizeToolLogRecord, summarizeToolExecution, writeStructuredLog } from "@/lib/runtime/observability";
import { shouldPersistRateLimitAudit } from "@/lib/runtime/rate-limit-audit";
import { endpointRequiresAuth, evaluateRuntimePermission, normalizeActorRole, redactSensitive, visibleToolsForRequest } from "@/lib/runtime/permissions";
import { checkRuntimeRateLimit } from "@/lib/runtime/rate-limit";
import { isolateBatchItem } from "@/lib/runtime/batch";
import { loadRuntimeCredentialResultForTool, normalizeEndUserId } from "@/lib/runtime/credential-loader";
import { claimToolExecution, extractIdempotencyKey, findRecordedToolExecution, idempotencyAuthorizationFingerprint, recordToolExecution, releaseToolExecutionClaim, replayedExecutionResult, scopeIdempotencyKey, toolExecutionKeyExists } from "@/lib/runtime/idempotency";
import { createToolApprovalRequest, loadApprovedToolRequest, markToolApprovalExecuted, type ToolApprovalRequest } from "@/lib/runtime/tool-approvals";
import { splitX402ApprovalContext, withX402ApprovalContext, type X402Requirement } from "@/lib/runtime/x402";
import { validateToolInput } from "@/lib/runtime/tool-input-validation";
import { localDemoServers, localDemoUserId } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { ApiKey, CredentialAuditRef, McpServer, McpTool } from "@/lib/types";
import { bearerChallenge, validateMcpAccessToken, validateMcpTokenClaims } from "@/lib/mcp-oauth-resource";

export const runtime = "nodejs";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: unknown;
    execution_id?: string;
  };
};

type JsonRpcErrorData = {
  reason: string;
  status: number;
  trace_id: string;
};

type JsonRpcResponsePayload = {
  jsonrpc: "2.0";
  id: JsonRpcRequest["id"];
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: JsonRpcErrorData;
  };
};

type JsonRpcHandlerResult = {
  payload: JsonRpcResponsePayload | null;
  status: number;
};

type JsonRpcEnvelopeError = {
  id: JsonRpcRequest["id"];
  code: number;
  message: string;
  status: number;
  reason: string;
  batchSize?: number;
};

type Bundle = {
  id: string;
  user_id: string;
  name: string;
  is_public: boolean;
};

type ApiKeyRow = ApiKey & {
  key_hash: string;
};

type BundleAuthorization = {
  endUserId: string | null;
  actorRole: string | null;
  allowHeaderContext: boolean;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPreview: string | null;
  readOnly: boolean;
};

type BundleCallerContext = Omit<BundleAuthorization, "allowHeaderContext"> & { clientName: string | null; x402PaymentSignature: string | null };
type BundleLogContext = BundleCallerContext & { args?: Record<string, unknown> | null; credentialRefs: CredentialAuditRef[] };
const anonymousBundleCaller: BundleCallerContext = { endUserId: null, actorRole: null, apiKeyId: null, apiKeyName: null, apiKeyPreview: null, readOnly: false, clientName: null, x402PaymentSignature: null };

function rememberBundleCredential(context: BundleLogContext, credential: RuntimeCredential | null) {
  const ref = credential?.auditRef;
  if (ref && !context.credentialRefs.some((item) => item.id === ref.id)) context.credentialRefs.push(ref);
}

type LoadedBundle =
  | { bundle: Bundle; servers: McpServer[] }
  | { error: string };

const MAX_JSON_RPC_BYTES = 256_000;
const MAX_JSON_RPC_BATCH = 20;
const MAX_JSON_RPC_ID_CHARS = 256;

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const configured = configuredCorsOrigins();
  const allowAny = configured.length === 0 || configured.includes("*");
  const sameOrigin = origin
    && normalizeOrigin(origin) === requestOrigin(request.headers, request.url);
  const allowOrigin = origin && (sameOrigin || allowAny || configured.includes(origin))
    ? origin
    : allowAny
      ? "*"
      : configured[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, payment-signature, x-payment, x-astrail-client, x-astrail-end-user, x-astrail-actor-role",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function jsonRpcPayload(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponsePayload {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function jsonRpcErrorPayload(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: JsonRpcErrorData
): JsonRpcResponsePayload {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function jsonWithCors(request: Request, payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: corsHeaders(request) });
}

function jsonRpc(request: Request, id: JsonRpcRequest["id"], result: unknown, status = 200) {
  return jsonWithCors(request, jsonRpcPayload(id, result), status);
}

function jsonRpcError(
  request: Request,
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status = 400,
  data?: JsonRpcErrorData
) {
  return jsonWithCors(request, jsonRpcErrorPayload(id, code, message, data), status);
}

function auditErrorData(event: ReturnType<typeof auditMcpSecurityEvent>, status: number, reason: string) {
  return {
    reason,
    status,
    trace_id: event.trace_id,
  };
}

function jsonRpcProtocolError(
  bundle: Bundle,
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status: number,
  reason: string
): JsonRpcHandlerResult {
  const audit = auditMcpSecurityEvent({
    route: "mcp_bundle",
    bundle_id: bundle.id,
    reason,
    status,
  });
  return { payload: jsonRpcErrorPayload(id, code, message, auditErrorData(audit, status, reason)), status };
}

function isJsonRpcRequestId(value: unknown): value is JsonRpcRequest["id"] {
  if (value === null) return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length <= MAX_JSON_RPC_ID_CHARS;
}

function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonRpcRequestId(value: unknown): JsonRpcRequest["id"] {
  if (!isJsonRpcRequest(value)) return null;
  const id = (value as { id?: unknown }).id;
  return isJsonRpcRequestId(id) ? id ?? null : null;
}

function hasInvalidJsonRpcId(value: unknown) {
  if (!isJsonRpcRequest(value)) return false;
  const id = (value as { id?: unknown }).id;
  return id !== undefined && !isJsonRpcRequestId(id);
}

function validateJsonRpcEnvelope(body: unknown): JsonRpcEnvelopeError | null {
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return {
        id: null,
        code: -32600,
        message: "JSON-RPC batch must contain at least one request.",
        status: 400,
        reason: "empty_batch",
        batchSize: body.length,
      };
    }
    if (body.length > MAX_JSON_RPC_BATCH) {
      return {
        id: null,
        code: -32014,
        message: "JSON-RPC batch is limited to 20 requests.",
        status: 413,
        reason: "batch_too_large",
        batchSize: body.length,
      };
    }
    return null;
  }

  if (!isJsonRpcRequest(body) || hasInvalidJsonRpcId(body)) {
    return {
      id: null,
      code: -32600,
      message: "Invalid JSON-RPC request.",
      status: 400,
      reason: "invalid_json_rpc_request",
    };
  }

  return null;
}

function jsonRpcPreloadProtocolError(request: Request, bundleId: string, error: JsonRpcEnvelopeError) {
  const audit = auditMcpSecurityEvent({
    route: "mcp_bundle",
    bundle_id: bundleId,
    reason: error.reason,
    status: error.status,
    ...(error.batchSize !== undefined ? { batch_size: error.batchSize } : {}),
  });
  return jsonRpcError(
    request,
    error.id,
    error.code,
    error.message,
    error.status,
    auditErrorData(audit, error.status, error.reason)
  );
}

function firstRequestId(value: unknown): JsonRpcRequest["id"] {
  if (Array.isArray(value)) {
    const first = value.find(isJsonRpcRequest);
    return jsonRpcRequestId(first);
  }
  return jsonRpcRequestId(value);
}

function requestPayloadTooLarge(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(length) && length > MAX_JSON_RPC_BYTES;
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bundleToolName(server: McpServer, tool: McpTool) {
  const prefix = server.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || server.id;
  return `${prefix}__${tool.name}`;
}

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

function toolsVisibleToBundle(server: McpServer) {
  return visibleToolsForRequest(server, server.tools_json ?? [], findEndpointForTool);
}

function bundledToolListItem(server: McpServer, tool: McpTool) {
  const endpoint = findEndpointForTool(server, tool);
  return redactSensitive({
    name: bundleToolName(server, tool),
    description: `${server.name}: ${agentFacingToolDescription(tool, server.runtime_policy?.business_context)}`,
    inputSchema: tool.input_schema ?? { type: "object", properties: {} },
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    _meta: { astrail: {
      ...(tool.x_astrail ?? {}),
      source_server_id: server.id,
      policy: tool.policy ?? endpoint?.policy ?? defaultToolPolicy(tool, endpoint ?? undefined),
      x402_enabled: server.runtime_policy?.x402?.enabled === true,
    } },
  });
}

function createRuntimeTraceId() {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function billingRequiredResult(
  bundledToolName: string,
  tool: McpTool,
  summary: Awaited<ReturnType<typeof checkBillingAllowance>>["summary"]
): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "billing_required",
          error_code: "monthly_billing_limit_reached",
          tool: bundledToolName,
          source_tool: tool.name,
          note: "This workspace has reached its monthly credits or tool call limit. Upgrade the billing plan or wait for the next billing period.",
          billing: {
            plan: summary.plan,
            credits_used: summary.creditsUsed,
            credit_limit: summary.creditLimit,
            credit_cost: summary.meterCosts.tool_call,
            used: summary.used,
            limit: summary.limit,
            current_period_end: summary.currentPeriodEnd,
          },
          runtime: {
            execution_mode: "billing_required",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "billing_required",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "billing_required",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "monthly_billing_limit_reached",
    error: "Monthly billing limit reached.",
  };
}

function bundleIdempotencyInProgressResult(toolName: string, key: string): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  const payload = {
    status: "error",
    error_code: "idempotency_in_progress",
    tool: toolName,
    idempotency_key: key,
    note: "Another request with this idempotency key is still executing. Retry shortly to receive its stored result.",
    runtime: { execution_mode: "idempotency_wait", trace_id: traceId, error_code: "idempotency_in_progress" },
  };
  return {
    mcpResult: { isError: true, content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] },
    status: "error", latencyMs: 0, method: null, path: null, executionMode: "safe_rest_execution",
    upstreamStatus: null, traceId, attemptCount: 0, errorCode: "idempotency_in_progress", error: "A matching execution is in progress.",
  };
}

function bundleIdempotencyUnavailableResult(toolName: string, key: string, inDoubt: boolean): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  const errorCode = inDoubt ? "idempotency_in_doubt" : "idempotency_storage_unavailable";
  const note = inDoubt
    ? "A previous write may have reached the provider. Astrail blocked a repeat until an operator reconciles the original action."
    : "Durable idempotency storage is unavailable. Astrail blocked this write instead of risking duplicate execution.";
  return {
    mcpResult: { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", error_code: errorCode, tool: toolName, idempotency_key: key, note, runtime: { execution_mode: "idempotency_blocked", trace_id: traceId, error_code: errorCode } }, null, 2) }] },
    status: "error", latencyMs: 0, method: null, path: null, executionMode: "safe_rest_execution",
    upstreamStatus: null, traceId, attemptCount: 0, errorCode, error: note,
  };
}

function permissionDeniedExecutionResult(tool: McpTool): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "permission_denied",
          error_code: "permission_denied",
          tool: tool.name,
          note: "This bundled tool is not exposed by the public MCP policy.",
          runtime: {
            execution_mode: "permission_denied",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "permission_denied",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "permission_denied",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "permission_denied",
    error: "This bundled tool is not exposed by the public MCP policy.",
  };
}

function approvalRequiredExecutionResult(tool: McpTool, approval: ToolApprovalRequest): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        status: "approval_required",
        error_code: "human_approval_required",
        tool: tool.name,
        execution_id: approval.id,
        approval_url: "/dashboard/approvals",
        expires_at: approval.expires_at,
        resume: { method: "astrail/resume", params: { execution_id: approval.id } },
        note: "Astrail paused this bundled call before billing, credential injection, or upstream execution.",
        runtime: { execution_mode: "approval_required", trace_id: traceId },
      }, null, 2) }],
    },
    status: "approval_required",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "approval_required",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "human_approval_required",
    error: "Human approval is required before this tool can execute.",
  };
}

function x402ApprovalRequiredExecutionResult(tool: McpTool, approval: ToolApprovalRequest, requirement: X402Requirement): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        status: "approval_required",
        error_code: "x402_approval_required",
        tool: tool.name,
        payment: requirement,
        execution_id: approval.id,
        approval_url: "/dashboard/approvals",
        expires_at: approval.expires_at,
        resume: { method: "astrail/resume", params: { execution_id: approval.id } },
        required_header: "PAYMENT-SIGNATURE",
        note: "Approve this exact payment, sign it in the end user's wallet, then resume with PAYMENT-SIGNATURE. Astrail never holds wallet keys or funds.",
        runtime: { execution_mode: "approval_required", trace_id: traceId },
      }, null, 2) }],
    },
    status: "approval_required",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "approval_required",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "x402_approval_required",
    error: "Human approval is required before this x402 payment can execute.",
  };
}

function approvalResumeFailure(executionId: unknown, code: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({
      status: "error",
      error_code: code,
      execution_id: typeof executionId === "string" ? executionId : null,
      note: code === "approval_pending"
        ? "Approve or deny this execution in the Astrail dashboard before resuming."
        : "This approval cannot be resumed. It may be missing, denied, expired, already executed, or unavailable.",
    }, null, 2) }],
  };
}

function bundleApprovalStorageUnavailableExecutionResult(tool: McpTool): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: approvalResumeFailure(null, "approval_storage_unavailable"),
    status: "error",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "approval_storage_unavailable",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "approval_storage_unavailable",
    error: "Astrail could not persist the approval request.",
  };
}

function bundleRateLimitedExecutionResult(name: string, tool: McpTool, resetAt: string, traceId: string): ToolExecutionResult {
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error_code: "rate_limited",
          tool: name,
          reset_at: resetAt,
          runtime: { execution_mode: "rate_limited", trace_id: traceId, error_code: "rate_limited" },
        }, null, 2),
      }],
    },
    status: "rate_limited",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "rate_limited",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "rate_limited",
    error: "Runtime rate limit exceeded.",
  };
}

function inputValidationFailedResult(tool: McpTool, issues: unknown[]): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "validation_failed",
          error_code: "invalid_tool_arguments",
          tool: tool.name,
          issues,
          expected_schema: tool.input_schema ?? { type: "object", properties: {} },
          note: "The bundled tool was not executed. Fix arguments to match inputSchema, then retry tools/call.",
          runtime: {
            execution_mode: "validation_failed",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "validation_failed",
    latencyMs: 0,
    method: tool.method ?? null,
    path: tool.path ?? null,
    executionMode: "validation_failed",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "invalid_tool_arguments",
    error: "Invalid bundled tool arguments.",
  };
}

function bundleAllowsAnonymousAccess(bundle: Bundle, servers: McpServer[]) {
  return bundle.is_public && servers.every((server) => server.is_public);
}

async function validateBundleApiKey(bundle: Bundle, servers: McpServer[], rawKey: string | null) {
  if (bundle.user_id === "local-preview" && process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES !== "1") return { ...anonymousBundleCaller, allowHeaderContext: false } satisfies BundleAuthorization;
  if (bundleAllowsAnonymousAccess(bundle, servers) && !rawKey) return { ...anonymousBundleCaller, allowHeaderContext: false } satisfies BundleAuthorization;
  if (!rawKey) return null;
  if (bundle.user_id === localDemoUserId && process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1") {
    const endUserId = normalizeEndUserId(process.env.ASTRAIL_LOCAL_MCP_END_USER_ID);
    const actorRole = normalizeActorRole(process.env.ASTRAIL_LOCAL_MCP_ACTOR_ROLE);
    return rawKey === (process.env.ASTRAIL_LOCAL_MCP_API_KEY ?? "ag_demo_secret")
      ? { endUserId, actorRole, allowHeaderContext: !endUserId && !actorRole, apiKeyId: "local-fixture", apiKeyName: "Local fixture", apiKeyPreview: "ag_demo…", readOnly: false } satisfies BundleAuthorization
      : null;
  }
  if (bundle.user_id === "local-preview") return { ...anonymousBundleCaller, allowHeaderContext: false } satisfies BundleAuthorization;
  if (!hasServiceRoleKey()) return null;

  const { data, error } = await createAdminClient()
    .from("api_keys")
    .select("id,user_id,name,key_hash,key_preview,end_user_id,actor_role,last_used,created_at,workspace_id,agent_policy")
    .eq("user_id", bundle.user_id);

  if (error) return null;
  const matchingKey = ((data ?? []) as (ApiKeyRow & { workspace_id?: string | null; agent_policy?: { read_only?: boolean; allowed_actions?: string[] } | null })[]).find((key) => verifyApiKey(rawKey, key.key_hash));
  if (!matchingKey) return null;

  if (matchingKey.workspace_id) {
    const { data: workspace } = await createAdminClient().from("workspaces").select("bundle_id,status").eq("id", matchingKey.workspace_id).eq("user_id", bundle.user_id).maybeSingle();
    if (!workspace || workspace.status !== "active" || workspace.bundle_id !== bundle.id) return null;
  }

  await createAdminClient()
    .from("api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", matchingKey.id);

  return {
    endUserId: normalizeEndUserId(matchingKey.end_user_id),
    actorRole: normalizeActorRole(matchingKey.actor_role),
    allowHeaderContext: false,
    apiKeyId: matchingKey.id,
    apiKeyName: matchingKey.name,
    apiKeyPreview: matchingKey.key_preview,
    readOnly: matchingKey.agent_policy?.read_only === true || (matchingKey.agent_policy?.allowed_actions?.length === 1 && matchingKey.agent_policy.allowed_actions[0] === "read"),
  } satisfies BundleAuthorization;
}
async function validateBundleBearer(request:Request,bundle:Bundle,servers:McpServer[]){
 const raw=getBearerToken(request);const apiKey=await validateBundleApiKey(bundle,servers,raw);if(apiKey)return apiKey;
 if(!raw||!process.env.MCP_AUTHORIZATION_SERVER_ISSUER)return null;
 try{const claims=await validateMcpAccessToken(raw,new URL(request.url).origin);const identity=validateMcpTokenClaims(claims,bundle.user_id);return {endUserId:identity.subject,actorRole:null,allowHeaderContext:false,apiKeyId:null,apiKeyName:identity.clientId?`OAuth client ${identity.clientId}`:"OAuth client",apiKeyPreview:null,readOnly:false} satisfies BundleAuthorization;}catch{return null;}
}

function bundleClientName(request: Request) {
  const value = request.headers.get("x-astrail-client")?.trim() ?? "";
  return value && value.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9_.:/ -]*$/.test(value) ? value : null;
}

function bundleCallerContext(request: Request, authorization: BundleAuthorization) {
  const rawEndUserId = request.headers.get("x-astrail-end-user");
  const rawActorRole = request.headers.get("x-astrail-actor-role");
  const requestedEndUserId = normalizeEndUserId(rawEndUserId);
  const requestedActorRole = normalizeActorRole(rawActorRole);
  const x402PaymentSignature = request.headers.get("payment-signature") ?? request.headers.get("x-payment");
  if (rawEndUserId && !requestedEndUserId) return { error: "Malformed x-astrail-end-user header.", endUserId: null, actorRole: null } as const;
  if (rawActorRole && !requestedActorRole) return { error: "Malformed x-astrail-actor-role header.", endUserId: null, actorRole: null } as const;
  if (x402PaymentSignature && x402PaymentSignature.length > 64_000) return { error: "PAYMENT-SIGNATURE header is too large.", endUserId: null, actorRole: null } as const;
  if (!authorization.allowHeaderContext) {
    if (rawEndUserId && requestedEndUserId !== authorization.endUserId) return { error: "End-user identity must match the API key scope.", endUserId: null, actorRole: null } as const;
    if (rawActorRole && requestedActorRole !== authorization.actorRole) return { error: "Actor role must match the API key scope.", endUserId: null, actorRole: null } as const;
  }
  return {
    error: null,
    endUserId: authorization.allowHeaderContext ? requestedEndUserId : authorization.endUserId,
    actorRole: authorization.allowHeaderContext ? requestedActorRole : authorization.actorRole,
    apiKeyId: authorization.apiKeyId,
    apiKeyName: authorization.apiKeyName,
    apiKeyPreview: authorization.apiKeyPreview,
    readOnly: authorization.readOnly,
    clientName: bundleClientName(request),
    x402PaymentSignature,
  } as const;
}

async function incrementServerCallCount(server: McpServer) {
  if (server.user_id === "local-preview") return;
  await createAdminClient()
    .from("mcp_servers")
    .update({ call_count: (server.call_count ?? 0) + 1 })
    .eq("id", server.id);
}

async function logBundleToolExecution(
  bundle: Bundle,
  server: McpServer,
  bundledToolName: string,
  tool: McpTool,
  execution: Awaited<ReturnType<typeof executeToolFromEndpointMap>>,
  context: BundleLogContext,
) {
  if (bundle.user_id === "local-preview") return;
  const summary = summarizeToolExecution(tool.name, execution);
  const payload = sanitizeToolLogRecord({
    event: "astrail.bundle_tool_call",
    bundle_id: bundle.id,
    server_id: server.id,
    tool_name: tool.name,
    bundled_tool_name: bundledToolName,
    status: execution.status,
    execution_mode: execution.executionMode,
    latency_ms: execution.latencyMs,
    method: execution.method,
    path: execution.path,
    upstream_status: execution.upstreamStatus,
    trace_id: execution.traceId,
    attempt_count: execution.attemptCount,
    error_code: execution.errorCode,
    error: execution.error,
    end_user_id: context.endUserId,
    actor_role: context.actorRole,
    api_key_id: context.apiKeyId,
    api_key_name: context.apiKeyName,
    api_key_preview: context.apiKeyPreview,
    client_name: context.clientName,
    credential_refs: context.credentialRefs,
    summary,
  });

  try {
    const insertRecord = {
      server_id: server.id,
      user_id: server.user_id,
      tool_name: tool.name,
      status: execution.status,
      latency_ms: execution.latencyMs,
      method: payload.method,
      path: payload.path,
      execution_mode: execution.executionMode,
      upstream_status: execution.upstreamStatus,
      trace_id: execution.traceId,
      attempt_count: execution.attemptCount,
      error_code: payload.error_code,
      error: payload.error,
    };
    const establishedAuditRecord = {
      ...insertRecord,
      end_user_id: context.endUserId,
      actor_role: context.actorRole,
      arguments_redacted: redactedArgumentsForLog(context.args),
      summary: payload.summary,
    };
    const admin = createAdminClient();
    let { error } = await admin
      .from("tool_call_logs")
      .insert({
        ...establishedAuditRecord,
        bundle_id: bundle.id,
        api_key_id: context.apiKeyId,
        api_key_name: context.apiKeyName,
        api_key_preview: context.apiKeyPreview,
        client_name: context.clientName,
        credential_refs: context.credentialRefs,
      });
    if (error?.message.includes("column")) {
      ({ error } = await admin.from("tool_call_logs").insert(establishedAuditRecord));
      if (error?.message.includes("column")) {
        ({ error } = await admin.from("tool_call_logs").insert(insertRecord));
      }
    }
    if (error) {
      writeStructuredLog({ ...payload, storage: "structured_log", storage_error: error.message });
      return;
    }
    writeStructuredLog({ ...payload, storage: "tool_call_logs" });
  } catch {
    writeStructuredLog({ ...payload, storage: "structured_log" });
  }
}

function presetTemplateExecution(server: McpServer, tool: McpTool): ToolExecutionResult {
  const traceId = `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    mcpResult: {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "auth_required",
          error_code: "provider_credentials_required",
          tool: tool.name,
          server: server.name,
          note: "This curated template is installed and the tool is valid. Live provider execution requires attaching provider credentials before Astrail can call the upstream API.",
          runtime: {
            execution_mode: "auth_required",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "auth_required",
    latencyMs: 0,
    method: null,
    path: null,
    executionMode: "auth_required",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "provider_credentials_required",
    error: "Provider credentials are required for curated preset execution.",
  };
}

async function loadBundle(bundleId: string): Promise<LoadedBundle> {
  if (
    process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1" &&
    (bundleId === "security-public-bundle" || bundleId === "security-mixed-bundle")
  ) {
    const securityPublic = localDemoServers().find((server) => server.id === "security-public");
    const securityPrivate = localDemoServers().find((server) => server.id === "security-private");
    if (securityPublic && (bundleId === "security-public-bundle" || securityPrivate)) {
      return {
        bundle: {
          id: bundleId,
          user_id: localDemoUserId,
          name: bundleId === "security-mixed-bundle" ? "Security mixed bundle fixture" : "Security public bundle fixture",
          is_public: true,
        },
        servers: bundleId === "security-mixed-bundle" && securityPrivate
          ? [securityPublic, securityPrivate]
          : [securityPublic],
      };
    }
  }

  if (!hasServerNeonEnv() && bundleId === "local-work-stack") {
    return {
      bundle: {
        id: "local-work-stack",
        user_id: "local-preview",
        name: "Local work stack",
        is_public: false,
      },
      servers: [
        {
          id: "local-website-mcp",
          user_id: "local-preview",
          name: "Hacker News browser server",
          description: "Local Website-to-MCP preview generated from a public page.",
          source_url: "https://news.ycombinator.com",
          source_type: "website",
          generated_code: null,
          tools_json: [{
            name: "browser_open_page",
            description: "Open the page and summarize visible public content.",
            input_schema: { type: "object", properties: {} },
            method: "BROWSER",
            path: "body",
          }],
          endpoint_map: [{
            method: "BROWSER",
            path: "body",
            runtime_kind: "browser",
            browser_action: "open_page",
            selector: "body",
            target_url: "https://news.ycombinator.com/",
            tool_name: "browser_open_page",
            operation_id: "browser_open_page",
            summary: "Open page",
            description: "Open the inspected website and return a public page summary.",
            parameters: [],
            requires_auth: false,
          }],
          is_public: false,
          hosted_endpoint: "/api/mcp/local-website-mcp",
          call_count: 128,
          created_at: new Date().toISOString(),
        },
      ],
    };
  }

  if (!hasServiceRoleKey()) {
    return { error: "Bundle runtime storage is not enabled." };
  }

  const admin = createAdminClient();
  const { data: bundle, error: bundleError } = await admin
    .from("mcp_bundles")
    .select("id,user_id,name,is_public,hosted_endpoint")
    .eq("id", bundleId)
    .single();

  if (bundleError || !bundle) return { error: "MCP bundle not found." };
  if (typeof bundle.hosted_endpoint !== "string" || bundle.hosted_endpoint.length === 0) {
    return { error: "MCP bundle not found." };
  }

  const { data: links, error: linksError } = await admin
    .from("mcp_bundle_servers")
    .select("server_id")
    .eq("bundle_id", bundleId);

  if (linksError) return { error: linksError.message };

  const serverIds = (links ?? []).map((link) => link.server_id).filter((id): id is string => typeof id === "string");
  if (serverIds.length === 0) return { bundle: bundle as Bundle, servers: [] as McpServer[] };

  const { data: servers, error: serversError } = await admin
    .from("mcp_servers")
    .select("*")
    .in("id", serverIds)
    .eq("user_id", bundle.user_id);

  if (serversError) return { error: serversError.message };
  return { bundle: bundle as Bundle, servers: (servers ?? []) as McpServer[] };
}

function findBundledTool(bundle: Bundle, servers: McpServer[], name: unknown) {
  if (typeof name !== "string" || !name.trim()) return { server: null, tool: null, denied: false };

  for (const server of servers) {
    const allTool = (server.tools_json ?? []).find((item) => bundleToolName(server, item) === name);
    if (!allTool) continue;
    const visible = new Set(toolsVisibleToBundle(server).map((tool) => bundleToolName(server, tool)));
    return { server, tool: allTool, denied: !visible.has(name) };
  }

  return { server: null, tool: null, denied: false };
}

async function handleJsonRpcRequest(bundle: Bundle, servers: McpServer[], body: unknown, approvedExecutionId?: string, caller: BundleCallerContext = anonymousBundleCaller): Promise<JsonRpcHandlerResult> {
  const { endUserId, actorRole, x402PaymentSignature } = caller;
  if (!isJsonRpcRequest(body) || hasInvalidJsonRpcId(body)) {
    return jsonRpcProtocolError(bundle, null, -32600, "Invalid JSON-RPC request.", 400, "invalid_json_rpc_request");
  }
  if (body.jsonrpc !== "2.0") {
    return jsonRpcProtocolError(bundle, body.id ?? null, -32600, "JSON-RPC version must be 2.0.", 400, "invalid_json_rpc_version");
  }
  if (typeof body.method !== "string" || !body.method.trim()) {
    return jsonRpcProtocolError(bundle, body.id ?? null, -32600, "JSON-RPC method is required.", 400, "missing_json_rpc_method");
  }

  if (body.method.startsWith("notifications/")) {
    return { payload: null, status: 204 };
  }

  if (body.method === "initialize") {
    return {
      payload: jsonRpcPayload(body.id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: bundle.name, version: "1.0.0" },
        capabilities: { tools: {} },
      }),
      status: 200,
    };
  }

  if (body.method === "ping") {
    return { payload: jsonRpcPayload(body.id, {}), status: 200 };
  }

  if (body.method === "tools/list") {
    return {
      payload: jsonRpcPayload(body.id, {
        tools: servers.flatMap((server) =>
          toolsVisibleToBundle(server).map((tool) => bundledToolListItem(server, tool))
        ),
      }),
      status: 200,
    };
  }

  if (body.method === "astrail/resume") {
    const executionId = body.params?.execution_id;
    if (typeof executionId !== "string" || !executionId) {
      return jsonRpcProtocolError(bundle, body.id, -32602, "execution_id is required.", 400, "missing_execution_id");
    }
    for (const server of servers) {
      const approved = await loadApprovedToolRequest(server, executionId);
      if (!approved.ok) {
        if (approved.code === "approval_not_found") continue;
        return { payload: jsonRpcPayload(body.id, approvalResumeFailure(executionId, approved.code)), status: 200 };
      }
      const sourceTool = (server.tools_json ?? []).find((tool) => tool.name === approved.request.tool_name);
      if (!sourceTool) return { payload: jsonRpcPayload(body.id, approvalResumeFailure(executionId, "approval_not_found")), status: 200 };
      return handleJsonRpcRequest(bundle, servers, {
        jsonrpc: "2.0",
        id: body.id,
        method: "tools/call",
        params: { name: bundleToolName(server, sourceTool), arguments: approved.arguments },
      }, executionId, caller);
    }
    return { payload: jsonRpcPayload(body.id, approvalResumeFailure(executionId, "approval_not_found")), status: 200 };
  }

  if (body.method === "tools/call") {
    const { server, tool, denied } = findBundledTool(bundle, servers, body.params?.name);
    if (!tool || !server) return jsonRpcProtocolError(bundle, body.id, -32602, "Unknown bundled tool.", 400, "unknown_tool");

    const name = String(body.params?.name);
    const rawArgs = normalizeToolArguments(body.params?.arguments);
    const x402Approval = splitX402ApprovalContext(rawArgs);
    if (x402Approval.hadContext && !approvedExecutionId) {
      const execution = permissionDeniedExecutionResult(tool);
      execution.errorCode = "x402_approval_context_forged";
      execution.error = "x402 approval context is only accepted from Astrail's encrypted approval store.";
      await logBundleToolExecution(bundle, server, name, tool, execution, { ...caller, args: null, credentialRefs: [] });
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 403 };
    }
    const args = x402Approval.args;
    const logContext: BundleLogContext = { ...caller, args, credentialRefs: [] };
    if (denied) {
      const execution = permissionDeniedExecutionResult(tool);
      await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }

    const inputValidation = validateToolInput(tool.input_schema ?? { type: "object", properties: {} }, args);
    if (!inputValidation.ok) {
      const execution = inputValidationFailedResult(tool, inputValidation.issues);
      await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }

    const billing = await checkBillingAllowance(server.user_id);
    if (!billing.allowed) {
      const execution = billingRequiredResult(name, tool, billing.summary);
      await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 402 };
    }

    const endpoint = findEndpointForTool(server, tool);
    const toolPolicy = tool.policy ?? endpoint?.policy ?? defaultToolPolicy(tool, endpoint ?? undefined);
    const readOperation = endpoint?.operation_kind === "read" || ["GET", "HEAD", "OPTIONS"].includes((endpoint?.method ?? tool.method ?? "").toUpperCase());
    if (caller.readOnly && !readOperation) {
      const execution = permissionDeniedExecutionResult(tool);
      await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }
    if (toolPolicy === "block") {
      const execution = permissionDeniedExecutionResult(tool);
      await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }
    const idempotencyKey = extractIdempotencyKey(args);
    const authorizationFingerprint = idempotencyAuthorizationFingerprint(endpoint, toolPolicy, server.runtime_policy);
    let scopedIdempotencyKey: string | null = null;
    let idempotencyClaimToken: string | null = null;
    let credentialResultForExecution: Awaited<ReturnType<typeof loadRuntimeCredentialResultForTool>> | null = null;
    if (idempotencyKey) {
      if (endpoint) {
        const runtimePermission = evaluateRuntimePermission(server.runtime_policy, endpoint, tool, { actorRole });
        if (!runtimePermission.allowed) {
          const execution = permissionDeniedExecutionResult(tool);
          await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
          return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
        }
      }
      credentialResultForExecution = await loadRuntimeCredentialResultForTool(server, tool, { endUserId });
      rememberBundleCredential(logContext, credentialResultForExecution.credential);
      if (credentialResultForExecution.failure || (endpoint && endpointRequiresAuth(endpoint) && !credentialResultForExecution.credential)) {
        const execution = await executeToolFromEndpointMap(server, tool, args, {
          credential: credentialResultForExecution.credential,
          credentialFailure: credentialResultForExecution.failure,
          actorRole,
          idempotencyKey,
          x402PaymentSignature,
          x402EndUserId: endUserId,
          x402ApprovedRequirement: x402Approval.requirement,
        });
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
      scopedIdempotencyKey = scopeIdempotencyKey(
        idempotencyKey,
        endUserId,
        actorRole,
        `${authorizationFingerprint}:${credentialResultForExecution.credential?.identityVersion ?? "public"}`,
      );
      if (await toolExecutionKeyExists(server, tool.name, idempotencyKey)) {
        const execution = bundleIdempotencyUnavailableResult(name, idempotencyKey, true);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 409 };
      }
      const recorded = await findRecordedToolExecution(server, tool.name, scopedIdempotencyKey as string);
      if (recorded) {
        const execution = replayedExecutionResult(name, idempotencyKey, recorded);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
    }
    if (toolPolicy === "approval" && !approvedExecutionId) {
      try {
        const approval = await createToolApprovalRequest(server, tool, args);
        const execution = approvalRequiredExecutionResult(tool, approval);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      } catch {
        const execution = bundleApprovalStorageUnavailableExecutionResult(tool);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 503 };
      }
    }

    const rateLimit = checkRuntimeRateLimit(`${bundle.id}:${name}`);
    if (!rateLimit.allowed) {
      const reason = "runtime_rate_limited";
      const resetAt = new Date(rateLimit.resetAt).toISOString();
      const audit = auditMcpSecurityEvent({
        route: "mcp_bundle",
        bundle_id: bundle.id,
        bundled_tool_name: name,
        reason,
        status: 429,
        reset_at: resetAt,
      });
      const execution = bundleRateLimitedExecutionResult(name, tool, resetAt, audit.trace_id);
      if (shouldPersistRateLimitAudit(`bundle:${bundle.id}:${name}`, rateLimit.resetAt)) {
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
      }
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 429 };
    }

    if (idempotencyKey) {
      const claim = await claimToolExecution(server, tool.name, scopedIdempotencyKey as string);
      if (claim.status === "replay") {
        const execution = replayedExecutionResult(name, idempotencyKey, claim.recorded);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
      if (claim.status === "in_progress") {
        const execution = bundleIdempotencyInProgressResult(name, idempotencyKey);
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 409 };
      }
      if (claim.status === "in_doubt" || claim.status === "unavailable") {
        const execution = bundleIdempotencyUnavailableResult(name, idempotencyKey, claim.status === "in_doubt");
        await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 503 };
      }
      idempotencyClaimToken = claim.claimToken;
    }

    const credentialResult = credentialResultForExecution ?? (await loadRuntimeCredentialResultForTool(server, tool, { endUserId }));
    rememberBundleCredential(logContext, credentialResult.credential);
    const execution = server.source_type === "preset" && (!Array.isArray(server.endpoint_map) || server.endpoint_map.length === 0)
      ? presetTemplateExecution(server, tool)
      : await executeToolFromEndpointMap(server, tool, args, {
          credential: credentialResult.credential,
          credentialFailure: credentialResult.failure,
          actorRole,
          idempotencyKey,
          x402PaymentSignature,
          x402EndUserId: endUserId,
          x402ApprovedRequirement: x402Approval.requirement,
        });
    if (execution.x402ApprovalRequirement) {
      if (idempotencyKey && idempotencyClaimToken) {
        await releaseToolExecutionClaim(server, tool.name, scopedIdempotencyKey as string, idempotencyClaimToken);
      }
      try {
        const approval = await createToolApprovalRequest(server, tool, withX402ApprovalContext(args, execution.x402ApprovalRequirement));
        const approvalExecution = x402ApprovalRequiredExecutionResult(tool, approval, execution.x402ApprovalRequirement);
        await logBundleToolExecution(bundle, server, name, tool, approvalExecution, logContext);
        if (approvedExecutionId) await markToolApprovalExecuted(server, approvedExecutionId);
        return { payload: jsonRpcPayload(body.id, approvalExecution.mcpResult), status: 200 };
      } catch {
        const approvalExecution = bundleApprovalStorageUnavailableExecutionResult(tool);
        await logBundleToolExecution(bundle, server, name, tool, approvalExecution, logContext);
        return { payload: jsonRpcPayload(body.id, approvalExecution.mcpResult), status: 503 };
      }
    }
    if (idempotencyKey && idempotencyClaimToken) {
      if (execution.status !== "payment_required" && execution.status !== "approval_required" && (execution.status === "success" || execution.attemptCount > 0)) {
        await recordToolExecution(server, tool.name, scopedIdempotencyKey as string, execution, idempotencyClaimToken);
      }
      else await releaseToolExecutionClaim(server, tool.name, scopedIdempotencyKey as string, idempotencyClaimToken);
    }
    await incrementServerCallCount(server);
    await logBundleToolExecution(bundle, server, name, tool, execution, logContext);
    if (approvedExecutionId) await markToolApprovalExecuted(server, approvedExecutionId);
    return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
  }

  return jsonRpcProtocolError(bundle, body.id, -32601, "Method not found.", 404, "method_not_found");
}

async function handleBundleBatchItem(bundle: Bundle, servers: McpServer[], item: unknown, caller: BundleCallerContext) {
  return isolateBatchItem(
    () => handleJsonRpcRequest(bundle, servers, item, undefined, caller),
    () => {
      const traceId = createRuntimeTraceId();
      writeStructuredLog({ event: "astrail.mcp.bundle_batch_item_failed", trace_id: traceId, bundle_id: bundle.id, reason: "unhandled_batch_item_error" });
      return {
        payload: jsonRpcErrorPayload(jsonRpcRequestId(item), -32603, "This batch item failed without cancelling the other requests.", {
          reason: "batch_item_failed", status: 500, trace_id: traceId,
        }),
        status: 200,
      } satisfies JsonRpcHandlerResult;
    },
  );
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request, props: { params: Promise<{ bundleId: string }> }) {
  const params = await props.params;
  if (requestPayloadTooLarge(request)) {
    const reason = "payload_too_large";
    const audit = auditMcpSecurityEvent({
      route: "mcp_bundle",
      bundle_id: params.bundleId,
      reason,
      status: 413,
      content_length: request.headers.get("content-length"),
    });
    return jsonRpcError(request, null, -32013, "JSON-RPC payload is too large.", 413, auditErrorData(audit, 413, reason));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const reason = "invalid_json";
    const audit = auditMcpSecurityEvent({
      route: "mcp_bundle",
      bundle_id: params.bundleId,
      reason,
      status: 400,
      content_length: request.headers.get("content-length"),
    });
    return jsonRpcError(request, null, -32700, "Invalid JSON-RPC payload.", 400, auditErrorData(audit, 400, reason));
  }

  const envelopeError = validateJsonRpcEnvelope(body);
  if (envelopeError) {
    return jsonRpcPreloadProtocolError(request, params.bundleId, envelopeError);
  }

  const loaded = await loadBundle(params.bundleId);
  if ("error" in loaded) return jsonRpcError(request, firstRequestId(body), -32004, loaded.error, 404);

  const { bundle, servers } = loaded;
  const authorization = await validateBundleBearer(request, bundle, servers);
  if (!authorization) {
    const reason = "invalid_or_missing_api_key";
    const audit = auditMcpSecurityEvent({
      route: "mcp_bundle",
      bundle_id: bundle.id,
      reason,
      status: 401,
      is_public: bundle.is_public,
    });
    const response=jsonRpcError(request, firstRequestId(body), -32001, "Valid Astrail API key or MCP OAuth access token required.", 401, auditErrorData(audit, 401, reason));
    response.headers.set("WWW-Authenticate",bearerChallenge(new URL(request.url).origin,"invalid_token","A valid bearer token is required."));return response;
  }

  const context = bundleCallerContext(request, authorization);
  if (context.error) return jsonRpcError(request, firstRequestId(body), -32003, context.error, 403);
  if (Array.isArray(body) && context.x402PaymentSignature) {
    return jsonRpcError(request, firstRequestId(body), -32600, "PAYMENT-SIGNATURE can authorize only one JSON-RPC request, not a batch.", 400);
  }
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((item) => handleBundleBatchItem(bundle, servers, item, context)));
    const payloads = results.map((result) => result.payload).filter((payload): payload is JsonRpcResponsePayload => Boolean(payload));
    if (payloads.length === 0) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
    }
    return jsonWithCors(request, payloads);
  }

  const result = await handleJsonRpcRequest(bundle, servers, body, undefined, context);
  if (!result.payload) {
    return new NextResponse(null, { status: result.status, headers: corsHeaders(request) });
  }
  return jsonWithCors(request, result.payload, result.status);
}
