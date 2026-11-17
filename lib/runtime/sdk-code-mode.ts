import type { McpServer, McpTool, OpenApiEndpoint } from "@/lib/types";
import { searchDocs } from "../codeModeDocs";
import {
  executeToolFromEndpointMap,
  type RuntimeCredential,
  type ToolExecutionResult,
  type UpstreamCredentialFailure,
} from "@/lib/runtime/execute-tool";
import {
  endpointRequiresAuth,
  evaluateRuntimePermission,
  redactSensitive,
  runtimePolicySummary,
  visibleEndpointsForRequest,
} from "@/lib/runtime/permissions";
import { validateToolInput, type ToolInputValidationIssue } from "@/lib/runtime/tool-input-validation";
import type { X402Requirement } from "@/lib/runtime/x402";

export type CodeModeCredentialLoader = (server: McpServer, tool: McpTool) => Promise<{
  credential: RuntimeCredential | null;
  failure: UpstreamCredentialFailure | null;
}>;

type AnalyzedClientCall = {
  resource: string;
  method: string;
  args: Record<string, unknown>;
  source: string;
  controlFlow: "direct_call" | "for_await_iteration";
};

type CodeModeDiagnostic = {
  code: string;
  message: string;
  severity: "error";
  sdk_call?: string;
  suggestions?: string[];
  issues?: ToolInputValidationIssue[];
};

type CodeModePlan =
  | {
      ok: true;
      calls: AnalyzedClientCall[];
      diagnostics: [];
      executionModel: "static-analysis-no-eval";
      adapter: string;
    }
  | {
      ok: false;
      calls: AnalyzedClientCall[];
      diagnostics: CodeModeDiagnostic[];
      executionModel: "static-analysis-no-eval";
      adapter: string;
    };

export type CodeModeSandboxAdapter = {
  name: string;
  isolation: "static_no_eval" | "isolated_process";
  plan(server: McpServer, args: Record<string, unknown>): CodeModePlan;
  execute(
    server: McpServer,
    args: Record<string, unknown>,
    options: {
      loadCredentialForTool: CodeModeCredentialLoader;
      x402PaymentSignature?: string | null;
      x402EndUserId?: string | null;
      x402ApprovedRequirement?: X402Requirement | null;
    }
  ): Promise<ToolExecutionResult>;
};

const MAX_CODE_BYTES = 8_000;
const MAX_SDK_CALLS = 8;
const BLOCKED_RUNTIME_ACCESS: Array<{ pattern: RegExp; code: string; message: string }> = [
  {
    pattern: /\b(import|require)\b/,
    code: "sandbox_module_access_blocked",
    message: "Imports and require() are not supported in Code Mode.",
  },
  {
    pattern: /\b(process|globalThis|global|window|document|self)\b/,
    code: "sandbox_global_access_blocked",
    message: "Runtime global access is blocked. Code Mode accepts SDK-shaped client calls only.",
  },
  {
    pattern: /\b(Function|eval|AsyncFunction|GeneratorFunction)\b/,
    code: "sandbox_dynamic_code_blocked",
    message: "Dynamic code execution is blocked.",
  },
  {
    pattern: /\b(fetch|XMLHttpRequest|WebSocket|Worker|MessageChannel)\b/,
    code: "sandbox_network_access_blocked",
    message: "Direct network/runtime APIs are blocked. Use generated SDK methods instead.",
  },
  {
    pattern: /\b(fs|node:fs|child_process|node:child_process|net|node:net|tls|node:tls|http|node:http|https|node:https)\b/,
    code: "sandbox_node_runtime_blocked",
    message: "Node runtime modules are blocked in Code Mode.",
  },
  {
    pattern: /\b(constructor|prototype|__proto__)\b/,
    code: "sandbox_prototype_access_blocked",
    message: "Prototype and constructor access is blocked.",
  },
];

function createRuntimeTraceId() {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function camelCase(value: string) {
  const cleaned = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (cleaned.length === 0) return "api";
  return cleaned
    .map((part, index) => {
      const lower = part.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function endpointId(endpoint: OpenApiEndpoint) {
  return endpoint.tool_name || endpoint.operation_id || `${endpoint.method} ${endpoint.path}`;
}

function catalogEndpoints(server: McpServer) {
  return visibleEndpointsForRequest(server);
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

function sdkResource(endpoint: OpenApiEndpoint) {
  return camelCase(endpoint.resource || endpoint.tags?.[0] || endpoint.path.split("/").find((part) => part && !part.startsWith("{")) || "api");
}

function sdkMethod(endpoint: OpenApiEndpoint) {
  if (endpoint.operation_id) return camelCase(endpoint.operation_id);
  const verb = endpoint.operation_kind === "read"
    ? endpoint.path.includes("{") ? "get" : "list"
    : endpoint.operation_kind === "destructive"
      ? "delete"
      : endpoint.method.toUpperCase() === "POST"
        ? "create"
        : "update";
  const leaf = endpoint.path
    .split("/")
    .filter((part) => part && !part.startsWith("{"))
    .pop() || "resource";
  return camelCase(`${verb} ${leaf}`);
}

function exampleArgumentsFromSchema(schema: unknown) {
  if (!schema || typeof schema !== "object") return {};
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object"
    ? record.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(record.required) ? record.required : [];
  const args: Record<string, unknown> = {};

  for (const [name, property] of Object.entries(properties).slice(0, 8)) {
    const prop = property && typeof property === "object" ? property as Record<string, unknown> : {};
    if (!required.includes(name) && Object.keys(args).length >= 3) continue;
    if (prop.example !== undefined) args[name] = prop.example;
    else if (Array.isArray(prop.enum) && prop.enum.length > 0) args[name] = prop.enum[0];
    else if (prop.type === "integer" || prop.type === "number") args[name] = 1;
    else if (prop.type === "boolean") args[name] = true;
    else if (prop.type === "array") args[name] = [];
    else if (prop.type === "object") args[name] = {};
    else args[name] = name.includes("id") ? "example_id" : "example";
  }

  return args;
}

function schemaProperties(schema: unknown) {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object"
    ? record.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(record.required) ? record.required : [];
  return Object.entries(properties).slice(0, 16).map(([name, property]) => {
    const prop = property && typeof property === "object" ? property as Record<string, unknown> : {};
    return {
      name,
      type: typeof prop.type === "string" ? prop.type : prop.$ref ? "ref" : "unknown",
      required: required.includes(name),
      description: typeof prop.description === "string" ? prop.description.slice(0, 160) : undefined,
    };
  });
}

function sdkDocForEndpoint(endpoint: OpenApiEndpoint, detail: "compact" | "schema" = "compact") {
  const resource = sdkResource(endpoint);
  const method = sdkMethod(endpoint);
  const exampleArgs = exampleArgumentsFromSchema(endpoint.input_schema);
  const call = `client.${resource}.${method}(${JSON.stringify(exampleArgs, null, 2)})`;
  const isListLikeRead = endpoint.operation_kind === "read" && (method.toLowerCase().startsWith("list") || !endpoint.path.includes("{"));
  const compactDoc = {
    sdk_method: `client.${resource}.${method}`,
    endpoint_id: endpointId(endpoint),
    method: endpoint.method,
    path: endpoint.path,
    resource,
    operation: endpoint.operation_kind,
    summary: endpoint.summary,
    description: endpoint.description,
    requires_auth: endpointRequiresAuth(endpoint),
    tags: endpoint.tags ?? [],
    arguments: schemaProperties(endpoint.input_schema),
    response_hints: redactSensitive(endpoint.response_hints ?? null),
    example: `const result = await ${call};`,
    iterable_example: isListLikeRead
      ? `const results = [];\nfor await (const item of ${call}) {\n  results.push(item);\n}\nreturn results;`
      : null,
    execution_notes: [
      "Call search_docs first, then execute SDK-shaped TypeScript.",
      "Astrail does not eval JavaScript. It statically compiles supported client.resource.method(...) calls to endpoint-map execution.",
      isListLikeRead ? "for await loops are accepted as an agent-friendly list pattern; the SDK call inside the loop is compiled deterministically." : null,
    ].filter(Boolean),
  };

  return detail === "schema"
    ? redactSensitive({ ...compactDoc, input_schema: endpoint.input_schema ?? { type: "object", properties: {} } })
    : redactSensitive(compactDoc);
}

export function searchSdkDocs(server: McpServer, args: Record<string, unknown>) {
  return {
    ...searchDocs(server, args),
    adapter: staticNoEvalSdkAdapter.name,
  };
}

function findMatchingParen(value: string, openIndex: number) {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function parseCodeArgumentObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Fall through to JSON-ish object-literal parsing.
  }

  const jsonish = trimmed
    .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)\s*:/g, "$1\"$2\":")
    .replace(/'/g, "\"")
    .replace(/,\s*([}\]])/g, "$1");

  try {
    const parsed = JSON.parse(jsonish) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Return a typecheck-style error below.
  }

  throw new Error("Arguments must be a JSON-compatible object literal. Example: client.customers.list({ \"limit\": 10 })");
}

function blockedRuntimeDiagnostic(code: string): CodeModeDiagnostic | null {
  const masked = code
    .replace(/(["'`])(?:\\.|(?!\1)[\s\S])*\1/g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const blocked = BLOCKED_RUNTIME_ACCESS.find((item) => item.pattern.test(masked));
  if (!blocked) return null;
  return {
    code: blocked.code,
    message: blocked.message,
    severity: "error",
  };
}

function isForAwaitClientCall(code: string, callIndex: number) {
  const prefix = code.slice(Math.max(0, callIndex - 120), callIndex);
  return /for\s+await\s*\([^)]*\bof\s*$/.test(prefix);
}

function analyzeCodeModeSnippet(code: unknown): CodeModePlan {
  const adapter = staticNoEvalSdkAdapter.name;
  if (typeof code !== "string" || !code.trim()) {
    return {
      ok: false,
      calls: [],
      diagnostics: [{ code: "code_missing", message: "execute requires a non-empty TypeScript code string.", severity: "error" }],
      executionModel: "static-analysis-no-eval",
      adapter,
    };
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return {
      ok: false,
      calls: [],
      diagnostics: [{ code: "code_too_large", message: "Code snippet is too large for no-eval Code Mode. Keep it under 8KB.", severity: "error" }],
      executionModel: "static-analysis-no-eval",
      adapter,
    };
  }

  const blocked = blockedRuntimeDiagnostic(code);
  if (blocked) {
    return {
      ok: false,
      calls: [],
      diagnostics: [blocked],
      executionModel: "static-analysis-no-eval",
      adapter,
    };
  }

  const calls: AnalyzedClientCall[] = [];
  const callPattern = /client\.([a-zA-Z_$][\w$]*)\.([a-zA-Z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(code)) !== null) {
    const openIndex = callPattern.lastIndex - 1;
    const closeIndex = findMatchingParen(code, openIndex);
    if (closeIndex === -1) {
      return {
        ok: false,
        calls,
        diagnostics: [{
          code: "typecheck_parse_error",
          message: `Could not parse SDK call client.${match[1]}.${match[2]}(...).`,
          severity: "error",
        }],
        executionModel: "static-analysis-no-eval",
        adapter,
      };
    }
    const rawArgs = code.slice(openIndex + 1, closeIndex);
    try {
      calls.push({
        resource: match[1],
        method: match[2],
        args: parseCodeArgumentObject(rawArgs),
        source: code.slice(match.index, closeIndex + 1),
        controlFlow: isForAwaitClientCall(code, match.index) ? "for_await_iteration" : "direct_call",
      });
    } catch (error) {
      return {
        ok: false,
        calls,
        diagnostics: [{
          code: "typecheck_argument_error",
          message: error instanceof Error ? error.message : "Could not parse SDK call arguments.",
          severity: "error",
        }],
        executionModel: "static-analysis-no-eval",
        adapter,
      };
    }
    callPattern.lastIndex = closeIndex + 1;
  }

  if (calls.length === 0) {
    return {
      ok: false,
      calls,
      diagnostics: [{
        code: "no_sdk_calls",
        message: "No supported SDK calls found. Use search_docs, then call execute with code like `await client.customers.list({})`.",
        severity: "error",
      }],
      executionModel: "static-analysis-no-eval",
      adapter,
    };
  }

  if (calls.length > MAX_SDK_CALLS) {
    return {
      ok: false,
      calls,
      diagnostics: [{
        code: "too_many_sdk_calls",
        message: `Code Mode supports up to ${MAX_SDK_CALLS} SDK calls per execution.`,
        severity: "error",
      }],
      executionModel: "static-analysis-no-eval",
      adapter,
    };
  }

  return {
    ok: true,
    calls,
    diagnostics: [],
    executionModel: "static-analysis-no-eval",
    adapter,
  };
}

function findEndpointForSdkCall(server: McpServer, call: AnalyzedClientCall) {
  const resource = call.resource.toLowerCase();
  const method = call.method.toLowerCase();
  return catalogEndpoints(server).find((endpoint) =>
    sdkResource(endpoint).toLowerCase() === resource && sdkMethod(endpoint).toLowerCase() === method
  ) ?? null;
}

function suggestionScore(candidate: string, call: AnalyzedClientCall) {
  const normalized = candidate.toLowerCase();
  const resource = call.resource.toLowerCase();
  const method = call.method.toLowerCase();
  let score = 0;
  if (normalized.includes(`.${resource}.`)) score += 10;
  if (normalized.endsWith(`.${method}`)) score += 8;
  if (normalized.includes(resource)) score += 4;
  if (normalized.includes(method)) score += 3;
  return score;
}

function sdkMethodSuggestions(server: McpServer, call: AnalyzedClientCall) {
  return catalogEndpoints(server)
    .map((endpoint) => `client.${sdkResource(endpoint)}.${sdkMethod(endpoint)}`)
    .sort((left, right) => suggestionScore(right, call) - suggestionScore(left, call) || left.localeCompare(right))
    .slice(0, 8);
}

function validateSdkCallArguments(endpoint: OpenApiEndpoint, args: Record<string, unknown>) {
  const validation = validateToolInput(endpoint.input_schema ?? { type: "object", properties: {} }, args);
  if (validation.ok) return null;
  const missing = validation.issues
    .filter((item) => item.code === "missing_required")
    .map((item) => item.path);

  return {
    error_code: missing.length > 0 ? "typecheck_missing_required_arguments" : "typecheck_invalid_arguments",
    error: validation.summary,
    issues: validation.issues,
    ...(missing.length > 0 ? { missing } : {}),
  };
}

function endpointToolForCodeCall(endpoint: OpenApiEndpoint): McpTool {
  return {
    name: endpointId(endpoint),
    description: endpoint.description || endpoint.summary || `${endpoint.method} ${endpoint.path}`,
    input_schema: endpoint.input_schema ?? { type: "object", properties: {} },
    method: endpoint.method,
    path: endpoint.path,
  };
}

function parsedExecutionOutput(execution: ToolExecutionResult) {
  const text = execution.mcpResult.content[0]?.text ?? "";
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function compactBody(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      type: "array",
      count: value.length,
      sample: value.slice(0, 3),
    };
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      type: "object",
      key_count: entries.length,
      sample: Object.fromEntries(entries.slice(0, 12)),
    };
  }

  if (typeof value === "string" && value.length > 1200) {
    return {
      type: "string",
      chars: value.length,
      preview: value.slice(0, 1200),
      truncated: true,
    };
  }

  return value;
}

function codeModeOutput(execution: ToolExecutionResult, resultMode: "compact" | "full") {
  const parsed = parsedExecutionOutput(execution);
  if (resultMode === "full" || !parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const record = parsed as Record<string, unknown>;
  const response = record.response && typeof record.response === "object" && !Array.isArray(record.response)
    ? record.response as Record<string, unknown>
    : null;

  if (!response) return parsed;

  return {
    ...record,
    response: {
      status: response.status,
      headers: response.headers,
      body_preview: compactBody(response.body),
    },
  };
}

function typecheckFailureResult(input: {
  traceId: string;
  startedAt: number;
  diagnostics: CodeModeDiagnostic[];
  callsFound: number;
  resultMode?: "compact" | "full";
}): ToolExecutionResult {
  const primary = input.diagnostics[0];
  return {
    mcpResult: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        status: "mapping_required",
        mode: "astrail_code_mode",
        adapter: staticNoEvalSdkAdapter.name,
        trace_id: input.traceId,
        result_mode: input.resultMode ?? "compact",
        analysis: {
          sdk_calls_found: input.callsFound,
          execution_model: "static-analysis-no-eval",
          sandbox: "No user JavaScript was evaluated.",
        },
        diagnostics: input.diagnostics,
        results: input.diagnostics.map((diagnostic) => ({
          status: "mapping_required",
          error_code: diagnostic.code,
          error: diagnostic.message,
          sdk_call: diagnostic.sdk_call,
          suggestions: diagnostic.suggestions,
          issues: diagnostic.issues,
        })),
      }, null, 2) }],
    },
    status: "mapping_required",
    latencyMs: Date.now() - input.startedAt,
    method: "ASTRAIL_CODE",
    path: "execute",
    executionMode: "code_mode",
    upstreamStatus: null,
    traceId: input.traceId,
    attemptCount: 0,
    errorCode: primary?.code ?? "typecheck_failed",
    error: primary?.message ?? "Typecheck failed.",
  };
}

function permissionDeniedResult(input: {
  server: McpServer;
  call: AnalyzedClientCall;
  endpoint: OpenApiEndpoint;
  decision: Exclude<ReturnType<typeof evaluateRuntimePermission>, { allowed: true }>;
  traceId: string;
  startedAt: number;
  callsFound: number;
  resultMode: "compact" | "full";
}): ToolExecutionResult {
  const sdkMethodName = `client.${input.call.resource}.${input.call.method}`;
  return {
    mcpResult: {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        status: "permission_denied",
        mode: "astrail_code_mode",
        adapter: staticNoEvalSdkAdapter.name,
        trace_id: input.traceId,
        result_mode: input.resultMode,
        analysis: {
          sdk_calls_found: input.callsFound,
          execution_model: "static-analysis-no-eval",
          sandbox: "No user JavaScript was evaluated.",
          execution_strategy: "blocked_before_upstream_execution",
        },
        results: [{
          status: "permission_denied",
          error_code: input.decision.code,
          error: input.decision.reason,
          sdk_call: input.call.source,
          sdk_method: sdkMethodName,
          endpoint: endpointCatalogItem(input.endpoint),
          matched: input.decision.matched
            ? {
                pattern: input.decision.matched,
                field: input.decision.matchedField,
              }
            : null,
          policy: runtimePolicySummary(input.server.runtime_policy),
          note: "Astrail denied this compiled SDK call before upstream execution. Runtime permissions are operational guardrails, not a security boundary; keep provider credentials scoped to the least privilege needed.",
        }],
      }, null, 2) }],
    },
    status: "permission_denied",
    latencyMs: Date.now() - input.startedAt,
    method: "ASTRAIL_CODE",
    path: "execute",
    executionMode: "code_mode",
    upstreamStatus: null,
    traceId: input.traceId,
    attemptCount: 0,
    errorCode: input.decision.code,
    error: input.decision.reason,
  };
}

export const staticNoEvalSdkAdapter: CodeModeSandboxAdapter = {
  name: "static-no-eval-sdk-compiler",
  isolation: "static_no_eval",
  plan(_server, args) {
    return analyzeCodeModeSnippet(args.code);
  },
  async execute(server, args, options) {
    const traceId = createRuntimeTraceId();
    const startedAt = Date.now();
    const resultMode = args.result_mode === "full" ? "full" : "compact";
    const plan = this.plan(server, args);
    if (!plan.ok) {
      return typecheckFailureResult({
        traceId,
        startedAt,
        diagnostics: plan.diagnostics,
        callsFound: plan.calls.length,
        resultMode,
      });
    }
    if (server.runtime_policy?.x402?.enabled === true && plan.calls.length !== 1) {
      return typecheckFailureResult({
        traceId,
        startedAt,
        callsFound: plan.calls.length,
        resultMode,
        diagnostics: [{
          code: "x402_single_call_required",
          message: "Code Mode servers with x402 enabled require exactly one SDK call so its challenge, approval, proof, and receipt stay bound to one resource.",
          severity: "error",
        }],
      });
    }

    const prepared: Array<{
      call: AnalyzedClientCall;
      endpoint: OpenApiEndpoint;
      endpointTool: McpTool;
      credential: RuntimeCredential | null;
      credentialFailure: UpstreamCredentialFailure | null;
    }> = [];
    let finalStatus: ToolExecutionResult["status"] = "success";
    let finalError: string | null = null;
    let finalErrorCode: string | null = null;
    let x402ApprovalRequirement: X402Requirement | undefined;
    let attempts = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const call of plan.calls) {
      const endpoint = findEndpointForSdkCall(server, call);
      if (!endpoint) {
        const error = `Unknown SDK method client.${call.resource}.${call.method}.`;
        return typecheckFailureResult({
          traceId,
          startedAt,
          resultMode,
          callsFound: plan.calls.length,
          diagnostics: [{
            code: "sdk_method_not_found",
            message: error,
            severity: "error",
            sdk_call: call.source,
            suggestions: sdkMethodSuggestions(server, call),
          }],
        });
      }

      const argumentError = validateSdkCallArguments(endpoint, call.args);
      if (argumentError) {
        return typecheckFailureResult({
          traceId,
          startedAt,
          resultMode,
          callsFound: plan.calls.length,
          diagnostics: [{
            code: argumentError.error_code,
            message: argumentError.error,
            severity: "error",
            sdk_call: call.source,
            issues: argumentError.issues,
            suggestions: [`client.${sdkResource(endpoint)}.${sdkMethod(endpoint)}`],
          }],
        });
      }

      const endpointTool = endpointToolForCodeCall(endpoint);
      const sdkMethodName = `client.${call.resource}.${call.method}`;
      const permission = evaluateRuntimePermission(server.runtime_policy, endpoint, endpointTool, {
        sdkMethod: sdkMethodName,
      });
      if (!permission.allowed) {
        return permissionDeniedResult({
          server,
          call,
          endpoint,
          decision: permission,
          traceId,
          startedAt,
          callsFound: plan.calls.length,
          resultMode,
        });
      }

      const credentialResult = await options.loadCredentialForTool(server, endpointTool);
      prepared.push({ call, endpoint, endpointTool, credential: credentialResult.credential, credentialFailure: credentialResult.failure });
    }

    const allSafeReads = prepared.every(({ endpoint }) => endpoint.operation_kind === "read");
    const executions = allSafeReads
      ? await Promise.all(prepared.map(({ endpointTool, call, credential, credentialFailure }) =>
          executeToolFromEndpointMap(server, endpointTool, call.args, {
            credential,
            credentialFailure,
            sdkMethod: `client.${call.resource}.${call.method}`,
            x402PaymentSignature: options.x402PaymentSignature,
            x402EndUserId: options.x402EndUserId,
            x402ApprovedRequirement: options.x402ApprovedRequirement,
          })
        ))
      : [];

    for (let index = 0; index < prepared.length; index += 1) {
      const { call, endpoint, endpointTool, credential, credentialFailure } = prepared[index];
      const execution = allSafeReads
        ? executions[index]
        : await executeToolFromEndpointMap(server, endpointTool, call.args, {
            credential,
            credentialFailure,
            sdkMethod: `client.${call.resource}.${call.method}`,
            x402PaymentSignature: options.x402PaymentSignature,
            x402EndUserId: options.x402EndUserId,
            x402ApprovedRequirement: options.x402ApprovedRequirement,
          });
      attempts += execution.attemptCount;
      if (execution.status !== "success") {
        finalStatus = execution.status;
        finalError = execution.error;
        finalErrorCode = execution.errorCode;
      }
      if (execution.x402ApprovalRequirement) x402ApprovalRequirement = execution.x402ApprovalRequirement;

      results.push({
        status: execution.status,
        sdk_method: `client.${call.resource}.${call.method}`,
        control_flow: call.controlFlow,
        endpoint: endpointCatalogItem(endpoint),
        arguments: redactSensitive(call.args),
        output: codeModeOutput(execution, resultMode),
      });

      if (execution.status !== "success") break;
    }

    return {
      mcpResult: {
        ...(finalStatus === "success" ? {} : { isError: true }),
        content: [{ type: "text", text: JSON.stringify({
          status: finalStatus === "success" ? "success" : finalStatus,
          mode: "astrail_code_mode",
          adapter: this.name,
          trace_id: traceId,
          result_mode: resultMode,
          analysis: {
            sdk_calls_found: plan.calls.length,
            execution_model: plan.executionModel,
            sandbox: "No user JavaScript was evaluated.",
            execution_strategy: allSafeReads ? "parallel_safe_reads" : "ordered_calls",
            control_flow: Array.from(new Set(plan.calls.map((call) => call.controlFlow))),
          },
          results,
        }, null, 2) }],
      },
      status: finalStatus,
      latencyMs: Date.now() - startedAt,
      method: "ASTRAIL_CODE",
      path: "execute",
      executionMode: "code_mode",
      upstreamStatus: null,
      traceId,
      attemptCount: attempts,
      errorCode: finalErrorCode,
      error: finalError,
      ...(x402ApprovalRequirement ? { x402ApprovalRequirement } : {}),
    } satisfies ToolExecutionResult;
  },
};

export async function executeSdkCodeMode(
  server: McpServer,
  args: Record<string, unknown>,
  options: {
    loadCredentialForTool: CodeModeCredentialLoader;
    adapter?: CodeModeSandboxAdapter;
    x402PaymentSignature?: string | null;
    x402EndUserId?: string | null;
    x402ApprovedRequirement?: X402Requirement | null;
  }
) {
  const adapter = options.adapter ?? staticNoEvalSdkAdapter;
  return adapter.execute(server, args, {
    loadCredentialForTool: options.loadCredentialForTool,
    x402PaymentSignature: options.x402PaymentSignature,
    x402EndUserId: options.x402EndUserId,
    x402ApprovedRequirement: options.x402ApprovedRequirement,
  });
}
