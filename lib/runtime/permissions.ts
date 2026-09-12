import { toolActionLevel } from "../agent-tool-profile";
import type { McpActionLevel, McpServer, McpTool, OpenApiEndpoint, RuntimePermissionPattern, RuntimePermissionPolicy, RuntimeRolePolicy } from "../types";

export type RuntimePermissionContext = {
  sdkMethod?: string | null;
  actorRole?: string | null;
  actionLevel?: McpActionLevel | null;
};

const ACTION_LEVEL_RANK: Record<McpActionLevel, number> = {
  read: 0,
  draft: 1,
  write: 2,
  send: 3,
  destructive: 4,
};

export function normalizeActorRole(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

export type RuntimePermissionDecision =
  | { allowed: true }
  | {
      allowed: false;
      code: "runtime_permission_denied";
      reason: string;
      matched: string | null;
      matchedField: string | null;
    };

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PUBLIC_META_TOOLS = new Set([
  "search_docs",
  "list_api_endpoints",
  "get_api_endpoint_schema",
  "invoke_api_endpoint",
  "execute",
]);
const SENSITIVE_KEYS = /(^|_|\b)(api_?key|access_?token|authorization|bearer|client_?secret|credential|password|refresh_?token|secret|signature|token)($|_|\b)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const ASSIGNMENT_PATTERN = /\b(api_?key|access_?token|authorization|bearer|client_?secret|password|refresh_?token|secret|token)=([^&\s"'`]+)/gi;

function endpointId(endpoint: OpenApiEndpoint) {
  return endpoint.tool_name || endpoint.operation_id || `${endpoint.method} ${endpoint.path}`;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function visibility(value: unknown) {
  return value === "public" || value === "private" ? value : null;
}

function toolVisibility(tool: McpTool) {
  return visibility(tool.visibility)
    ?? visibility(tool.x_astrail?.visibility)
    ?? visibility(record(tool.metadata).visibility);
}

function endpointMatchesTool(endpoint: OpenApiEndpoint, tool: McpTool) {
  const ids = new Set([
    endpointId(endpoint),
    endpoint.tool_name,
    endpoint.operation_id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0));

  if (ids.has(tool.name)) return true;
  return Boolean(tool.method && tool.path
    && tool.method.toUpperCase() === endpoint.method.toUpperCase()
    && tool.path === endpoint.path);
}

export function endpointRequiresAuth(endpoint: OpenApiEndpoint) {
  if (endpoint.requires_auth === true) return true;
  const security = endpoint.security_requirements ?? endpoint.security;
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

export function endpointOperationKind(endpoint: OpenApiEndpoint) {
  if (endpoint.operation_kind) return endpoint.operation_kind;
  const method = endpoint.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS" || method === "BROWSER") return "read";
  if (method === "DELETE") return "destructive";
  return "write";
}

export function endpointActionClass(endpoint: OpenApiEndpoint, tool?: McpTool): McpActionLevel {
  if (endpoint.action_class) return endpoint.action_class;
  if (tool?.x_astrail?.action_class) return tool.x_astrail.action_class;
  const operation = endpointOperationKind(endpoint);
  if (operation === "read" || operation === "destructive") return operation;

  const text = [endpoint.operation_id, endpoint.tool_name, endpoint.summary, endpoint.description, endpoint.path, tool?.name, tool?.description]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/\b(draft|preview|compose|prepare|stage)\b/.test(text)) return "draft";
  if (/\b(send|publish|post|notify|invite|email|message|dispatch|submit)\b/.test(text)) return "send";
  return "write";
}

export function isPublicEndpoint(endpoint: OpenApiEndpoint) {
  const endpointVisibility = visibility(endpoint.visibility);
  if (endpointVisibility === "private") return false;
  if (endpointRequiresAuth(endpoint)) return false;

  const method = endpoint.method.toUpperCase();
  const readMethod = ["GET", "HEAD", "OPTIONS", "BROWSER"].includes(method);
  return endpointOperationKind(endpoint) === "read" && readMethod;
}

export function visibleEndpointsForRequest(server: McpServer) {
  const endpoints = Array.isArray(server.endpoint_map) ? server.endpoint_map : [];
  const tools = Array.isArray(server.tools_json) ? server.tools_json : [];
  const visible = endpoints.filter((endpoint) => {
    if (endpoint.method.toUpperCase() === "ASTRAIL_META") return false;
    if (endpoint.enabled === false) return false;
    return !tools.some((tool) => endpointMatchesTool(endpoint, tool) && tool.enabled === false);
  });
  if (!server.is_public) return visible;

  return visible.filter((endpoint) => {
    if (!isPublicEndpoint(endpoint)) return false;
    return !tools.some((tool) => endpointMatchesTool(endpoint, tool) && toolVisibility(tool) === "private");
  });
}

export function isToolIntentionallyPublic(server: McpServer, tool: McpTool, endpoint?: OpenApiEndpoint | null) {
  if (toolVisibility(tool) === "private") return false;

  const method = tool.method?.toUpperCase();
  if (method === "ASTRAIL_META" || method === "ASTRAIL_CODE") {
    return PUBLIC_META_TOOLS.has(tool.name) && visibleEndpointsForRequest(server).length > 0;
  }

  if (!endpoint) return false;
  return isPublicEndpoint(endpoint);
}

export function visibleToolsForRequest(
  server: McpServer,
  tools: McpTool[],
  findEndpoint: (server: McpServer, tool: McpTool) => OpenApiEndpoint | undefined
) {
  const enabled = tools.filter((tool) => tool.enabled !== false);
  if (!server.is_public) return enabled;
  return enabled.filter((tool) => isToolIntentionallyPublic(server, tool, findEndpoint(server, tool)));
}

export function redactText(input: string, explicitSecrets: string[] = []) {
  let output = input;
  for (const secret of explicitSecrets) {
    if (secret) output = output.split(secret).join("[redacted]");
  }
  return output
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(ASSIGNMENT_PATTERN, (_match, key) => `${key}=[redacted]`);
}

export function redactSensitive<T>(value: T, explicitSecrets: string[] = [], seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactText(value, explicitSecrets) as T;
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[redacted]" as T;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, explicitSecrets, seen)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEYS.test(key)
      ? "[redacted]"
      : redactSensitive(nested, explicitSecrets, seen);
  }
  return output as T;
}

function fieldValues(endpoint: OpenApiEndpoint, tool: McpTool, context: RuntimePermissionContext) {
  const httpMethod = endpoint.method.toUpperCase();
  const resource = endpoint.resource?.trim() || endpoint.tags?.[0]?.trim() || null;
  const sdkMethod = context.sdkMethod?.trim() || null;

  return {
    sdk_method: [sdkMethod, sdkMethod ? `client.${sdkMethod.replace(/^client\./, "")}` : null].filter(Boolean) as string[],
    endpoint_id: [endpointId(endpoint)].filter(Boolean),
    tool_name: [tool.name].filter(Boolean),
    operation_id: [endpoint.operation_id].filter(Boolean) as string[],
    method_path: [`${httpMethod} ${endpoint.path}`],
    resource: [resource].filter(Boolean) as string[],
    tag: endpoint.tags ?? [],
    path: [endpoint.path],
    http_method: [httpMethod],
  };
}

function allValues(endpoint: OpenApiEndpoint, tool: McpTool, context: RuntimePermissionContext) {
  const values = fieldValues(endpoint, tool, context);
  return Object.entries(values).flatMap(([field, entries]) =>
    entries.map((value) => ({ field, value }))
  );
}

function patternText(pattern: RuntimePermissionPattern) {
  return typeof pattern === "string" ? pattern : pattern.pattern;
}

function isRegexPattern(pattern: RuntimePermissionPattern) {
  return typeof pattern === "object" && pattern.regex === true;
}

function targetField(pattern: RuntimePermissionPattern) {
  return typeof pattern === "object" ? pattern.match : undefined;
}

function matchesPattern(pattern: RuntimePermissionPattern, candidates: Array<{ field: string; value: string }>) {
  const expected = patternText(pattern).trim();
  if (!expected) return null;
  const field = targetField(pattern);
  const scoped = field ? candidates.filter((candidate) => candidate.field === field) : candidates;
  const regex = isRegexPattern(pattern);

  for (const candidate of scoped) {
    if (regex) {
      try {
        if (new RegExp(expected, "i").test(candidate.value)) return candidate;
      } catch {
        return null;
      }
      continue;
    }

    if (candidate.value.toLowerCase() === expected.toLowerCase()) return candidate;
  }

  return null;
}

function firstMatch(patterns: RuntimePermissionPattern[] | undefined, candidates: Array<{ field: string; value: string }>) {
  for (const pattern of patterns ?? []) {
    const match = matchesPattern(pattern, candidates);
    if (match) {
      return {
        pattern: patternText(pattern),
        field: match.field,
      };
    }
  }
  return null;
}

function isRead(endpoint: OpenApiEndpoint, policy: RuntimePermissionPolicy) {
  if (endpoint.operation_kind === "read") return true;
  if (policy.allow_http_gets !== false && READ_METHODS.has(endpoint.method.toUpperCase())) return true;
  return false;
}

function denied(reason: string, match: { pattern: string; field: string } | null): RuntimePermissionDecision {
  return {
    allowed: false,
    code: "runtime_permission_denied",
    reason,
    matched: match?.pattern ?? null,
    matchedField: match?.field ?? null,
  };
}

function rolePolicyFor(policy: RuntimePermissionPolicy, actorRole: string | null): { role: string; scope: RuntimeRolePolicy } | null {
  const roles = policy.roles;
  if (!roles || typeof roles !== "object") return null;
  if (actorRole && roles[actorRole]) return { role: actorRole, scope: roles[actorRole] };
  if (roles.default) return { role: actorRole ?? "default", scope: roles.default };
  return null;
}

function evaluateRolePermission(
  policy: RuntimePermissionPolicy,
  endpoint: OpenApiEndpoint,
  tool: McpTool,
  context: RuntimePermissionContext
): RuntimePermissionDecision {
  const actorRole = normalizeActorRole(context.actorRole);
  const rolePolicy = rolePolicyFor(policy, actorRole);
  if (!rolePolicy) {
    if (policy.roles && Object.keys(policy.roles).length > 0) {
      return denied(
        actorRole
          ? `Role "${actorRole}" has no configured runtime permission scope.`
          : "This server requires a scoped actor role, but no default role is configured.",
        actorRole ? { pattern: actorRole, field: "actor_role" } : null,
      );
    }
    return { allowed: true };
  }

  const { role, scope } = rolePolicy;
  if (scope.blocked_tools?.some((name) => name === tool.name)) {
    return denied(`Role "${role}" blocks tool "${tool.name}".`, { pattern: tool.name, field: "tool_name" });
  }
  if (Array.isArray(scope.allowed_tools) && scope.allowed_tools.length > 0 && !scope.allowed_tools.includes(tool.name)) {
    return denied(`Role "${role}" only allows an explicit tool list, and "${tool.name}" is not on it.`, null);
  }
  if (scope.max_action_level && scope.max_action_level in ACTION_LEVEL_RANK) {
    const level = context.actionLevel ?? toolActionLevel(tool, endpoint);
    if (ACTION_LEVEL_RANK[level] > ACTION_LEVEL_RANK[scope.max_action_level]) {
      return denied(
        `Role "${role}" is limited to ${scope.max_action_level}-level actions; "${tool.name}" is classified as ${level}. Ask a human with a higher-privileged role, or use a draft-level alternative.`,
        { pattern: scope.max_action_level, field: "action_level" }
      );
    }
  }
  return { allowed: true };
}

export function evaluateRuntimePermission(
  policy: RuntimePermissionPolicy | null | undefined,
  endpoint: OpenApiEndpoint,
  tool: McpTool,
  context: RuntimePermissionContext = {}
): RuntimePermissionDecision {
  if (!policy) return { allowed: true };

  const values = allValues(endpoint, tool, context);
  const methodBlock = firstMatch(policy.blocked_methods, values);
  if (methodBlock) return denied("blocked_methods matched this SDK method or endpoint.", methodBlock);

  const roleDecision = evaluateRolePermission(policy, endpoint, tool, context);
  if (!roleDecision.allowed) return roleDecision;

  const resourceValues = fieldValues(endpoint, tool, context);
  const resourceCandidates = [
    ...resourceValues.resource.map((value) => ({ field: "resource", value })),
    ...resourceValues.tag.map((value) => ({ field: "tag", value })),
    ...resourceValues.path.map((value) => ({ field: "path", value })),
  ];
  const resourceBlock = firstMatch(policy.blocked_resources, resourceCandidates);
  if (resourceBlock) return denied("blocked_resources matched this endpoint resource.", resourceBlock);

  const actionClass = endpointActionClass(endpoint, tool);
  if ((policy.blocked_actions ?? []).includes(actionClass)) {
    return denied(`blocked_actions denies ${actionClass} operations.`, { pattern: actionClass, field: "action_class" });
  }

  const allowedActions = policy.allowed_actions ?? [];
  if (allowedActions.length > 0 && !allowedActions.includes(actionClass)) {
    return denied(`allowed_actions does not include ${actionClass} operations.`, null);
  }

  if (policy.read_only && !isRead(endpoint, policy)) {
    return denied("read_only runtime policy blocks non-read endpoint execution.", null);
  }

  const allowedResources = policy.allowed_resources ?? [];
  if (allowedResources.length > 0 && !firstMatch(allowedResources, resourceCandidates)) {
    return denied("allowed_resources did not match this endpoint resource.", null);
  }

  const allowedMethods = policy.allowed_methods ?? [];
  if (allowedMethods.length > 0 && !firstMatch(allowedMethods, values)) {
    if (policy.allow_http_gets === true && READ_METHODS.has(endpoint.method.toUpperCase())) {
      return { allowed: true };
    }
    return denied("allowed_methods did not match this SDK method or endpoint.", null);
  }

  if (policy.allow_http_gets === false && READ_METHODS.has(endpoint.method.toUpperCase()) && allowedMethods.length === 0) {
    return denied("allow_http_gets is false and no allowed_methods override matched.", null);
  }

  return { allowed: true };
}

export function runtimePolicySummary(policy: RuntimePermissionPolicy | null | undefined) {
  if (!policy) return null;
  return {
    allow_http_gets: policy.allow_http_gets ?? true,
    read_only: Boolean(policy.read_only),
    allowed_methods: policy.allowed_methods ?? [],
    blocked_methods: policy.blocked_methods ?? [],
    allowed_resources: policy.allowed_resources ?? [],
    blocked_resources: policy.blocked_resources ?? [],
    roles: policy.roles ?? null,
    allowed_actions: policy.allowed_actions ?? [],
    blocked_actions: policy.blocked_actions ?? [],
    x402: policy.x402 ? {
      enabled: policy.x402.enabled === true,
      custody: "caller_wallet_only",
      allowed_networks: policy.x402.allowed_networks ?? [],
      allowed_assets: policy.x402.allowed_assets ?? [],
      max_amount_per_call: policy.x402.max_amount_per_call ?? null,
      daily_limit: policy.x402.daily_limit ?? null,
      approval_threshold: policy.x402.approval_threshold ?? null,
      require_domain_verification: true,
    } : null,
    note: "Astrail runtime policy is an operational guardrail, not a security boundary. Use least-privilege provider credentials and upstream scopes for real authorization.",
  };
}
