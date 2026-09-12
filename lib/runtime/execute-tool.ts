import type { CredentialAuditRef, McpServer, McpTool, OpenApiEndpoint } from "@/lib/types";
import { callRemoteMcpTool } from "@/lib/mcp-proxy";
import { checkUpstreamCircuit, reportUpstreamFailure, reportUpstreamSuccess } from "@/lib/runtime/circuit-breaker";
import { applyArgumentMappings, applyResponseMappings } from "@/lib/runtime/field-mapping";
import { normalizeExecutionPolicy, retryDelayMs as executionRetryDelayMs, waitBeforeRetry } from "@/lib/runtime/execution-policy";
import { assertPublicHttpUrl, assertSafeUpstreamUrl, createPinnedPublicDispatcher, isBlockedRuntimeHostname, NetworkPolicyError } from "@/lib/runtime/network-policy";
import { executeWebsiteReadWithPlaywright } from "@/lib/runtime/playwright-website";
import { getCachedUpstreamResponse, responseCacheKey, storeCachedUpstreamResponse } from "@/lib/runtime/response-cache";
import { evaluateRuntimePermission, redactSensitive, redactText, runtimePolicySummary } from "@/lib/runtime/permissions";
import { evaluateOAuthScopeGrant, hasAmbiguousScopedSecurityRequirement, hasOAuthSecurityRequirement } from "@/lib/runtime/oauth-security";
import { acquireReliabilityPermit, consumeProviderRetryBudget, recordProviderOutcome, recordReliabilityMetric } from "@/lib/runtime/reliability-control-plane";
import {
  finalizeX402Receipt,
  inspectX402PaymentRequired,
  prepareX402Payment,
  recordX402Challenge,
  type PreparedX402Payment,
  type X402Requirement,
} from "@/lib/runtime/x402";

export { evaluateOAuthScopeGrant, hasOAuthSecurityRequirement } from "@/lib/runtime/oauth-security";

export type ToolExecutionStatus =
  | "success"
  | "validation_failed"
  | "auth_required"
  | "oauth_required"
  | "mapping_required"
  | "browser_runtime_required"
  | "billing_required"
  | "approval_required"
  | "payment_required"
  | "permission_denied"
  | "rate_limited"
  | "error";

export type ToolExecutionResult = {
  mcpResult: {
    content: Array<{
      type: "text";
      text: string;
    }>;
    isError?: boolean;
  };
  status: ToolExecutionStatus;
  latencyMs: number;
  method: string | null;
  path: string | null;
  executionMode: "safe_rest_execution" | "safe_rest_execution_with_auth" | "mcp_proxy" | "website_browser_runtime" | "metadata_catalog" | "code_mode" | "auth_required" | "oauth_required" | "mapping_required" | "browser_runtime_required" | "billing_required" | "approval_required" | "approval_storage_unavailable" | "payment_required" | "x402_payment" | "x402_policy_denied" | "validation_failed" | "permission_denied" | "rate_limited";
  upstreamStatus: number | null;
  traceId: string;
  attemptCount: number;
  errorCode: string | null;
  error: string | null;
  x402ApprovalRequirement?: X402Requirement;
};

type RequestBuildResult =
  | { url: URL; init: RequestInit }
  | { error: string; code: string };

export type RuntimeCredential = {
  scheme: "bearer" | "api_key_header" | "api_key_query" | "oauth2";
  secret: string;
  injectionName?: string | null;
  identityVersion?: string;
  auditRef?: CredentialAuditRef;
};

export type UpstreamCredentialFailure = {
  code: "reauth_required" | "refresh_failed" | "refresh_unavailable" | "insufficient_scope" | "credential_backend_unavailable";
  provider: string | null;
  message: string;
  requiredScopes?: string[];
  missingScopes?: string[];
};

const MAX_ARGUMENT_BYTES = 32_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_000_000;
const SENSITIVE_QUERY_KEYS = /(^|_)(api_?key|access_?token|auth|authorization|bearer|client_?secret|password|refresh_?token|secret|signature|token)($|_)/i;
const FORBIDDEN_STATIC_HEADER = /^(authorization|cookie|host|proxy-authorization|set-cookie|x-api-key)$/i;
const MIN_EXPLICIT_SECRET_LENGTH = 6;
const MAX_EXPLICIT_REDACTION_SECRETS = 50;

function createTraceId() {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function textResult(value: unknown, isError = false): ToolExecutionResult["mcpResult"] {
  return {
    ...(isError ? { isError: true } : {}),
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function readResponseBody(response: Response) {
  if (!response.body) {
    const text = await response.text();
    return {
      text: text.slice(0, MAX_UPSTREAM_RESPONSE_BYTES),
      bytes: Buffer.byteLength(text),
      truncated: Buffer.byteLength(text) > MAX_UPSTREAM_RESPONSE_BYTES,
    };
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = Buffer.from(value);
      const remaining = MAX_UPSTREAM_RESPONSE_BYTES - bytes;
      if (chunk.byteLength > remaining) {
        if (remaining > 0) {
          chunks.push(chunk.subarray(0, remaining));
          bytes += remaining;
        }
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(chunk);
      bytes += chunk.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  return {
    text: Buffer.concat(chunks).toString("utf8"),
    bytes,
    truncated,
  };
}

function redactUrl(url: URL, credential: RuntimeCredential | null) {
  const redacted = new URL(url.toString());
  for (const key of Array.from(redacted.searchParams.keys())) {
    if (SENSITIVE_QUERY_KEYS.test(key)) {
      redacted.searchParams.set(key, "[redacted]");
    }
  }

  if (credential?.scheme === "api_key_query") {
    redacted.searchParams.set(credential.injectionName?.trim() || "api_key", "[redacted]");
  }

  return redacted.toString();
}

function isLocalSecuritySmokeUrl(url: URL) {
  if (process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES !== "1") return false;
  if (!url.pathname.startsWith("/api/security-smoke/")) return false;
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function collectSensitiveArgumentSecrets(value: unknown, inheritedSensitive = false, seen = new WeakSet<object>()): string[] {
  const secrets = new Set<string>();

  function visit(nested: unknown, sensitive: boolean) {
    if (secrets.size >= MAX_EXPLICIT_REDACTION_SECRETS) return;

    if (typeof nested === "string") {
      if (sensitive && nested.trim().length >= MIN_EXPLICIT_SECRET_LENGTH) {
        secrets.add(nested);
      }
      return;
    }

    if (!nested || typeof nested !== "object") return;
    if (seen.has(nested)) return;
    seen.add(nested);

    if (Array.isArray(nested)) {
      for (const item of nested) visit(item, sensitive);
      return;
    }

    for (const [key, item] of Object.entries(nested as Record<string, unknown>)) {
      visit(item, sensitive || SENSITIVE_QUERY_KEYS.test(key));
    }
  }

  visit(value, inheritedSensitive);
  return Array.from(secrets);
}

function parameterName(parameter: unknown) {
  if (!parameter || typeof parameter !== "object") return null;
  const name = (parameter as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

function parameterLocation(parameter: unknown) {
  if (!parameter || typeof parameter !== "object") return null;
  const location = (parameter as Record<string, unknown>).in;
  return typeof location === "string" ? location : null;
}

function parameterRequired(parameter: unknown) {
  return Boolean(parameter && typeof parameter === "object" && (parameter as Record<string, unknown>).required === true);
}

function toolSchemaProperties(tool: McpTool) {
  const schema = tool.input_schema;
  if (!schema || typeof schema !== "object") return {};
  const properties = schema.properties;
  return properties && typeof properties === "object" ? properties as Record<string, unknown> : {};
}

function schemaRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function argumentNameForParameter(tool: McpTool, parameter: unknown) {
  const name = parameterName(parameter);
  const location = parameterLocation(parameter);
  if (!name || !location) return name;

  for (const [argumentName, schema] of Object.entries(toolSchemaProperties(tool))) {
    const record = schemaRecord(schema);
    if (record["x-astrail-name"] === name && record["x-astrail-in"] === location) {
      return argumentName;
    }
  }

  return name;
}

function coerceClientJsonValue(value: unknown, schema: unknown) {
  if (typeof value !== "string") return value;
  const record = schemaRecord(schema);
  if (!["object", "array"].includes(String(record.type ?? ""))) return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function argumentValue(args: Record<string, unknown>, tool: McpTool, argumentName: string | null) {
  if (!argumentName) return undefined;
  const schema = toolSchemaProperties(tool)[argumentName];
  return coerceClientJsonValue(args[argumentName], schema);
}

export function hasSecurityRequirement(endpoint: OpenApiEndpoint) {
  if (endpoint.requires_auth === true) return true;
  const security = endpoint.security_requirements ?? endpoint.security;
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

export function findEndpointForTool(server: McpServer, tool: McpTool) {
  const endpoints = Array.isArray(server.endpoint_map) ? server.endpoint_map : [];
  return endpoints.find((endpoint) => endpoint.tool_name === tool.name)
    ?? endpoints.find((endpoint) => endpoint.method === tool.method && endpoint.path === tool.path)
    ?? endpoints.find((endpoint) => endpoint.operation_id === tool.name);
}

function endpointId(endpoint: OpenApiEndpoint) {
  return endpoint.tool_name || endpoint.operation_id || `${endpoint.method} ${endpoint.path}`;
}

function buildUrl(endpoint: OpenApiEndpoint, path: string): URL | { error: string; code: string } {
  if (!endpoint.base_url) {
    return { error: "Tool validated, but live execution requires endpoint mapping.", code: "mapping_missing_base_url" };
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(endpoint.base_url);
  } catch {
    return { error: "Endpoint mapping has an invalid upstream base URL.", code: "mapping_invalid_base_url" };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("//")) {
    return { error: "Endpoint paths must be relative to the bound upstream API.", code: "mapping_absolute_path_blocked" };
  }

  const url = new URL(path.replace(/^\//, ""), baseUrl.href.endsWith("/") ? baseUrl.href : `${baseUrl.href}/`);
  if (url.origin !== baseUrl.origin) {
    return { error: "Endpoint path escaped the bound upstream API origin.", code: "mapping_origin_mismatch" };
  }
  if (isLocalSecuritySmokeUrl(url)) return url;

  try {
    assertPublicHttpUrl(url);
  } catch {
    return { error: "Endpoint mapping points to a blocked or unsupported upstream URL.", code: "mapping_blocked_upstream" };
  }

  return url;
}

function appendQueryValue(url: URL, name: string, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item !== undefined && item !== null && item !== "") {
        url.searchParams.append(name, String(item));
      }
    }
    return;
  }

  if (value !== undefined && value !== null && value !== "") {
    url.searchParams.set(name, String(value));
  }
}

function buildBodyFromToolSchema(tool: McpTool, args: Record<string, unknown>, consumed: Set<string>) {
  const bodyEntries = Object.entries(toolSchemaProperties(tool)).filter(([, schema]) => {
    const record = schemaRecord(schema);
    return record["x-astrail-in"] === "body";
  });

  if (bodyEntries.length === 0) {
    return "body" in args
      ? args.body
      : Object.fromEntries(Object.entries(args).filter(([key]) => !consumed.has(key)));
  }

  if (bodyEntries.length === 1) {
    const [argumentName, schema] = bodyEntries[0];
    const record = schemaRecord(schema);
    if (record["x-astrail-name"] === "body") {
      consumed.add(argumentName);
      return coerceClientJsonValue(args[argumentName], schema);
    }
  }

  const body: Record<string, unknown> = {};
  for (const [argumentName, schema] of bodyEntries) {
    const record = schemaRecord(schema);
    const bodyName = typeof record["x-astrail-name"] === "string" ? record["x-astrail-name"] : argumentName;
    const value = coerceClientJsonValue(args[argumentName], schema);
    consumed.add(argumentName);
    if (value !== undefined) body[bodyName] = value;
  }

  return body;
}

function endpointRequestBodySchema(endpoint: OpenApiEndpoint) {
  const schema = endpoint.request_body_schema;
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : {};
}

function buildGraphqlBody(endpoint: OpenApiEndpoint, tool: McpTool, args: Record<string, unknown>, consumed: Set<string>) {
  const schema = endpointRequestBodySchema(endpoint);
  const query = typeof schema["x-astrail-graphql-query"] === "string" ? schema["x-astrail-graphql-query"] : "";
  const operationName = typeof schema["x-astrail-graphql-operation-name"] === "string" ? schema["x-astrail-graphql-operation-name"] : endpoint.operation_id;
  const variables: Record<string, unknown> = {};

  for (const [argumentName, propertySchema] of Object.entries(toolSchemaProperties(tool))) {
    const record = schemaRecord(propertySchema);
    if (record["x-astrail-in"] !== "body") continue;
    const variableName = typeof record["x-astrail-name"] === "string" ? record["x-astrail-name"] : argumentName;
    const value = coerceClientJsonValue(args[argumentName], propertySchema);
    consumed.add(argumentName);
    if (value !== undefined) variables[variableName] = value;
  }

  return {
    query,
    operationName,
    variables,
  };
}

export function buildRequest(endpoint: OpenApiEndpoint, tool: McpTool, args: Record<string, unknown>): RequestBuildResult {
  const method = endpoint.method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { error: `Live deterministic execution does not support ${method}.`, code: "method_not_supported" };
  }

  if (JSON.stringify(args).length > MAX_ARGUMENT_BYTES) {
    return { error: "Tool arguments exceed the safe runtime size limit.", code: "arguments_too_large" };
  }

  let path = endpoint.path;
  let baseUrl = endpoint.base_url;
  const consumed = new Set<string>();
  const params = Array.isArray(endpoint.parameters) ? endpoint.parameters : [];

  for (const parameter of params) {
    if (parameterLocation(parameter) !== "base_url") continue;
    const name = parameterName(parameter);
    if (!name) continue;
    const argumentName = argumentNameForParameter(tool, parameter);
    const value = argumentValue(args, tool, argumentName);
    if ((value === undefined || value === null || value === "") && parameterRequired(parameter)) {
      return { error: `Missing required upstream tenant parameter: ${name}.`, code: "missing_base_url_parameter" };
    }
    if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(value)) {
      return { error: `Invalid upstream tenant parameter: ${name}.`, code: "invalid_base_url_parameter" };
    }
    if (argumentName) consumed.add(argumentName);
    baseUrl = baseUrl?.replace(new RegExp(`\\{${name}\\}`, "g"), value);
  }
  if (baseUrl?.includes("{") || baseUrl?.includes("}")) {
    return { error: "Missing required upstream tenant parameter.", code: "missing_base_url_parameter" };
  }

  for (const parameter of params) {
    if (parameterLocation(parameter) !== "path") continue;
    const name = parameterName(parameter);
    if (!name) continue;
    const argumentName = argumentNameForParameter(tool, parameter);
    const value = argumentValue(args, tool, argumentName);
    if ((value === undefined || value === null || value === "") && parameterRequired(parameter)) {
      return { error: `Missing required path parameter: ${name}.`, code: "missing_path_parameter" };
    }
    if (argumentName) consumed.add(argumentName);
    path = path.replace(new RegExp(`\\{${name}\\}`, "g"), encodeURIComponent(String(value ?? "")));
  }

  if (path.includes("{") || path.includes("}")) {
    return { error: "Missing required path parameter for mapped endpoint.", code: "missing_path_parameter" };
  }

  const requestEndpoint = baseUrl === endpoint.base_url ? endpoint : { ...endpoint, base_url: baseUrl };
  const urlResult = endpoint.runtime_kind === "graphql" ? buildUrl(requestEndpoint, "") : buildUrl(requestEndpoint, path);
  if ("error" in urlResult) return urlResult;

  for (const parameter of params) {
    if (parameterLocation(parameter) !== "query") continue;
    const name = parameterName(parameter);
    if (!name) continue;
    const argumentName = argumentNameForParameter(tool, parameter);
    const value = argumentValue(args, tool, argumentName);
    if ((value === undefined || value === null || value === "") && parameterRequired(parameter)) {
      return { error: `Missing required query parameter: ${name}.`, code: "missing_query_parameter" };
    }
    if (argumentName) consumed.add(argumentName);
    appendQueryValue(urlResult, name, value);
  }

  const headerValues: Record<string, string> = {};
  for (const parameter of params) {
    if (parameterLocation(parameter) !== "header") continue;
    const name = parameterName(parameter);
    if (!name) continue;
    const argumentName = argumentNameForParameter(tool, parameter);
    const value = argumentValue(args, tool, argumentName);
    if ((value === undefined || value === null || value === "") && parameterRequired(parameter)) {
      return { error: `Missing required header parameter: ${name}.`, code: "missing_header_parameter" };
    }
    if (argumentName) consumed.add(argumentName);
    if (value !== undefined && value !== null && value !== "") {
      headerValues[name] = String(value);
    }
  }

  if (method === "GET") {
    for (const [name, value] of Object.entries(args)) {
      if (!consumed.has(name)) {
        appendQueryValue(urlResult, name, value);
      }
    }
  }

  const init: RequestInit = {
    method,
    headers: {
      accept: "application/json, text/plain, */*",
      ...Object.fromEntries(Object.entries(endpoint.static_headers ?? {}).filter(([name, value]) =>
        !FORBIDDEN_STATIC_HEADER.test(name)
        && /^[A-Za-z0-9-]+$/.test(name)
        && typeof value === "string"
        && value.length <= 500
        && !/[\r\n]/.test(value)
      )),
      ...headerValues,
    },
    redirect: "manual",
  };

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const body = endpoint.runtime_kind === "graphql"
      ? buildGraphqlBody(endpoint, tool, args, consumed)
      : buildBodyFromToolSchema(tool, args, consumed);
    init.body = JSON.stringify(body);
    init.headers = {
      ...init.headers,
      "content-type": "application/json",
    };
  }

  return { url: urlResult, init };
}

function buildBrowserUrl(endpoint: OpenApiEndpoint, tool: McpTool, args: Record<string, unknown>) {
  const target = endpoint.target_url;
  if (!target) {
    return { error: "This browser workflow needs an isolated browser runtime because no static target URL is mapped.", code: "browser_target_missing" };
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { error: "Browser workflow has an invalid target URL.", code: "browser_target_invalid" };
  }

  if (!["http:", "https:"].includes(url.protocol) || isBlockedRuntimeHostname(url.hostname)) {
    return { error: "Browser workflow points to a blocked or unsupported target URL.", code: "browser_target_blocked" };
  }

  if (endpoint.browser_action === "submit_form") {
    const formMethod = typeof endpoint.request_body === "object" && endpoint.request_body
      ? String((endpoint.request_body as Record<string, unknown>).method ?? "GET").toUpperCase()
      : "GET";
    if (formMethod !== "GET") {
      return { error: "POST form execution requires an isolated browser runtime and user review.", code: "browser_post_form_requires_runtime" };
    }
    for (const parameter of Array.isArray(endpoint.parameters) ? endpoint.parameters : []) {
      const name = parameterName(parameter);
      if (!name || name === "instruction") continue;
      const argumentName = argumentNameForParameter(tool, parameter);
      const value = argumentValue(args, tool, argumentName);
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(name, String(value));
      }
    }
  }

  return { url };
}

async function executeBrowserWorkflow(
  endpoint: OpenApiEndpoint,
  tool: McpTool,
  args: Record<string, unknown>,
  startedAt: number,
  traceId: string,
  credential: RuntimeCredential | null
): Promise<ToolExecutionResult> {
  if (!["open_page", "follow_link", "submit_form"].includes(endpoint.browser_action ?? "")) {
    return executionResult({
      status: "browser_runtime_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: "browser_runtime_required",
      action: endpoint.browser_action ?? "unknown",
      selector: endpoint.selector ?? null,
      target_url: endpoint.target_url ?? null,
      note: "This website workflow needs an isolated Playwright runtime because it depends on an interactive browser action.",
    }, "browser_runtime_required", endpoint, startedAt, traceId, "browser_runtime_required", null, null, 0, "browser_runtime_required");
  }

  const target = buildBrowserUrl(endpoint, tool, args);
  if ("error" in target) {
    return executionResult({
      status: "browser_runtime_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: target.code,
      action: endpoint.browser_action,
      selector: endpoint.selector ?? null,
      target_url: endpoint.target_url ?? null,
      note: target.error,
    }, "browser_runtime_required", endpoint, startedAt, traceId, "browser_runtime_required", target.error, null, 0, target.code);
  }

  try {
    const execution = await executeWebsiteReadWithPlaywright(target.url.toString(), traceId, [
      `tool:${tool.name}`,
      `action:${endpoint.browser_action ?? "unknown"}`,
      endpoint.selector ? `selector:${endpoint.selector}` : "selector:none",
    ]);
    return executionResult({
      status: "success",
      tool: tool.name,
      trace_id: traceId,
      action: endpoint.browser_action,
      selector: endpoint.selector ?? null,
      request: {
        method: "PLAYWRIGHT",
        url: target.url.toString(),
        attempt: 1,
      },
      response: {
        status: execution.status,
        final_url: execution.finalUrl,
        title: execution.title,
        text_preview: execution.visibleTextPreview,
        screenshot: execution.screenshotPath,
      },
      action_history: execution.actionHistory,
      note: "Executed with Astrail's Playwright-backed website runtime. Auth, sessions, and complex workflows still require sandbox review.",
    }, "success", endpoint, startedAt, traceId, "website_browser_runtime", null, execution.status, 1, null);
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : "Unknown website runtime error");
    return executionResult({
      status: "error",
      tool: tool.name,
      trace_id: traceId,
      error_code: message.toLowerCase().includes("timeout") ? "browser_runtime_timeout" : "browser_runtime_fetch_error",
      error: message,
    }, "error", endpoint, startedAt, traceId, "website_browser_runtime", message, null, 1, message.toLowerCase().includes("timeout") ? "browser_runtime_timeout" : "browser_runtime_fetch_error");
  }
}

async function executeMcpProxyTool(
  endpoint: OpenApiEndpoint,
  tool: McpTool,
  args: Record<string, unknown>,
  startedAt: number,
  traceId: string,
  credential: RuntimeCredential | null
): Promise<ToolExecutionResult> {
  if (!endpoint.base_url) {
    return executionResult({
      status: "mapping_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: "mcp_proxy_missing_endpoint",
      note: "This imported MCP tool is missing its upstream MCP endpoint URL.",
    }, "mapping_required", endpoint, startedAt, traceId, "mapping_required", "Imported MCP endpoint URL is missing.", null, 0, "mcp_proxy_missing_endpoint");
  }

  try {
    const upstreamToolName = endpoint.path || tool.name;
    const result = await callRemoteMcpTool(endpoint.base_url, upstreamToolName, args, credential);
    const record = result && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown>
      : {};
    const remoteIsError = record.isError === true;

    return executionResult({
      status: remoteIsError ? "error" : "success",
      tool: tool.name,
      trace_id: traceId,
      upstream_mcp_endpoint: endpoint.base_url,
      upstream_mcp_result: redactSensitive(result),
    }, remoteIsError ? "error" : "success", endpoint, startedAt, traceId, "mcp_proxy", remoteIsError ? "Remote MCP tool returned isError." : null, 200, 1, remoteIsError ? "remote_mcp_tool_error" : null);
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : "Remote MCP tool call failed.");
    const blocked = error instanceof NetworkPolicyError;
    return executionResult({
      status: blocked ? "permission_denied" : "error",
      tool: tool.name,
      trace_id: traceId,
      error_code: blocked ? error.code : "remote_mcp_call_failed",
      upstream_mcp_endpoint: endpoint.base_url,
      error: message,
      note: blocked
        ? "Astrail denied this remote MCP call because the upstream endpoint is not a public HTTP(S) target."
        : "Astrail could not complete the upstream MCP tools/call request.",
    }, blocked ? "permission_denied" : "error", endpoint, startedAt, traceId, blocked ? "permission_denied" : "mcp_proxy", message, null, 1, blocked ? error.code : "remote_mcp_call_failed");
  }
}

function injectCredential(request: { url: URL; init: RequestInit }, credential: RuntimeCredential | null) {
  if (!credential) return;

  if (credential.scheme === "bearer" || credential.scheme === "oauth2") {
    const headers: Record<string, string> = {
      ...(request.init.headers as Record<string, string> | undefined),
      authorization: `Bearer ${credential.secret}`,
    };
    // Supabase's API gateway requires its project key in both headers. Neon Data API uses bearer JWTs only.
    if (request.url.hostname.endsWith(".supabase.co")) {
      headers.apikey = credential.secret;
    }
    request.init.headers = headers;
    return;
  }

  const name = credential.injectionName?.trim() || "api_key";
  if (credential.scheme === "api_key_header") {
    request.init.headers = {
      ...request.init.headers,
      [name]: credential.secret,
    };
    return;
  }

  request.url.searchParams.set(name, credential.secret);
}

export function inspectUpstreamApplicationError(url: URL, body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (url.hostname === "slack.com" && record.ok === false) {
    return {
      code: typeof record.error === "string" ? `slack_${record.error}` : "slack_api_error",
      message: typeof record.error === "string" ? `Slack API error: ${record.error}` : "Slack API returned ok=false.",
    };
  }
  if (url.hostname === "api.linear.app" && Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0];
    const detail = first && typeof first === "object" ? first as Record<string, unknown> : {};
    const extensions = detail.extensions && typeof detail.extensions === "object" ? detail.extensions as Record<string, unknown> : {};
    const providerCode = typeof extensions.code === "string" ? extensions.code.toLowerCase() : "graphql_error";
    return {
      code: `linear_${providerCode}`,
      message: typeof detail.message === "string" ? `Linear API error: ${detail.message}` : "Linear GraphQL returned an errors array.",
    };
  }
  return null;
}

function executionResult(
  value: unknown,
  status: ToolExecutionStatus,
  endpoint: OpenApiEndpoint | null,
  startedAt: number,
  traceId: string,
  executionModeOverride: ToolExecutionResult["executionMode"] | null = null,
  error: string | null = null,
  upstreamStatus: number | null = null,
  attemptCount = 0,
  errorCode: string | null = null
): ToolExecutionResult {
  const latencyMs = Date.now() - startedAt;
  const executionMode = executionModeOverride ?? (status === "success" || status === "error" ? "safe_rest_execution" : status);
  const responseValue = normalizeExecutionPayload(value, {
    execution_mode: executionMode,
    latency_ms: latencyMs,
    timestamp: new Date().toISOString(),
    trace_id: traceId,
    attempt_count: attemptCount,
    error_code: errorCode,
  });

  return {
    mcpResult: textResult(responseValue, status !== "success"),
    status,
    latencyMs,
    method: endpoint?.method ?? null,
    path: endpoint?.path ?? null,
    executionMode,
    upstreamStatus,
    traceId,
    attemptCount,
    errorCode,
    error,
  };
}

function permissionDeniedResult(
  server: McpServer,
  tool: McpTool,
  endpoint: OpenApiEndpoint,
  decision: Exclude<ReturnType<typeof evaluateRuntimePermission>, { allowed: true }>,
  startedAt: number,
  traceId: string,
  sdkMethod: string | null = null
): ToolExecutionResult {
  return executionResult({
    status: "permission_denied",
    error_code: decision.code,
    trace_id: traceId,
    tool: tool.name,
    endpoint_id: endpointId(endpoint),
    sdk_method: sdkMethod,
    method: endpoint.method,
    path: endpoint.path,
    reason: decision.reason,
    matched: decision.matched
      ? {
          pattern: decision.matched,
          field: decision.matchedField,
        }
      : null,
    policy: runtimePolicySummary(server.runtime_policy),
    note: "Astrail denied this call before upstream execution. Runtime permissions are operational guardrails, not a security boundary; keep provider credentials scoped to the least privilege needed.",
  }, "permission_denied", endpoint, startedAt, traceId, "permission_denied", decision.reason, null, 0, decision.code);
}

function normalizeExecutionPayload(
  value: unknown,
  runtime: {
    execution_mode: ToolExecutionResult["executionMode"];
    latency_ms: number;
    timestamp: string;
    trace_id: string;
    attempt_count: number;
    error_code: string | null;
  }
) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...(value as Record<string, unknown>),
      runtime,
    };
  }

  return {
    status: "success",
    value,
    runtime,
  };
}

export async function executeToolFromEndpointMap(
  server: McpServer,
  tool: McpTool,
  args: Record<string, unknown>,
  options: {
    credential?: RuntimeCredential | null;
    credentialFailure?: UpstreamCredentialFailure | null;
    sdkMethod?: string | null;
    traceId?: string | null;
    actorRole?: string | null;
    idempotencyKey?: string | null;
    x402PaymentSignature?: string | null;
    x402EndUserId?: string | null;
    x402ApprovedRequirement?: X402Requirement | null;
  } = {}
): Promise<ToolExecutionResult> {
  const startedAt = Date.now();
  const traceId = options.traceId ?? createTraceId();
  const endpoint = findEndpointForTool(server, tool);
  args = applyArgumentMappings(server.field_mappings ?? null, tool.name, args);

  if (!endpoint) {
    return executionResult({
      status: "mapping_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: "mapping_missing_endpoint",
      note: "Tool validated, but live execution requires endpoint mapping.",
    }, "mapping_required", null, startedAt, traceId, "mapping_required", null, null, 0, "mapping_missing_endpoint");
  }

  if (endpoint.runtime_kind === "browser" || endpoint.method.toUpperCase() === "BROWSER") {
    return executeBrowserWorkflow(endpoint, tool, args, startedAt, traceId, options.credential ?? null);
  }

  const permission = evaluateRuntimePermission(server.runtime_policy, endpoint, tool, {
    sdkMethod: options.sdkMethod ?? null,
    actorRole: options.actorRole ?? null,
  });
  if (!permission.allowed) {
    return permissionDeniedResult(server, tool, endpoint, permission, startedAt, traceId, options.sdkMethod ?? null);
  }

  if (endpoint.runtime_kind === "mcp_proxy" || endpoint.method.toUpperCase() === "MCP_PROXY") {
    return executeMcpProxyTool(endpoint, tool, args, startedAt, traceId, options.credential ?? null);
  }

  const requiresAuth = hasSecurityRequirement(endpoint);
  const requiresOAuth = hasOAuthSecurityRequirement(endpoint)
    || hasAmbiguousScopedSecurityRequirement(endpoint)
    || options.credentialFailure?.code === "reauth_required";
  if (requiresAuth && !options.credential) {
    if (options.credentialFailure?.code === "credential_backend_unavailable") {
      return executionResult({
        status: "error",
        tool: tool.name,
        trace_id: traceId,
        error_code: "credential_backend_unavailable",
        method: endpoint.method,
        path: endpoint.path,
        note: "Credential storage is temporarily unavailable. Retry without reconnecting or changing provider access.",
      }, "error", endpoint, startedAt, traceId, "safe_rest_execution", options.credentialFailure.message, null, 0, "credential_backend_unavailable");
    }
    if (requiresOAuth) {
      const failure = options.credentialFailure ?? null;
      const errorCode = failure?.code === "reauth_required"
        ? "oauth_reauth_required"
        : failure?.code === "insufficient_scope"
          ? "oauth_insufficient_scope"
          : "oauth_required";
      return executionResult({
        status: "oauth_required",
        tool: tool.name,
        trace_id: traceId,
        error_code: errorCode,
        method: endpoint.method,
        path: endpoint.path,
        ...(failure
          ? {
              credential_failure: {
                code: failure.code,
                provider: failure.provider,
                detail: failure.message,
                ...(failure.requiredScopes ? { required_scopes: failure.requiredScopes } : {}),
                ...(failure.missingScopes ? { missing_scopes: failure.missingScopes } : {}),
              },
            }
          : {}),
        setup: {
          credential_type: "oauth2",
          connect_endpoint: "/api/oauth/connect",
          required_fields: ["server_id", "provider", "client_id"],
          optional_fields: ["client_secret", "scopes", "end_user_id", "security_scheme"],
        },
        note: failure
          ? `${failure.message} Start a hosted reconnect at POST /api/oauth/connect.`
          : "Tool validated, but live execution requires an OAuth credential. Start a hosted connect at POST /api/oauth/connect; Astrail derives trusted provider endpoints from the imported API contract, then exchanges and stores tokens automatically. Per-end-user credentials are selected via the x-astrail-end-user request header.",
      }, "oauth_required", endpoint, startedAt, traceId, "oauth_required", failure?.message ?? null, null, 0, errorCode);
    }

    return executionResult({
      status: "auth_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: "auth_required",
      method: endpoint.method,
      path: endpoint.path,
      note: "Tool validated, but live execution requires auth configuration.",
    }, "auth_required", endpoint, startedAt, traceId, "auth_required", null, null, 0, "auth_required");
  }

  const executionPolicy = normalizeExecutionPolicy(server.execution_policy);
  const request = buildRequest(endpoint, tool, args);
  if ("error" in request) {
    const blocked = request.code.includes("blocked");
    return executionResult({
      status: blocked ? "permission_denied" : "mapping_required",
      tool: tool.name,
      trace_id: traceId,
      error_code: blocked ? "upstream_url_blocked" : request.code,
      method: endpoint.method,
      path: endpoint.path,
      note: request.error,
    }, blocked ? "permission_denied" : "mapping_required", endpoint, startedAt, traceId, blocked ? "permission_denied" : "mapping_required", request.error, null, 0, blocked ? "upstream_url_blocked" : request.code);
  }

  // Payment requirements bind to the API resource, never to an injected
  // credential query parameter. Keep this copy before credential injection.
  const x402Target = new URL(request.url.toString());
  const carriesSecret = Boolean(options.credential?.secret || options.x402PaymentSignature);
  if (carriesSecret && request.url.protocol !== "https:" && !isLocalSecuritySmokeUrl(request.url)) {
    return executionResult({
      status: "permission_denied",
      tool: tool.name,
      trace_id: traceId,
      error_code: "upstream_tls_required",
      method: endpoint.method,
      path: endpoint.path,
      note: "Astrail will not send credentials or payment proofs to a plaintext HTTP upstream.",
    }, "permission_denied", endpoint, startedAt, traceId, "permission_denied", "Authenticated upstream calls require HTTPS.", null, 0, "upstream_tls_required");
  }
  injectCredential(request, options.credential ?? null);
  if (!isLocalSecuritySmokeUrl(request.url)) {
    try {
      await assertSafeUpstreamUrl(request.url);
    } catch (error) {
      const policyError = error instanceof NetworkPolicyError ? error : new NetworkPolicyError("Upstream URL is blocked by runtime network policy.");
      return executionResult({
        status: "permission_denied",
        error_code: policyError.code,
        trace_id: traceId,
        tool: tool.name,
        endpoint_id: endpointId(endpoint),
        method: endpoint.method,
        path: endpoint.path,
        reason: policyError.message,
        note: "Astrail denied this call before upstream execution because the target URL is not a public HTTP(S) endpoint.",
      }, "permission_denied", endpoint, startedAt, traceId, "permission_denied", policyError.message, null, 0, policyError.code);
    }
  }

  const circuitKey = `${server.id}:${request.url.host}`;
  const reliabilityDimension = {
    tenantId: server.user_id,
    provider: options.credential?.auditRef?.provider ?? request.url.hostname,
    credentialId: options.credential?.auditRef?.id ?? null,
  };
  const permit = await acquireReliabilityPermit(reliabilityDimension);
  if (!permit.allowed) {
    await recordReliabilityMetric(reliabilityDimension, permit.reason === "circuit_open" ? "circuit" : permit.reason === "queue_full" ? "queue" : "throttle");
    return executionResult({ status: "rate_limited", tool: tool.name, trace_id: traceId, error_code: `provider_${permit.reason}`, retry_at: permit.retryAt, queued_ms: permit.queuedMs,
      note: "The distributed provider control plane could not admit this request before its deadline." }, "rate_limited", endpoint, startedAt, traceId, null, "Provider reliability permit denied.", null, 0, `provider_${permit.reason}`);
  }
  if (permit.queuedMs > 0) await recordReliabilityMetric(reliabilityDimension, "queue", permit.queuedMs);
  const circuit = checkUpstreamCircuit(circuitKey);
  if (!circuit.allowed) {
    return executionResult({
      status: "error",
      tool: tool.name,
      trace_id: traceId,
      error_code: "upstream_circuit_open",
      method: endpoint.method,
      path: endpoint.path,
      retry_at: new Date(circuit.retryAtMs).toISOString(),
      consecutive_failures: circuit.consecutiveFailures,
      note: "The upstream API failed repeatedly, so Astrail's circuit breaker is failing fast instead of hammering a degraded provider. Retry after retry_at.",
    }, "error", endpoint, startedAt, traceId, null, "Upstream circuit breaker is open.", null, 0, "upstream_circuit_open");
  }

  let x402Payment: PreparedX402Payment | null = null;
  if (options.x402PaymentSignature) {
    const prepared = await prepareX402Payment({
      server,
      tool,
      target: x402Target,
      signature: options.x402PaymentSignature,
      endUserId: options.x402EndUserId ?? null,
      traceId,
      approvedRequirement: options.x402ApprovedRequirement ?? null,
    });
    if (prepared.status === "denied") {
      return executionResult({
        status: "permission_denied",
        tool: tool.name,
        trace_id: traceId,
        error_code: prepared.code,
        method: endpoint.method,
        path: endpoint.path,
        note: prepared.reason,
      }, "permission_denied", endpoint, startedAt, traceId, "x402_policy_denied", prepared.reason, null, 0, prepared.code);
    }
    if (prepared.status === "approval_required") {
      return {
        ...executionResult({
          status: "approval_required",
          tool: tool.name,
          trace_id: traceId,
          error_code: "x402_approval_required",
          payment: prepared.requirement,
          note: `${prepared.reason} Approve this exact payment in Astrail, then resume with the caller-signed PAYMENT-SIGNATURE header.`,
        }, "approval_required", endpoint, startedAt, traceId, "approval_required", prepared.reason, null, 0, "x402_approval_required"),
        x402ApprovalRequirement: prepared.requirement,
      };
    }
    x402Payment = prepared.payment;
    request.init.headers = {
      ...request.init.headers,
      "PAYMENT-SIGNATURE": x402Payment.signature,
    };
  }

  const idempotencyKey = options.idempotencyKey ?? null;
  if (idempotencyKey) {
    // Forward the key so upstreams with native idempotency (Stripe-style
    // Idempotency-Key handling) dedupe on their side too.
    request.init.headers = {
      ...request.init.headers,
      [executionPolicy.idempotencyHeader]: idempotencyKey,
    };
  }

  const executionMode = x402Payment
    ? "x402_payment"
    : requiresAuth
      ? "safe_rest_execution_with_auth"
      : "safe_rest_execution";
  const isGet = endpoint.method.toUpperCase() === "GET";
  // Writes retry only when the server explicitly opts in and the caller supplies
  // an idempotency key. Keep this disabled for providers without native dedupe.
  // A signed payment proof is intentionally single-attempt. Retrying it at the
  // proxy layer could produce an ambiguous or duplicate settlement.
  const attempts = x402Payment ? 1 : (isGet || (executionPolicy.retryWrites && idempotencyKey) ? executionPolicy.maxAttempts : 1);
  const redactionSecrets = Array.from(new Set([
    ...(options.credential?.secret ? [options.credential.secret] : []),
    ...(options.x402PaymentSignature ? [options.x402PaymentSignature] : []),
    ...collectSensitiveArgumentSecrets(args),
  ]));

  const cacheKey = isGet && !x402Payment ? responseCacheKey(server.id, request.url, options.credential?.secret ?? null) : null;
  if (cacheKey) {
    const cached = getCachedUpstreamResponse(cacheKey);
    if (cached) {
      return executionResult({
        status: "success",
        tool: tool.name,
        trace_id: traceId,
        request: {
          method: endpoint.method,
          url: redactUrl(request.url, options.credential ?? null),
          attempt: 0,
          cache: "hit",
        },
        response: {
          status: cached.status,
          headers: { content_type: cached.contentType },
          body: cached.body,
          body_bytes: cached.bodyBytes,
          body_truncated: cached.truncated,
          cached_at: cached.cachedAt,
        },
      }, "success", endpoint, startedAt, traceId, executionMode, null, cached.status, 0, null);
    }
  }

  let lastError: string | null = null;
  let lastErrorCode: string | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let pinnedDispatcher: Awaited<ReturnType<typeof createPinnedPublicDispatcher>> | null = null;
    try {
      if (!isLocalSecuritySmokeUrl(request.url)) {
        pinnedDispatcher = await createPinnedPublicDispatcher(request.url);
      }
      const response = await fetch(request.url, {
        ...request.init,
        // Redirects are surfaced as errors instead of being followed with a
        // fresh DNS lookup. This keeps every executed request bound to the
        // public addresses validated by createPinnedPublicDispatcher.
        redirect: "manual" as const,
        signal: AbortSignal.timeout(executionPolicy.timeoutMs),
        headers: {
          ...request.init.headers,
          "x-astrail-trace-id": traceId,
        },
        ...(pinnedDispatcher ? { dispatcher: pinnedDispatcher } : {}),
      } as RequestInit & { dispatcher?: typeof pinnedDispatcher });
      if (!response.ok && executionPolicy.retryStatuses.has(response.status)) {
        // 429 means the upstream is alive but throttling; only 5xx outages
        // count toward opening the circuit.
        if (response.status >= 500) reportUpstreamFailure(circuitKey);
        else reportUpstreamSuccess(circuitKey);
        await recordProviderOutcome(reliabilityDimension, response.status < 500);
        if (attempt < attempts) {
          if (!await consumeProviderRetryBudget(reliabilityDimension)) break;
          await recordReliabilityMetric(reliabilityDimension, response.status === 429 ? "throttle" : "retry");
          lastError = `HTTP ${response.status}`;
          lastErrorCode = response.status === 429 ? "upstream_rate_limited" : "upstream_http_error";
          await response.body?.cancel().catch(() => undefined);
          await pinnedDispatcher?.close().catch(() => undefined);
          pinnedDispatcher = null;
          await waitBeforeRetry(executionRetryDelayMs(executionPolicy, attempt, response.headers.get("retry-after")));
          continue;
        }
      } else {
        reportUpstreamSuccess(circuitKey);
        await recordProviderOutcome(reliabilityDimension, true);
      }
      const responseBody = await readResponseBody(response);
      await pinnedDispatcher?.close().catch(() => undefined);
      pinnedDispatcher = null;
      let parsedBody: unknown = responseBody.text;
      try {
        parsedBody = responseBody.text ? JSON.parse(responseBody.text) : null;
      } catch {
        parsedBody = responseBody.text;
      }

      const paymentRequired = inspectX402PaymentRequired(response, parsedBody, x402Target, server.runtime_policy?.x402);
      if (paymentRequired) {
        if (x402Payment) await finalizeX402Receipt(x402Payment, response, "failed");
        if (paymentRequired.status === "denied") {
          return executionResult({
            status: "permission_denied",
            tool: tool.name,
            trace_id: traceId,
            error_code: paymentRequired.code,
            note: paymentRequired.reason,
          }, "permission_denied", endpoint, startedAt, traceId, "x402_policy_denied", paymentRequired.reason, response.status, attempt, paymentRequired.code);
        }
        const challenge = await recordX402Challenge({
          server,
          tool,
          endUserId: options.x402EndUserId ?? null,
          requirement: paymentRequired.requirement,
        });
        if (!challenge.ok) {
          return executionResult({
            status: "permission_denied",
            tool: tool.name,
            trace_id: traceId,
            error_code: challenge.code,
            note: challenge.reason,
          }, "permission_denied", endpoint, startedAt, traceId, "x402_policy_denied", challenge.reason, response.status, attempt, challenge.code);
        }
        const paymentPayload = {
          status: paymentRequired.status,
          tool: tool.name,
          trace_id: traceId,
          error_code: paymentRequired.status === "approval_required" ? "x402_approval_required" : "x402_payment_required",
          payment: paymentRequired.requirement,
          payment_options: paymentRequired.requirements,
          payment_header: "PAYMENT-SIGNATURE",
          note: paymentRequired.status === "approval_required"
            ? "Astrail paused before payment. Approve this exact amount in the dashboard, sign it with the end user's wallet, then resume with PAYMENT-SIGNATURE."
            : "Sign one offered payment option in the end user's wallet and retry this same tool call with PAYMENT-SIGNATURE. Astrail never stores the wallet key or pays from a platform wallet.",
        };
        const execution = executionResult(
          paymentPayload,
          paymentRequired.status === "approval_required" ? "approval_required" : "payment_required",
          endpoint,
          startedAt,
          traceId,
          paymentRequired.status === "approval_required" ? "approval_required" : "payment_required",
          paymentRequired.status === "approval_required" ? "x402 payment approval required" : "x402 payment required",
          response.status,
          attempt,
          paymentPayload.error_code,
        );
        return paymentRequired.status === "approval_required"
          ? { ...execution, x402ApprovalRequirement: paymentRequired.requirement }
          : execution;
      }

      const paymentReceipt = x402Payment ? await finalizeX402Receipt(x402Payment, response) : null;
      const applicationError = response.ok ? inspectUpstreamApplicationError(request.url, parsedBody) : null;
      parsedBody = applyResponseMappings(server.field_mappings ?? null, tool.name, parsedBody);
      parsedBody = redactSensitive(parsedBody, redactionSecrets);

      if (cacheKey && response.ok && !applicationError) {
        storeCachedUpstreamResponse(cacheKey, {
          status: response.status,
          contentType: response.headers.get("content-type"),
          body: parsedBody,
          bodyBytes: responseBody.bytes,
          truncated: responseBody.truncated,
          cachedAt: new Date().toISOString(),
        });
      }

      return executionResult({
        status: response.ok && !applicationError ? "success" : "error",
        tool: tool.name,
        trace_id: traceId,
        request: {
          method: endpoint.method,
          url: redactUrl(request.url, options.credential ?? null),
          attempt,
        },
        response: {
          status: response.status,
          headers: {
            content_type: response.headers.get("content-type"),
          },
          body: parsedBody,
          body_bytes: responseBody.bytes,
          body_truncated: responseBody.truncated,
        },
        ...(paymentReceipt ? {
          payment_receipt: {
            id: paymentReceipt.id,
            status: paymentReceipt.status,
            transaction: "transaction" in paymentReceipt ? paymentReceipt.transaction : null,
            network: x402Payment?.requirement.network ?? null,
            asset: x402Payment?.requirement.asset ?? null,
            amount: x402Payment?.requirement.amount ?? null,
          },
        } : {}),
      }, response.ok && !applicationError ? "success" : "error", endpoint, startedAt, traceId, executionMode,
      applicationError?.message ?? (response.ok ? null : `HTTP ${response.status}`), response.status, attempt,
      applicationError?.code ?? (response.ok ? null : "upstream_http_error"));
    } catch (error) {
      await pinnedDispatcher?.close().catch(() => undefined);
      reportUpstreamFailure(circuitKey);
      await recordProviderOutcome(reliabilityDimension, false);
      await recordReliabilityMetric(reliabilityDimension, "provider_error");
      if (x402Payment) await finalizeX402Receipt(x402Payment, null, "in_doubt");
      const message = redactText(error instanceof Error ? error.message : "Unknown upstream request error", redactionSecrets);
      lastError = message;
      lastErrorCode = message.toLowerCase().includes("timeout") ? "upstream_timeout" : "upstream_fetch_error";
      if (attempt < attempts) {
        if (!await consumeProviderRetryBudget(reliabilityDimension)) break;
        await recordReliabilityMetric(reliabilityDimension, "retry");
        await waitBeforeRetry(executionRetryDelayMs(executionPolicy, attempt, null));
      }
      if (attempt === attempts) {
        return executionResult({
          status: "error",
          tool: tool.name,
          trace_id: traceId,
          error_code: lastErrorCode,
          request: {
            method: endpoint.method,
            path: endpoint.path,
            attempt,
          },
          error: message,
        }, "error", endpoint, startedAt, traceId, executionMode, message, null, attempt, lastErrorCode);
      }
    }
  }

  return executionResult({
    status: "error",
    tool: tool.name,
    trace_id: traceId,
    error_code: lastErrorCode ?? "upstream_fetch_error",
    error: lastError ?? "Unknown upstream request error",
  }, "error", endpoint, startedAt, traceId, executionMode, lastError, null, attempts, lastErrorCode ?? "upstream_fetch_error");
}
