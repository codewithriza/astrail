import { NextResponse } from "next/server";
import { configuredCorsOrigins } from "@/lib/cors-origins";
import { normalizeOrigin, requestOrigin } from "@/lib/origin-policy";
import { verifyApiKey } from "@/lib/api-keys";
import { defaultToolPolicy } from "@/lib/agent-tool-profile";
import { checkBillingAllowance } from "@/lib/billing/usage";
import { findLocalGeneratedServer, localDemoServers, localDemoUserId } from "@/lib/local-demo";
import { loadLocalPreviewServer } from "@/lib/local-preview-servers";
import { findPresetServer } from "@/lib/preset-servers";
import {
  executeToolFromEndpointMap,
  findEndpointForTool,
  type RuntimeCredential,
  type ToolExecutionResult,
} from "@/lib/runtime/execute-tool";
import {
  endpointRequiresAuth,
  evaluateRuntimePermission,
  normalizeActorRole,
  redactSensitive,
  runtimePolicySummary,
  visibleEndpointsForRequest,
  visibleToolsForRequest,
} from "@/lib/runtime/permissions";
import { auditMcpSecurityEvent, humanToolCallSummary, redactedArgumentsForLog, sanitizeToolLogRecord, writeStructuredLog } from "@/lib/runtime/observability";
import { shouldPersistRateLimitAudit } from "@/lib/runtime/rate-limit-audit";
import { checkRuntimeRateLimit } from "@/lib/runtime/rate-limit";
import { isolateBatchItem } from "@/lib/runtime/batch";
import { loadRuntimeCredentialResultForTool, normalizeEndUserId } from "@/lib/runtime/credential-loader";
import { claimToolExecution, extractIdempotencyKey, findRecordedToolExecution, idempotencyAuthorizationFingerprint, recordToolExecution, releaseToolExecutionClaim, replayedExecutionResult, scopeIdempotencyKey, toolExecutionKeyExists } from "@/lib/runtime/idempotency";
import { createToolApprovalRequest, loadApprovedToolRequest, markToolApprovalExecuted, type ToolApprovalRequest } from "@/lib/runtime/tool-approvals";
import { splitX402ApprovalContext, withX402ApprovalContext, type X402Requirement } from "@/lib/runtime/x402";
import { executeSdkCodeMode, searchSdkDocs } from "@/lib/runtime/sdk-code-mode";
import { validateToolInput, type ToolInputValidationIssue } from "@/lib/runtime/tool-input-validation";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { agentFacingToolDescription } from "@/lib/tool-governance";
import { createAdminClient, createPublicClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { ApiKey, McpServer, McpTool, OpenApiEndpoint } from "@/lib/types";
import { resolveMcpEndpoint } from "@/lib/urls";
import { evaluateComposableAuthorization, hashTaskToken, type AgentPolicy, type ComposableDecision, type TaskAuthorization } from "@/lib/runtime/composable-authorization";
import { oauthRequiredScopes } from "@/lib/runtime/oauth-security";
import { bearerChallenge, validateMcpAccessToken, validateMcpTokenClaims } from "@/lib/mcp-oauth-resource";

export const runtime = "nodejs";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
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

type ApiKeyRow = ApiKey & {
  key_hash: string;
};

type ApiKeyAuthorization = {
  endUserId: string | null;
  actorRole: string | null;
  allowHeaderContext: boolean;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPreview: string | null;
  agentId: string | null;
  agentPolicy: AgentPolicy | null;
};

type AuditCallerContext = {
  endUserId: string | null;
  actorRole: string | null;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPreview: string | null;
  clientName: string | null;
  x402PaymentSignature: string | null;
  agentId: string | null;
  agentPolicy: AgentPolicy | null;
  task: TaskAuthorization | null;
};

const anonymousCaller: AuditCallerContext = {
  endUserId: null,
  actorRole: null,
  apiKeyId: null,
  apiKeyName: null,
  apiKeyPreview: null,
  clientName: null,
  x402PaymentSignature: null,
  agentId: null,
  agentPolicy: null,
  task: null,
};

type CredentialRow = {
  id: string;
  auth_scheme: RuntimeCredential["scheme"];
  provider: string | null;
  client_id: string | null;
  client_secret_ciphertext: string | null;
  token_auth_method: "client_secret_post" | "client_secret_basic" | null;
  injection_name: string | null;
  scopes: unknown;
  secret_ciphertext: string;
  access_token_ciphertext: string | null;
  refresh_token_ciphertext: string | null;
  token_url: string | null;
  expires_at: string | null;
};

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id, payment-signature, x-payment, x-astrail-client, x-astrail-end-user, x-astrail-actor-role",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}

function jsonWithCors(request: Request, payload: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(corsHeaders(request));
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return NextResponse.json(payload, { status, headers });
}

function localWebsitePreviewServer(): McpServer {
  const tools: McpTool[] = [
    {
      name: "browser_open_page",
      description: "Open the inspected website and return a safe public page summary.",
      input_schema: {
        type: "object",
        properties: {
          instruction: {
            type: "string",
            description: "Optional instruction for the browser runtime before executing this website workflow.",
          },
        },
      },
      method: "BROWSER",
      path: "body",
    },
    {
      name: "browser_follow_link_news",
      description: "Follow the Hacker News news link and return a safe public page summary.",
      input_schema: { type: "object", properties: {} },
      method: "BROWSER",
      path: "https://news.ycombinator.com/news",
    },
    {
      name: "browser_follow_link_new",
      description: "Follow the Hacker News newest link and return a safe public page summary.",
      input_schema: { type: "object", properties: {} },
      method: "BROWSER",
      path: "https://news.ycombinator.com/newest",
    },
  ];

  const endpoints: OpenApiEndpoint[] = [
    {
      method: "BROWSER",
      path: "body",
      runtime_kind: "browser",
      browser_action: "open_page",
      selector: "body",
      target_url: "https://news.ycombinator.com/",
      tool_name: tools[0].name,
      operation_id: tools[0].name,
      summary: "open page",
      description: tools[0].description,
      parameters: [],
      requires_auth: false,
    },
    {
      method: "BROWSER",
      path: "https://news.ycombinator.com/news",
      runtime_kind: "browser",
      browser_action: "follow_link",
      selector: "a[href='news']",
      target_url: "https://news.ycombinator.com/news",
      tool_name: tools[1].name,
      operation_id: tools[1].name,
      summary: "news",
      description: tools[1].description,
      parameters: [],
      requires_auth: false,
    },
    {
      method: "BROWSER",
      path: "https://news.ycombinator.com/newest",
      runtime_kind: "browser",
      browser_action: "follow_link",
      selector: "a[href='newest']",
      target_url: "https://news.ycombinator.com/newest",
      tool_name: tools[2].name,
      operation_id: tools[2].name,
      summary: "new",
      description: tools[2].description,
      parameters: [],
      requires_auth: false,
    },
  ];

  return {
    id: "local-website-preview",
    user_id: "local-preview",
    name: "hacker-news-browser-server",
    description: "Development-only Website-to-MCP preview server for safe public browser reads.",
    source_url: "https://news.ycombinator.com/",
    source_type: "website",
    category: "Website",
    generated_code: null,
    tools_json: tools,
    endpoint_map: endpoints,
    diagnostics: ["Local preview server. Connect persistent workspace storage to save generated website MCP endpoints."],
    status: "live",
    validation_status: "passed",
    generation_status: "passed",
    is_public: true,
    hosted_endpoint: "http://localhost:3000/api/mcp/local-website-preview",
    call_count: 0,
    generation_version: "local-preview",
    protocol_version: "2024-11-05",
    created_at: new Date(0).toISOString(),
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

function createRuntimeTraceId() {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function auditErrorData(event: ReturnType<typeof auditMcpSecurityEvent>, status: number, reason: string) {
  return {
    reason,
    status,
    trace_id: event.trace_id,
  };
}

function jsonRpcProtocolError(
  server: McpServer,
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  status: number,
  reason: string
): JsonRpcHandlerResult {
  const audit = auditMcpSecurityEvent({
    route: "mcp_server",
    server_id: server.id,
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

function jsonRpcPreloadProtocolError(request: Request, serverId: string, error: JsonRpcEnvelopeError) {
  const audit = auditMcpSecurityEvent({
    route: "mcp_server",
    server_id: serverId,
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

function requestPayloadTooLarge(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  return Number.isFinite(length) && length > MAX_JSON_RPC_BYTES;
}

function getBearerToken(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

function isCodeModeServer(tools: McpTool[]) {
  const names = new Set(tools.map((tool) => tool.name));
  return names.has("search_docs") && names.has("execute");
}

function startupInstructions(server: McpServer, tools: McpTool[]) {
  const businessContext = typeof server.runtime_policy?.business_context === "string" ? server.runtime_policy.business_context.replace(/\s+/g, " ").trim().slice(0, 4000) : "";
  const contextInstruction = businessContext ? ` Business context supplied by the server owner: ${businessContext}` : "";
  const x402Instruction = server.runtime_policy?.x402?.enabled
    ? " If a call returns x402_payment_required, ask the user to approve and sign one offered option in their own wallet, then retry with PAYMENT-SIGNATURE. Never ask for a private key or seed phrase."
    : "";
  if (isCodeModeServer(tools)) {
    return [
      `${server.name} is an Astrail Code Mode MCP server.`,
      "Use search_docs first to find SDK-style methods, parameters, examples, auth requirements, and response hints.",
      "Use execute with TypeScript-looking calls like await client.resource.method({ ... }) or for await (const item of client.resource.list({ ... })). Astrail statically analyzes those calls and compiles them to deterministic endpoint-map execution; arbitrary JavaScript is not evaluated.",
      "Independent read calls in one execute request can run in parallel. Invalid methods or missing required arguments return typecheck-style errors with suggestions before any upstream request.",
      "Ask for user confirmation before write or destructive operations. Private upstream APIs require credentials configured in Astrail.",
    ].join(" ") + contextInstruction + x402Instruction;
  }

  return [
    `${server.name} is an Astrail hosted MCP server.`,
    "Use tools/list to inspect available tools and tools/call to execute mapped endpoints.",
    "Astrail returns auth_required when provider credentials are needed and includes trace IDs for runtime debugging.",
  ].join(" ") + contextInstruction + x402Instruction;
}

async function validateOwnerApiKey(server: McpServer, rawKey: string | null) {
  if (server.is_public && !rawKey) return { ...anonymousCaller, allowHeaderContext: false } satisfies ApiKeyAuthorization;
  if (!rawKey) return null;
  if (server.user_id === localDemoUserId && process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1") {
    const endUserId = normalizeEndUserId(process.env.ASTRAIL_LOCAL_MCP_END_USER_ID);
    const actorRole = normalizeActorRole(process.env.ASTRAIL_LOCAL_MCP_ACTOR_ROLE);
    return rawKey === (process.env.ASTRAIL_LOCAL_MCP_API_KEY ?? "ag_demo_secret")
      ? { endUserId, actorRole, allowHeaderContext: !endUserId && !actorRole, apiKeyId: "local-fixture", apiKeyName: "Local fixture", apiKeyPreview: "ag_demo…", agentId: process.env.ASTRAIL_LOCAL_MCP_AGENT_ID ?? null, agentPolicy: {} } satisfies ApiKeyAuthorization
      : null;
  }
  if (!hasServiceRoleKey()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("api_keys")
    .select("id,user_id,name,key_hash,key_preview,end_user_id,actor_role,agent_id,agent_policy,last_used,created_at")
    .eq("user_id", server.user_id);

  if (error) return null;

  const matchingKey = ((data ?? []) as ApiKeyRow[]).find((key) =>
    verifyApiKey(rawKey, key.key_hash)
  );

  if (!matchingKey) return null;

  await admin
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
    agentId: typeof matchingKey.agent_id === "string" ? matchingKey.agent_id : null,
    agentPolicy: matchingKey.agent_policy ?? null,
  } satisfies ApiKeyAuthorization;
}

async function validateInboundBearer(request: Request, server: McpServer) {
  const raw = getBearerToken(request);
  const apiKey = await validateOwnerApiKey(server, raw);
  if (apiKey) return apiKey;
  if (!raw || !process.env.MCP_AUTHORIZATION_SERVER_ISSUER) return null;
  try {
    const claims = await validateMcpAccessToken(raw, new URL(request.url).origin);
    const identity = validateMcpTokenClaims(claims, server.user_id);
    return {
      endUserId: identity.subject, actorRole: null, allowHeaderContext: false,
      apiKeyId: null, apiKeyName: identity.clientId ? `OAuth client ${identity.clientId}` : "OAuth client", apiKeyPreview: null,
      agentId: typeof claims.astrail_agent_id === "string" ? claims.astrail_agent_id : null, agentPolicy: null,
    } satisfies ApiKeyAuthorization;
  } catch { return null; }
}

function oauthChallenge(request: Request) {
  return { "WWW-Authenticate": bearerChallenge(new URL(request.url).origin, "invalid_token", "A valid bearer token is required.") };
}

async function loadTaskAuthorization(request: Request, server: McpServer, authorization: ApiKeyAuthorization) {
  const raw = request.headers.get("x-astrail-task-authorization")?.trim();
  if (!authorization.agentId) return { task: null, error: null };
  if (!raw) return { task: null, error: null };
  if (!/^atask_[A-Za-z0-9_-]{40,100}$/.test(raw) || !hasServiceRoleKey()) return { task: null, error: "Malformed or unverifiable task authorization." };
  const { data, error } = await createAdminClient().from("task_authorizations")
    .select("id,agent_id,purpose,issuer,nonce,allowed_tools,allowed_actions,approval_actions,allowed_resources,allowed_scopes,expires_at")
    .eq("token_hash", hashTaskToken(raw)).eq("user_id", server.user_id).eq("server_id", server.id)
    .eq("agent_id", authorization.agentId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  return error || !data ? { task: null, error: "Task authorization is invalid, expired, revoked, or bound to another agent/server." } : { task: data as TaskAuthorization, error: null };
}

function clientName(request: Request) {
  const value = request.headers.get("x-astrail-client")?.trim() ?? "";
  return value && value.length <= 120 && /^[A-Za-z0-9][A-Za-z0-9_.:/ -]*$/.test(value) ? value : null;
}

async function callerContext(request: Request, server: McpServer, authorization: ApiKeyAuthorization) {
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
  const loadedTask = await loadTaskAuthorization(request, server, authorization);
  if (loadedTask.error) return { error: loadedTask.error, endUserId: null, actorRole: null } as const;
  return {
    error: null,
    endUserId: authorization.allowHeaderContext ? requestedEndUserId : authorization.endUserId,
    actorRole: authorization.allowHeaderContext ? requestedActorRole : authorization.actorRole,
    apiKeyId: authorization.apiKeyId,
    apiKeyName: authorization.apiKeyName,
    apiKeyPreview: authorization.apiKeyPreview,
    clientName: clientName(request),
    x402PaymentSignature,
    agentId: authorization.agentId,
    agentPolicy: authorization.agentPolicy,
    task: loadedTask.task,
  } as const;
}

async function incrementCallCount(server: McpServer) {
  if (server.user_id === "preset") return;
  if (!hasServiceRoleKey()) return;

  const admin = createAdminClient();
  await admin
    .from("mcp_servers")
    .update({ call_count: (server.call_count ?? 0) + 1 })
    .eq("id", server.id);
}

function billingRequiredResult(toolName: string, summary: Awaited<ReturnType<typeof checkBillingAllowance>>["summary"]): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "billing_required",
          error_code: "monthly_billing_limit_reached",
          tool: toolName,
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
    method: null,
    path: null,
    executionMode: "billing_required",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "monthly_billing_limit_reached",
    error: "Monthly billing limit reached.",
  };
}

function idempotencyInProgressResult(toolName: string, key: string): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  const payload = {
    status: "error",
    error_code: "idempotency_in_progress",
    tool: toolName,
    note: "Another request with this idempotency key is still executing. Retry shortly; Astrail will replay its stored result after completion.",
    idempotency_key: key,
    runtime: { execution_mode: "idempotency_wait", trace_id: traceId, error_code: "idempotency_in_progress" },
  };
  return {
    mcpResult: { isError: true, content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] },
    status: "error",
    latencyMs: 0,
    method: null,
    path: null,
    executionMode: "safe_rest_execution",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "idempotency_in_progress",
    error: "A matching tool execution is in progress.",
  };
}

function idempotencyUnavailableResult(toolName: string, key: string, inDoubt: boolean): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  const errorCode = inDoubt ? "idempotency_in_doubt" : "idempotency_storage_unavailable";
  const note = inDoubt
    ? "A previous write may have reached the provider, but Astrail could not store a final result. The write is blocked to prevent a duplicate; inspect the provider and use a new key only after reconciling it."
    : "Durable idempotency storage is unavailable. Astrail blocked this write instead of risking duplicate execution.";
  return {
    mcpResult: { isError: true, content: [{ type: "text", text: JSON.stringify({ status: "error", error_code: errorCode, tool: toolName, idempotency_key: key, note, runtime: { execution_mode: "idempotency_blocked", trace_id: traceId, error_code: errorCode } }, null, 2) }] },
    status: "error", latencyMs: 0, method: null, path: null, executionMode: "safe_rest_execution",
    upstreamStatus: null, traceId, attemptCount: 0, errorCode, error: note,
  };
}

function inputValidationFailedResult(
  tool: McpTool,
  issues: ToolInputValidationIssue[],
  inputSchema: unknown,
  method: string | null = tool.method ?? null,
  path: string | null = tool.path ?? null
): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  const message = issues.map((item) => `${item.path}: ${item.message}`).join(" ");
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
          expected_schema: inputSchema ?? { type: "object", properties: {} },
          note: "The tool was not executed. Fix arguments to match inputSchema, then retry tools/call.",
          runtime: {
            execution_mode: "validation_failed",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "validation_failed",
    latencyMs: 0,
    method,
    path,
    executionMode: "validation_failed",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "invalid_tool_arguments",
    error: message || "Invalid tool arguments.",
  };
}

function permissionDeniedExecutionResult(tool: McpTool, method: string | null = tool.method ?? null, path: string | null = tool.path ?? null): ToolExecutionResult {
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
          note: "This tool or endpoint is not exposed by the public MCP policy.",
          runtime: {
            execution_mode: "permission_denied",
            trace_id: traceId,
          },
        }, null, 2),
      }],
    },
    status: "permission_denied",
    latencyMs: 0,
    method,
    path,
    executionMode: "permission_denied",
    upstreamStatus: null,
    traceId,
    attemptCount: 0,
    errorCode: "permission_denied",
    error: "This tool or endpoint is not exposed by the public MCP policy.",
  };
}

function composableDeniedExecutionResult(tool: McpTool, decision: ComposableDecision): ToolExecutionResult {
  const result = permissionDeniedExecutionResult(tool);
  result.errorCode = "composable_authorization_denied";
  result.error = decision.missing.join("; ");
  result.mcpResult.content[0].text = JSON.stringify({
    status: "permission_denied", error_code: result.errorCode, tool: tool.name,
    decision, note: "User, agent, task, server, and provider constraints must all permit this call.",
    runtime: { execution_mode: "permission_denied", trace_id: result.traceId },
  }, null, 2);
  return result;
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
        note: "Astrail paused this call before billing, credential injection, or upstream execution. Approve it in the dashboard, then resume it once.",
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
        note: "Astrail paused before forwarding payment. Approve this exact amount, sign it in the end user's wallet, then resume with PAYMENT-SIGNATURE. Astrail never holds the wallet key or funds.",
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

function approvalStorageUnavailableExecutionResult(tool: McpTool): ToolExecutionResult {
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

function rateLimitedExecutionResult(tool: McpTool, resetAt: string, traceId: string): ToolExecutionResult {
  return {
    mcpResult: {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          error_code: "rate_limited",
          tool: tool.name,
          note: "Runtime rate limit exceeded. Retry after the reset time.",
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

type ToolLogContext = {
  endUserId?: string | null;
  actorRole?: string | null;
  apiKeyId?: string | null;
  apiKeyName?: string | null;
  apiKeyPreview?: string | null;
  clientName?: string | null;
  credentialRefs?: import("@/lib/types").CredentialAuditRef[];
  args?: Record<string, unknown> | null;
  agentId?: string | null;
  task?: TaskAuthorization | null;
  authorizationDecision?: ComposableDecision | null;
  affectedResources?: Array<Record<string, unknown>>;
  approval?: ToolApprovalRequest | null;
  policyResult?: unknown;
  effectiveScopes?: string[];
};

function affectedResources(endpoint: OpenApiEndpoint | null, args: Record<string, unknown>) {
  if (!endpoint) return [];
  const identifiers = Object.fromEntries(Object.entries(args).filter(([key, value]) =>
    /(^|_)(id|number|owner|repo|resource|issue|comment)($|_)/i.test(key)
      && ["string", "number"].includes(typeof value)
  ).slice(0, 20));
  return [{ resource: endpoint.resource ?? endpoint.tags?.[0] ?? endpoint.path, method: endpoint.method, path: endpoint.path, identifiers }];
}

async function logToolExecution(server: McpServer, toolName: string, execution: ToolExecutionResult, context: ToolLogContext = {}) {
  if (server.user_id === "local-preview") return;
  if (server.user_id === "preset") return;
  const summary = humanToolCallSummary({
    toolName,
    status: execution.status,
    method: execution.method,
    path: execution.path,
    latencyMs: execution.latencyMs,
    attemptCount: execution.attemptCount,
    errorCode: execution.errorCode,
    error: execution.error,
    endUserId: context.endUserId ?? null,
    actorRole: context.actorRole ?? null,
  });
  const argumentsRedacted = redactedArgumentsForLog(context.args);
  const logPayload = sanitizeToolLogRecord({
    event: "astrail.tool_call",
    server_id: server.id,
    tool_name: toolName,
    status: execution.status,
    execution_mode: execution.executionMode,
    method: execution.method,
    path: execution.path,
    latency_ms: execution.latencyMs,
    upstream_status: execution.upstreamStatus,
    trace_id: execution.traceId,
    attempt_count: execution.attemptCount,
    error_code: execution.errorCode,
    error: execution.error,
    end_user_id: context.endUserId ?? null,
    actor_role: context.actorRole ?? null,
    api_key_id: context.apiKeyId ?? null,
    api_key_name: context.apiKeyName ?? null,
    api_key_preview: context.apiKeyPreview ?? null,
    client_name: context.clientName ?? null,
    credential_refs: context.credentialRefs ?? [],
    agent_id: context.agentId ?? null,
    task_id: context.task?.nonce ?? null,
    purpose: context.task?.purpose ?? null,
    affected_resources: context.affectedResources ?? [],
    effective_scopes: context.effectiveScopes ?? context.authorizationDecision?.requiredScopes ?? [],
    policy_result: context.policyResult ?? context.authorizationDecision ?? null,
    provider_result: { status: execution.status, upstream_status: execution.upstreamStatus, error_code: execution.errorCode },
    approval_id: context.approval?.id ?? null,
    approval_actor_id: context.approval?.decided_by ?? null,
    approval_reason: context.approval?.decision_reason ?? null,
    execution_claim_id: context.approval?.execution_claim_id ?? null,
    storage_status: hasServiceRoleKey() ? "persisted" : "structured_log_only_gap",
    summary,
    timestamp: new Date().toISOString(),
  });

  if (!hasServiceRoleKey()) {
    writeStructuredLog({ ...logPayload, storage: "structured_log" });
    return;
  }

  try {
    const admin = createAdminClient();
    const baseRecord = {
      server_id: server.id,
      user_id: server.user_id,
      organization_id: server.organization_id ?? null,
      tool_name: toolName,
      status: execution.status,
      latency_ms: execution.latencyMs,
      method: logPayload.method,
      path: logPayload.path,
      execution_mode: execution.executionMode,
      upstream_status: execution.upstreamStatus,
      trace_id: execution.traceId,
      attempt_count: execution.attemptCount,
      error_code: logPayload.error_code,
      error: logPayload.error,
    };
    const establishedAuditRecord = {
      ...baseRecord,
      end_user_id: context.endUserId ?? null,
      actor_role: context.actorRole ?? null,
      arguments_redacted: argumentsRedacted,
      summary,
      agent_id: context.agentId ?? null,
      task_authorization_id: context.task?.id ?? null,
      purpose: context.task?.purpose ?? null,
      authorization_decision: context.authorizationDecision ?? null,
      task_id: context.task?.nonce ?? null,
      affected_resources: context.affectedResources ?? [],
      effective_scopes: context.effectiveScopes ?? context.authorizationDecision?.requiredScopes ?? [],
      policy_result: context.policyResult ?? context.authorizationDecision ?? null,
      provider_result: { status: execution.status, upstream_status: execution.upstreamStatus, error_code: execution.errorCode },
      approval_id: context.approval?.id ?? null,
      approval_actor_id: context.approval?.decided_by ?? null,
      approval_decision: context.approval?.status === "executing" || context.approval?.status === "executed" ? "approved" : context.approval?.status ?? null,
      approval_decided_at: context.approval?.decided_at ?? null,
      approval_reason: context.approval?.decision_reason ?? null,
      execution_claim_id: context.approval?.execution_claim_id ?? null,
    };
    const { error } = await admin
      .from("tool_call_logs")
      .insert({
        ...establishedAuditRecord,
        api_key_id: context.apiKeyId ?? null,
        api_key_name: context.apiKeyName ?? null,
        api_key_preview: context.apiKeyPreview ?? null,
        client_name: context.clientName ?? null,
        credential_refs: context.credentialRefs ?? [],
        arguments_redacted: argumentsRedacted,
        summary,
      });
    if (error?.message.includes("column")) {
      // Preserve the audit fields supported before this release when only the
      // new attribution migration is pending. Fall back to the original base
      // columns only for much older deployments.
      let fallback = await admin.from("tool_call_logs").insert(establishedAuditRecord);
      if (fallback.error?.message.includes("column")) {
        fallback = await admin.from("tool_call_logs").insert(baseRecord);
      }
      if (fallback.error) {
        writeStructuredLog({ ...logPayload, storage: "structured_log", storage_error: fallback.error.message });
      }
    } else if (error) {
      writeStructuredLog({ ...logPayload, storage: "structured_log", storage_error: error.message });
    }
  } catch {
    writeStructuredLog({ ...logPayload, storage: "structured_log" });
    // Runtime logging is best-effort. MCP protocol responses should not fail because observability storage is unavailable.
  }
}

function rememberCredential(context: ToolLogContext | undefined, credential: RuntimeCredential | null) {
  const ref = credential?.auditRef;
  if (!context || !ref) return;
  context.credentialRefs ??= [];
  if (!context.credentialRefs.some((item) => item.id === ref.id)) context.credentialRefs.push(ref);
}

async function loadCredentialResultForTool(server: McpServer, tool: McpTool, endUserId: string | null = null, context?: ToolLogContext) {
  const result = await loadRuntimeCredentialResultForTool(server, tool, { endUserId });
  rememberCredential(context, result.credential);
  return result;
}

function presetTemplateExecution(server: McpServer, tool: McpTool): ToolExecutionResult {
  const traceId = createRuntimeTraceId();
  return {
    mcpResult: {
      isError: true,
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

function normalizeToolArguments(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function endpointId(endpoint: OpenApiEndpoint) {
  return endpoint.tool_name || endpoint.operation_id || `${endpoint.method} ${endpoint.path}`;
}

function endpointSearchText(endpoint: OpenApiEndpoint) {
  return [
    endpointId(endpoint),
    endpoint.method,
    endpoint.path,
    endpoint.summary,
    endpoint.description,
    endpoint.resource,
    ...(endpoint.tags ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function catalogEndpoints(server: McpServer) {
  return visibleEndpointsForRequest(server);
}

function findCatalogEndpoint(server: McpServer, id: unknown) {
  if (typeof id !== "string" || !id.trim()) return null;
  const normalized = id.trim().toLowerCase();
  return catalogEndpoints(server).find((endpoint) =>
    endpointId(endpoint).toLowerCase() === normalized
    || endpoint.tool_name?.toLowerCase() === normalized
    || endpoint.operation_id?.toLowerCase() === normalized
    || `${endpoint.method} ${endpoint.path}`.toLowerCase() === normalized
  ) ?? null;
}

function findCatalogEndpointTool(server: McpServer, endpoint: OpenApiEndpoint) {
  return (server.tools_json ?? []).find((tool) => {
    if (endpoint.tool_name && tool.name === endpoint.tool_name) return true;
    if (endpoint.operation_id && tool.name === endpoint.operation_id) return true;
    return tool.method === endpoint.method && tool.path === endpoint.path;
  }) ?? null;
}

function endpointCatalogItem(endpoint: OpenApiEndpoint) {
  return redactSensitive({
    endpoint_id: endpointId(endpoint),
    method: endpoint.method,
    path: endpoint.path,
    operation_id: endpoint.operation_id,
    summary: endpoint.summary,
    description: endpoint.description,
    resource: endpoint.resource,
    tags: endpoint.tags ?? [],
    operation: endpoint.operation_kind,
    requires_auth: endpointRequiresAuth(endpoint),
  });
}

function listApiEndpoints(server: McpServer, args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
  const resource = typeof args.resource === "string" ? args.resource.toLowerCase().trim() : "";
  const tag = typeof args.tag === "string" ? args.tag.toLowerCase().trim() : "";
  const operation = typeof args.operation === "string" ? args.operation.toLowerCase().trim() : "";
  const method = typeof args.method === "string" ? args.method.toUpperCase().trim() : "";
  const limit = Math.max(1, Math.min(Number(args.limit ?? 20) || 20, 50));

  const matches = catalogEndpoints(server).filter((endpoint) => {
    if (query && !endpointSearchText(endpoint).includes(query)) return false;
    if (resource && (endpoint.resource ?? "default").toLowerCase() !== resource) return false;
    if (tag && !(endpoint.tags ?? []).some((item) => item.toLowerCase() === tag)) return false;
    if (operation && endpoint.operation_kind !== operation) return false;
    if (method && endpoint.method.toUpperCase() !== method) return false;
    return true;
  });

  return {
    status: "success",
    server: server.name,
    total_matches: matches.length,
    returned: Math.min(matches.length, limit),
    endpoints: matches.slice(0, limit).map(endpointCatalogItem),
    next_step: "Call get_api_endpoint_schema with endpoint_id before invoke_api_endpoint.",
  };
}

function getApiEndpointSchema(server: McpServer, args: Record<string, unknown>) {
  const endpoint = findCatalogEndpoint(server, args.endpoint_id);
  if (!endpoint) {
    return {
      status: "error",
      error_code: "endpoint_not_found",
      endpoint_id: args.endpoint_id ?? null,
      note: "Use list_api_endpoints to find a valid endpoint_id.",
    };
  }

  return {
    status: "success",
    endpoint: endpointCatalogItem(endpoint),
    input_schema: redactSensitive(endpoint.input_schema ?? { type: "object", properties: {} }),
    parameters: redactSensitive(endpoint.parameters ?? []),
    request_body: redactSensitive(endpoint.request_body ?? null),
    response_hints: redactSensitive(endpoint.response_hints ?? null),
    security: server.is_public ? null : redactSensitive(endpoint.security_requirements ?? endpoint.security ?? null),
    next_step: "Call invoke_api_endpoint with this endpoint_id and arguments matching input_schema.",
  };
}

async function executeMetaTool(
  server: McpServer,
  tool: McpTool,
  args: Record<string, unknown>,
  endUserId: string | null = null,
  actorRole: string | null = null,
  logContext?: ToolLogContext,
  x402PaymentSignature: string | null = null,
  x402ApprovedRequirement: X402Requirement | null = null,
) {
  if (tool.name === "search_docs") {
    return {
      mcpResult: {
        content: [{ type: "text", text: JSON.stringify(searchSdkDocs(server, args), null, 2) }],
      },
      status: "success",
      latencyMs: 0,
      method: "ASTRAIL_CODE",
      path: "search_docs",
      executionMode: "code_mode",
      upstreamStatus: null,
      traceId: `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      attemptCount: 0,
      errorCode: null,
      error: null,
    } satisfies ToolExecutionResult;
  }

  if (tool.name === "execute") {
    return executeSdkCodeMode(server, args, {
      loadCredentialForTool: (codeModeServer: McpServer, codeModeTool: McpTool) => loadCredentialResultForTool(codeModeServer, codeModeTool, endUserId, logContext),
      x402PaymentSignature,
      x402EndUserId: endUserId,
      x402ApprovedRequirement,
    });
  }

  if (tool.name === "list_api_endpoints") {
    return {
      mcpResult: {
        content: [{ type: "text", text: JSON.stringify(listApiEndpoints(server, args), null, 2) }],
      },
      status: "success",
      latencyMs: 0,
      method: "ASTRAIL_META",
      path: "list_api_endpoints",
      executionMode: "metadata_catalog",
      upstreamStatus: null,
      traceId: `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      attemptCount: 0,
      errorCode: null,
      error: null,
    } satisfies ToolExecutionResult;
  }

  if (tool.name === "get_api_endpoint_schema") {
    const schemaResult = getApiEndpointSchema(server, args);
    const failed = schemaResult.status === "error";
    return {
      mcpResult: {
        ...(failed ? { isError: true } : {}),
        content: [{ type: "text", text: JSON.stringify(schemaResult, null, 2) }],
      },
      status: failed ? "mapping_required" : "success",
      latencyMs: 0,
      method: "ASTRAIL_META",
      path: "get_api_endpoint_schema",
      executionMode: failed ? "mapping_required" : "metadata_catalog",
      upstreamStatus: null,
      traceId: createRuntimeTraceId(),
      attemptCount: 0,
      errorCode: failed ? "endpoint_not_found" : null,
      error: failed ? "Endpoint not found." : null,
    } satisfies ToolExecutionResult;
  }

  if (tool.name === "invoke_api_endpoint") {
    const endpoint = findCatalogEndpoint(server, args.endpoint_id);
    if (!endpoint) {
      return {
        mcpResult: {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({
            status: "error",
            error_code: "endpoint_not_found",
            endpoint_id: args.endpoint_id ?? null,
            note: "Use list_api_endpoints to find a valid endpoint_id.",
          }, null, 2) }],
        },
        status: "mapping_required",
        latencyMs: 0,
        method: "ASTRAIL_META",
        path: "invoke_api_endpoint",
        executionMode: "mapping_required",
        upstreamStatus: null,
        traceId: createRuntimeTraceId(),
        attemptCount: 0,
        errorCode: "endpoint_not_found",
        error: "Endpoint not found.",
      } satisfies ToolExecutionResult;
    }

    const configuredTool = findCatalogEndpointTool(server, endpoint);
    const endpointTool: McpTool = configuredTool ? {
      ...configuredTool,
      input_schema: endpoint.input_schema ?? configuredTool.input_schema ?? { type: "object", properties: {} },
    } : {
      name: endpointId(endpoint),
      description: endpoint.description || endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      input_schema: endpoint.input_schema ?? { type: "object", properties: {} },
      method: endpoint.method,
      path: endpoint.path,
    };
    const endpointArgs = normalizeToolArguments(args.arguments);
    const validation = validateToolInput(endpointTool.input_schema, endpointArgs);
    if (!validation.ok) {
      return inputValidationFailedResult(endpointTool, validation.issues, endpointTool.input_schema, endpoint.method, endpoint.path);
    }

    const credentialResult = await loadCredentialResultForTool(server, endpointTool, endUserId, logContext);
    return executeToolFromEndpointMap(server, endpointTool, endpointArgs, {
      credential: credentialResult.credential,
      credentialFailure: credentialResult.failure,
      actorRole,
      x402PaymentSignature,
      x402EndUserId: endUserId,
      x402ApprovedRequirement,
    });
  }

  return {
    mcpResult: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ status: "error", error_code: "unknown_meta_tool", tool: tool.name }, null, 2) }],
    },
    status: "mapping_required",
    latencyMs: 0,
    method: "ASTRAIL_META",
    path: tool.name,
	    executionMode: "mapping_required",
	    upstreamStatus: null,
	    traceId: createRuntimeTraceId(),
    attemptCount: 0,
    errorCode: "unknown_meta_tool",
    error: "Unknown meta tool.",
  } satisfies ToolExecutionResult;
}

async function loadServer(serverId: string, requestUrl?: string | URL) {
  const localGenerated = findLocalGeneratedServer(serverId);
  if (localGenerated) return localGenerated;

  const preset = findPresetServer(serverId);
  if (preset) return preset;
  if (serverId === "petstore-openapi") {
    const demo = localDemoServers().find((server) => server.id === "local-openapi");
    if (demo) {
      return {
        ...demo,
        id: "petstore-openapi",
        name: "Public Petstore MCP endpoint",
        description: "Public hosted MCP demo endpoint generated from the Swagger Petstore OpenAPI spec.",
        hosted_endpoint: "/api/mcp/petstore-openapi",
        is_public: true,
      };
    }
  }
  if (serverId === "petstore-code-mode") {
    const demo = localDemoServers().find((server) => server.id === "local-code-mode");
    if (demo) {
      return {
        ...demo,
        id: "petstore-code-mode",
        name: "Public Petstore Code Mode endpoint",
        description: "Public hosted MCP demo endpoint exposing search_docs and execute over the Swagger Petstore endpoint map.",
        hosted_endpoint: "/api/mcp/petstore-code-mode",
        is_public: true,
      };
    }
  }
  if (process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES === "1") {
    const securityFixture = localDemoServers().find((server) => server.id === serverId);
    if (securityFixture?.user_id === localDemoUserId) return securityFixture;
  }
  if (!hasServerNeonEnv()) {
    const preview = await loadLocalPreviewServer(serverId, requestUrl);
    if (preview) return preview;
    const demo = localDemoServers().find((server) => server.id === serverId);
    if (demo) return demo;
    if (serverId === "local-website-preview") {
      return localWebsitePreviewServer();
    }
    return null;
  }

  const db = hasServiceRoleKey() ? createAdminClient() : createPublicClient();
  let query = db
    .from("mcp_servers")
    .select("*")
    .eq("id", serverId);

  if (!hasServiceRoleKey()) {
    query = query.eq("is_public", true);
  }

  const { data, error } = await query.single();

  if (error || !data) return null;
  if (typeof data.hosted_endpoint !== "string" || data.hosted_endpoint.length === 0) return null;
  return {
    ...data,
    hosted_endpoint: resolveMcpEndpoint(String(data.id), data.hosted_endpoint, requestUrl),
  } as McpServer;
}

export async function GET(request: Request, props: { params: Promise<{ serverId: string }> }) {
  const params = await props.params;
  const server = await loadServer(params.serverId, request.url);
  if (!server) return jsonWithCors(request, { error: "MCP server not found." }, 404);

  const authorization = await validateInboundBearer(request, server);
  if (!authorization) {
    return jsonWithCors(request, { error: "Valid Astrail API key or MCP OAuth access token required." }, 401, oauthChallenge(request));
  }

  const endpointUrl = new URL(request.url);
  const tools = toolsVisibleToRequest(server);
  return jsonWithCors(request, {
    name: server.name,
    description: server.description,
    tools: tools.map((tool) => toolListItem(server, tool)),
    endpoint: server.hosted_endpoint ?? `${endpointUrl.origin}/api/mcp/${server.id}`,
    runtime: "metadata-gateway-v1",
    status: server.status ?? "live",
    protocol_version: server.protocol_version ?? "2024-11-05",
    instructions: startupInstructions(server, tools),
    agent_profile: {
      hosted: true,
      deterministic_runtime: true,
      supports_code_mode: isCodeModeServer(tools),
      supports_tool_annotations: true,
      supports_runtime_permissions: true,
      supports_astrail_meta: true,
      supports_json_rpc_batch: true,
      supports_cors_preflight: true,
      supports_non_custodial_x402: server.runtime_policy?.x402?.enabled === true,
    },
    runtime_policy: runtimePolicySummary(server.runtime_policy),
  });
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

function firstRequestId(value: unknown): JsonRpcRequest["id"] {
  if (Array.isArray(value)) {
    const first = value.find(isJsonRpcRequest);
    return jsonRpcRequestId(first);
  }
  return jsonRpcRequestId(value);
}

function toolsVisibleToRequest(server: McpServer) {
  return visibleToolsForRequest(server, server.tools_json ?? [], findEndpointForTool);
}

function toolListItem(server: McpServer, tool: McpTool) {
  return redactSensitive({
    name: tool.name,
    description: agentFacingToolDescription(tool, server.runtime_policy?.business_context),
    inputSchema: tool.input_schema ?? { type: "object", properties: {} },
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    _meta: {
      astrail: {
        ...(tool.x_astrail ?? {}),
        policy: tool.policy ?? defaultToolPolicy(tool, findEndpointForTool(server, tool)),
      },
    },
  });
}

function findRequestedTool(server: McpServer, toolName: unknown) {
  if (typeof toolName !== "string") return { tool: null, denied: false };
  const allTools = server.tools_json ?? [];
  const tool = allTools.find((item) => item.name === toolName) ?? null;
  if (!tool) return { tool: null, denied: false };
  const visible = new Set(toolsVisibleToRequest(server).map((item) => item.name));
  return { tool, denied: !visible.has(tool.name) };
}

function policyForToolCall(server: McpServer, tool: McpTool, args: Record<string, unknown>) {
  if (tool.name === "search_docs" || tool.name === "list_api_endpoints" || tool.name === "get_api_endpoint_schema") return "allow" as const;
  if (tool.name === "invoke_api_endpoint") {
    const endpoint = findCatalogEndpoint(server, args.endpoint_id);
    if (!endpoint) return defaultToolPolicy(tool);
    const configuredTool = findCatalogEndpointTool(server, endpoint);
    return configuredTool?.policy ?? endpoint.policy ?? defaultToolPolicy(configuredTool ?? tool, endpoint);
  }
  return tool.policy ?? defaultToolPolicy(tool, findEndpointForTool(server, tool));
}

async function handleJsonRpcRequest(server: McpServer, body: unknown, approvedExecutionId?: string, caller: AuditCallerContext = anonymousCaller, approvalEvidence?: ToolApprovalRequest | null): Promise<JsonRpcHandlerResult> {
  const { endUserId, actorRole, x402PaymentSignature } = caller;
  if (!isJsonRpcRequest(body) || hasInvalidJsonRpcId(body)) {
    return jsonRpcProtocolError(server, null, -32600, "Invalid JSON-RPC request.", 400, "invalid_json_rpc_request");
  }
  if (body.jsonrpc !== "2.0") {
    return jsonRpcProtocolError(server, body.id ?? null, -32600, "JSON-RPC version must be 2.0.", 400, "invalid_json_rpc_version");
  }
  if (typeof body.method !== "string" || !body.method.trim()) {
    return jsonRpcProtocolError(server, body.id ?? null, -32600, "JSON-RPC method is required.", 400, "missing_json_rpc_method");
  }

  const tools = toolsVisibleToRequest(server);

  if (body.method.startsWith("notifications/")) {
    return { payload: null, status: 204 };
  }

  if (body.method === "initialize") {
    return {
      payload: jsonRpcPayload(body.id, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: server.name, version: "1.0.0" },
        capabilities: { tools: {} },
        instructions: startupInstructions(server, tools),
      }),
      status: 200,
    };
  }

  if (body.method === "ping") {
    return {
      payload: jsonRpcPayload(body.id, {}),
      status: 200,
    };
  }

  if (body.method === "tools/list") {
    return {
      payload: jsonRpcPayload(body.id, {
        tools: tools.map((tool) => toolListItem(server, tool)),
      }),
      status: 200,
    };
  }

  if (body.method === "astrail/resume") {
    const executionId = body.params?.execution_id;
    if (typeof executionId !== "string" || !executionId) {
      return jsonRpcProtocolError(server, body.id, -32602, "execution_id is required.", 400, "missing_execution_id");
    }
    const approved = await loadApprovedToolRequest(server, executionId);
    if (!approved.ok) {
      return { payload: jsonRpcPayload(body.id, approvalResumeFailure(executionId, approved.code)), status: 200 };
    }
    if ((approved.request.agent_id && approved.request.agent_id !== caller.agentId)
      || (approved.request.task_authorization_id && approved.request.task_authorization_id !== caller.task?.id)) {
      return { payload: jsonRpcPayload(body.id, approvalResumeFailure(executionId, "approval_identity_mismatch")), status: 403 };
    }
    return handleJsonRpcRequest(server, {
      jsonrpc: "2.0",
      id: body.id,
      method: "tools/call",
      params: { name: approved.request.tool_name, arguments: approved.arguments },
    }, executionId, caller, approved.request);
  }

  if (body.method === "tools/call") {
    const toolName = body.params?.name;
    const { tool, denied } = findRequestedTool(server, toolName);
    if (!tool) return jsonRpcProtocolError(server, body.id, -32602, "Unknown tool.", 400, "unknown_tool");
    const logContext: ToolLogContext = {
      endUserId,
      actorRole,
      apiKeyId: caller.apiKeyId,
      apiKeyName: caller.apiKeyName,
      apiKeyPreview: caller.apiKeyPreview,
      clientName: caller.clientName,
      credentialRefs: [],
      agentId: caller.agentId,
      task: caller.task,
      authorizationDecision: null,
      approval: approvalEvidence ?? null,
    };
    if (denied) {
      const execution = permissionDeniedExecutionResult(tool);
      await logToolExecution(server, tool.name, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }
    const rawToolArgs = normalizeToolArguments(body.params?.arguments);
    const x402Approval = splitX402ApprovalContext(rawToolArgs);
    if (x402Approval.hadContext && !approvedExecutionId) {
      const execution = permissionDeniedExecutionResult(tool);
      execution.errorCode = "x402_approval_context_forged";
      execution.error = "x402 approval context is only accepted from Astrail's encrypted approval store.";
      await logToolExecution(server, tool.name, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 403 };
    }
    const toolArgs = x402Approval.args;
    logContext.args = toolArgs;
    const inputValidation = validateToolInput(tool.input_schema ?? { type: "object", properties: {} }, toolArgs);
    if (!inputValidation.ok) {
      const execution = inputValidationFailedResult(tool, inputValidation.issues, tool.input_schema ?? { type: "object", properties: {} });
      await logToolExecution(server, tool.name, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }

    const toolPolicy = policyForToolCall(server, tool, toolArgs);
    if (toolPolicy === "block") {
      const execution = permissionDeniedExecutionResult(tool);
      await logToolExecution(server, tool.name, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
    }

    const isMetaTool = tool.method === "ASTRAIL_META" || tool.method === "ASTRAIL_CODE";
    const endpoint = isMetaTool ? null : findEndpointForTool(server, tool);
    logContext.affectedResources = affectedResources(endpoint ?? null, toolArgs);
    if (endpoint) {
      logContext.effectiveScopes = oauthRequiredScopes(endpoint);
      logContext.policyResult = evaluateRuntimePermission(server.runtime_policy, endpoint, tool, { actorRole });
    }
    let composableRequiresApproval = false;
    if (endpoint && caller.agentId) {
      const decision = evaluateComposableAuthorization({
        tool, endpoint, serverPolicy: server.runtime_policy, actorRole,
        agentId: caller.agentId, agentPolicy: caller.agentPolicy, task: caller.task,
      });
      logContext.authorizationDecision = decision;
      logContext.policyResult = decision;
      composableRequiresApproval = decision.requiresApproval;
      if (!decision.allowed) {
        const execution = composableDeniedExecutionResult(tool, decision);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 403 };
      }
    }

    const billing = await checkBillingAllowance(server.user_id);
    if (!billing.allowed) {
      const execution = billingRequiredResult(tool.name, billing.summary);
      await logToolExecution(server, tool.name, execution, logContext);
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 402 };
    }

    // Idempotent replay happens before the approval gate: the recorded call
    // already went through approval and executed, so a retry after an
    // ambiguous failure must not run (or ask a human about) the action twice.
    const idempotencyKey = isMetaTool ? null : extractIdempotencyKey(toolArgs);
    const authorizationFingerprint = idempotencyAuthorizationFingerprint(endpoint, toolPolicy, server.runtime_policy);
    let scopedIdempotencyKey: string | null = null;
    let idempotencyClaimToken: string | null = null;
    let credentialResultForExecution: Awaited<ReturnType<typeof loadRuntimeCredentialResultForTool>> | null = null;
    if (idempotencyKey) {
      if (endpoint) {
        const runtimePermission = evaluateRuntimePermission(server.runtime_policy, endpoint, tool, { actorRole });
        if (!runtimePermission.allowed) {
          const execution = permissionDeniedExecutionResult(tool);
          await logToolExecution(server, tool.name, execution, logContext);
          return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
        }
      }
      credentialResultForExecution = await loadCredentialResultForTool(server, tool, endUserId, logContext);
      if (credentialResultForExecution.failure || (endpoint && endpointRequiresAuth(endpoint) && !credentialResultForExecution.credential)) {
        const execution = await executeToolFromEndpointMap(server, tool, toolArgs, {
          credential: credentialResultForExecution.credential,
          credentialFailure: credentialResultForExecution.failure,
          actorRole,
          idempotencyKey,
          x402PaymentSignature,
          x402EndUserId: endUserId,
          x402ApprovedRequirement: x402Approval.requirement,
        });
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
      scopedIdempotencyKey = scopeIdempotencyKey(
        idempotencyKey,
        endUserId,
        actorRole,
        `${authorizationFingerprint}:${credentialResultForExecution.credential?.identityVersion ?? "public"}`,
      );
      if (await toolExecutionKeyExists(server, tool.name, idempotencyKey)) {
        const execution = idempotencyUnavailableResult(tool.name, idempotencyKey, true);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 409 };
      }
      const recorded = await findRecordedToolExecution(server, tool.name, scopedIdempotencyKey as string);
      if (recorded) {
        const execution = replayedExecutionResult(tool.name, idempotencyKey, recorded);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
    }

    if ((toolPolicy === "approval" || composableRequiresApproval) && !approvedExecutionId) {
      try {
        const approval = await createToolApprovalRequest(server, tool, toolArgs, {
          agentId: caller.agentId, taskAuthorizationId: caller.task?.id, decision: logContext.authorizationDecision,
        });
        const execution = approvalRequiredExecutionResult(tool, approval);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      } catch {
        const execution = approvalStorageUnavailableExecutionResult(tool);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 503 };
      }
    }

    const rateLimit = checkRuntimeRateLimit(`${server.id}:${tool.name}`);
    if (!rateLimit.allowed) {
      const reason = "runtime_rate_limited";
      const resetAt = new Date(rateLimit.resetAt).toISOString();
      const audit = auditMcpSecurityEvent({
        route: "mcp_server",
        server_id: server.id,
        tool_name: tool.name,
        reason,
        status: 429,
        reset_at: resetAt,
      });
      const execution = rateLimitedExecutionResult(tool, resetAt, audit.trace_id);
      if (shouldPersistRateLimitAudit(`server:${server.id}:${tool.name}`, rateLimit.resetAt)) {
        await logToolExecution(server, tool.name, execution, logContext);
      }
      return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 429 };
    }

    if (idempotencyKey) {
      const claim = await claimToolExecution(server, tool.name, scopedIdempotencyKey as string);
      if (claim.status === "replay") {
        const execution = replayedExecutionResult(tool.name, idempotencyKey, claim.recorded);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
      }
      if (claim.status === "in_progress") {
        const execution = idempotencyInProgressResult(tool.name, idempotencyKey);
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 409 };
      }
      if (claim.status === "in_doubt" || claim.status === "unavailable") {
        const execution = idempotencyUnavailableResult(tool.name, idempotencyKey, claim.status === "in_doubt");
        await logToolExecution(server, tool.name, execution, logContext);
        return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 503 };
      }
      idempotencyClaimToken = claim.claimToken;
    }

    await incrementCallCount(server);
    let execution: ToolExecutionResult;
    if (isMetaTool) {
      execution = await executeMetaTool(server, tool, toolArgs, endUserId, actorRole, logContext, x402PaymentSignature, x402Approval.requirement);
    } else if (server.source_type === "preset" && (!Array.isArray(server.endpoint_map) || server.endpoint_map.length === 0)) {
      execution = presetTemplateExecution(server, tool);
    } else {
      const credentialResult = credentialResultForExecution ?? (await loadCredentialResultForTool(server, tool, endUserId, logContext));
      rememberCredential(logContext, credentialResult.credential);
      execution = await executeToolFromEndpointMap(server, tool, toolArgs, {
        credential: credentialResult.credential,
        credentialFailure: credentialResult.failure,
        actorRole,
        idempotencyKey,
        x402PaymentSignature,
        x402EndUserId: endUserId,
        x402ApprovedRequirement: x402Approval.requirement,
      });
    }
    if (execution.x402ApprovalRequirement) {
      if (idempotencyKey && idempotencyClaimToken) {
        await releaseToolExecutionClaim(server, tool.name, scopedIdempotencyKey as string, idempotencyClaimToken);
      }
      try {
        const approval = await createToolApprovalRequest(
          server,
          tool,
          withX402ApprovalContext(toolArgs, execution.x402ApprovalRequirement),
        );
        const approvalExecution = x402ApprovalRequiredExecutionResult(tool, approval, execution.x402ApprovalRequirement);
        await logToolExecution(server, tool.name, approvalExecution, logContext);
        if (approvedExecutionId) await markToolApprovalExecuted(server, approvedExecutionId);
        return { payload: jsonRpcPayload(body.id, approvalExecution.mcpResult), status: 200 };
      } catch {
        const approvalExecution = approvalStorageUnavailableExecutionResult(tool);
        await logToolExecution(server, tool.name, approvalExecution, logContext);
        return { payload: jsonRpcPayload(body.id, approvalExecution.mcpResult), status: 503 };
      }
    }
    if (idempotencyKey && idempotencyClaimToken) {
      if (execution.status !== "payment_required" && execution.status !== "approval_required" && (execution.status === "success" || execution.attemptCount > 0)) {
        await recordToolExecution(server, tool.name, scopedIdempotencyKey as string, execution, idempotencyClaimToken);
      }
      else await releaseToolExecutionClaim(server, tool.name, scopedIdempotencyKey as string, idempotencyClaimToken);
    }
    await logToolExecution(server, tool.name, execution, logContext);
    if (approvedExecutionId) await markToolApprovalExecuted(server, approvedExecutionId);
    return { payload: jsonRpcPayload(body.id, execution.mcpResult), status: 200 };
  }

  return jsonRpcProtocolError(server, body.id, -32601, "Method not found.", 404, "method_not_found");
}

async function handleBatchItem(server: McpServer, item: unknown, caller: AuditCallerContext): Promise<JsonRpcHandlerResult> {
  return isolateBatchItem(
    () => handleJsonRpcRequest(server, item, undefined, caller),
    () => {
      const traceId = createRuntimeTraceId();
      writeStructuredLog({
        event: "astrail.mcp.batch_item_failed",
        trace_id: traceId,
        server_id: server.id,
        reason: "unhandled_batch_item_error",
      });
      return {
        payload: jsonRpcErrorPayload(jsonRpcRequestId(item), -32603, "This batch item failed without cancelling the other requests.", {
          reason: "batch_item_failed",
          status: 500,
          trace_id: traceId,
        }),
        status: 200,
      };
    },
  );
}

export async function POST(request: Request, props: { params: Promise<{ serverId: string }> }) {
  const params = await props.params;
  if (requestPayloadTooLarge(request)) {
    const reason = "payload_too_large";
    const audit = auditMcpSecurityEvent({
      route: "mcp_server",
      server_id: params.serverId,
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
      route: "mcp_server",
      server_id: params.serverId,
      reason,
      status: 400,
      content_length: request.headers.get("content-length"),
    });
    return jsonRpcError(request, null, -32700, "Invalid JSON-RPC payload.", 400, auditErrorData(audit, 400, reason));
  }

  const envelopeError = validateJsonRpcEnvelope(body);
  if (envelopeError) {
    return jsonRpcPreloadProtocolError(request, params.serverId, envelopeError);
  }

  const server = await loadServer(params.serverId, request.url);
  if (!server) return jsonRpcError(request, firstRequestId(body), -32004, "MCP server not found.", 404);

  const authorization = await validateInboundBearer(request, server);
  if (!authorization) {
    const reason = "invalid_or_missing_api_key";
    const audit = auditMcpSecurityEvent({
      route: "mcp_server",
      server_id: server.id,
      reason,
      status: 401,
      is_public: server.is_public,
    });
    const response = jsonRpcError(request, firstRequestId(body), -32001, "Valid Astrail API key or MCP OAuth access token required.", 401, auditErrorData(audit, 401, reason));
    response.headers.set("WWW-Authenticate", bearerChallenge(new URL(request.url).origin, "invalid_token", "A valid bearer token is required."));
    return response;
  }

  const context = await callerContext(request, server, authorization);
  if (context.error) {
    return jsonRpcError(request, firstRequestId(body), -32003, context.error, 403);
  }
  const caller = context as AuditCallerContext;
  if (Array.isArray(body) && caller.x402PaymentSignature) {
    return jsonRpcError(request, firstRequestId(body), -32600, "PAYMENT-SIGNATURE can authorize only one JSON-RPC request, not a batch.", 400);
  }
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((item) => handleBatchItem(server, item, caller)));
    const payloads = results.map((result) => result.payload).filter((payload): payload is JsonRpcResponsePayload => Boolean(payload));
    if (payloads.length === 0) {
      return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
    }
    return jsonWithCors(request, payloads);
  }

  const result = await handleJsonRpcRequest(server, body, undefined, caller);
  if (!result.payload) {
    return new NextResponse(null, { status: result.status, headers: corsHeaders(request) });
  }
  return jsonWithCors(request, result.payload, result.status);
}
