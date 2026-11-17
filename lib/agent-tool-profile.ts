import type { AstrailToolProfile, McpActionLevel, McpTool, McpToolAnnotations, McpToolPolicy, OpenApiEndpoint } from "./types";

function titleFromName(name: string) {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function methodRisk(method?: string): AstrailToolProfile["risk"] {
  const normalized = method?.toUpperCase();
  if (!normalized || normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") return "read";
  if (normalized === "DELETE") return "destructive";
  return "write";
}

const ACTION_LEVELS = new Set<McpActionLevel>(["read", "draft", "write", "send", "destructive"]);
// "send" is outward-facing communication (email, SMS, notifications) — the
// action a human most often wants gated separately from ordinary writes.
const SEND_NAME_PATTERN = /(^|[_\-/])(send|publish|dispatch|broadcast|notify|email|sms|announce|reply|invite)([_\-/]|$|s\b)/i;
const DRAFT_NAME_PATTERN = /(^|[_\-/])(draft|preview|dry[_-]?run|validate|estimate|quote)([_\-/]|$|s\b)/i;

function explicitActionLevel(tool: Pick<McpTool, "metadata" | "x_astrail">): McpActionLevel | null {
  const candidates = [
    tool.x_astrail?.action_level,
    tool.metadata && typeof tool.metadata === "object" ? (tool.metadata as Record<string, unknown>).action_level : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && ACTION_LEVELS.has(candidate as McpActionLevel)) {
      return candidate as McpActionLevel;
    }
  }
  return null;
}

export function toolActionLevel(
  tool: Pick<McpTool, "name" | "method" | "path" | "metadata" | "x_astrail" | "annotations">,
  endpoint?: Pick<OpenApiEndpoint, "method" | "path" | "operation_id" | "operation_kind">
): McpActionLevel {
  const explicit = explicitActionLevel(tool);
  if (explicit) return explicit;

  const risk = endpoint?.operation_kind === "read" || endpoint?.operation_kind === "destructive"
    ? endpoint.operation_kind
    : methodRisk(endpoint?.method ?? tool.method);
  if (risk === "read") return "read";
  if (risk === "destructive" || tool.annotations?.destructiveHint === true) return "destructive";

  const text = [tool.name, endpoint?.operation_id, endpoint?.path ?? tool.path].filter(Boolean).join(" ");
  if (DRAFT_NAME_PATTERN.test(text)) return "draft";
  if (SEND_NAME_PATTERN.test(text)) return "send";
  return "write";
}

export function defaultToolPolicy(tool: Pick<McpTool, "method" | "annotations">, endpoint?: Pick<OpenApiEndpoint, "method" | "operation_kind">): McpToolPolicy {
  const risk = endpoint?.operation_kind ?? methodRisk(endpoint?.method ?? tool.method);
  if (tool.annotations?.destructiveHint === true || risk === "destructive") return "block";
  if (tool.annotations?.readOnlyHint === true || risk === "read") return "allow";
  return "approval";
}

function authSchemes(security: unknown) {
  if (!security) return [];
  if (Array.isArray(security)) {
    return Array.from(new Set(security.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      return Object.keys(item);
    })));
  }
  if (typeof security === "object") return Object.keys(security);
  return [String(security)];
}

function authScopes(security: unknown) {
  if (!Array.isArray(security)) return [];
  return Array.from(new Set(security.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return Object.values(item as Record<string, unknown>).flatMap((value) =>
      Array.isArray(value) ? value.filter((scope): scope is string => typeof scope === "string") : []
    );
  })));
}

function parameterName(parameter: unknown) {
  if (!parameter || typeof parameter !== "object") return null;
  const name = (parameter as Record<string, unknown>).name;
  return typeof name === "string" ? name : null;
}

function schemaExample(schema: unknown, fallback: unknown): unknown {
  if (!schema || typeof schema !== "object") return fallback;
  const record = schema as Record<string, unknown>;
  if (record.example !== undefined) return record.example;
  if (Array.isArray(record.examples) && record.examples.length > 0) return record.examples[0];
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];
  const type = record.type;
  if (type === "integer" || type === "number") return 1;
  if (type === "boolean") return true;
  if (type === "array") return [];
  if (type === "object") return {};
  if (record.format === "date-time") return "2026-06-12T00:00:00.000Z";
  if (record.format === "date") return "2026-06-12";
  if (record.format === "email") return "user@company.com";
  return fallback;
}

function exampleArguments(endpoint: OpenApiEndpoint) {
  const args: Record<string, unknown> = {};
  const parameters = Array.isArray(endpoint.parameters) ? endpoint.parameters : [];

  for (const parameter of parameters.slice(0, 8)) {
    if (!parameter || typeof parameter !== "object") continue;
    const record = parameter as Record<string, unknown>;
    const name = parameterName(parameter);
    if (!name) continue;
    args[name] = schemaExample(record.schema, name.includes("id") ? "example_id" : "example");
  }

  if (endpoint.request_body_schema && !("body" in args)) {
    args.body = schemaExample(endpoint.request_body_schema, {});
  }

  return args;
}

function countSchemaProperties(schema: unknown, seen = new WeakSet<object>()): number {
  if (!schema || typeof schema !== "object") return 0;
  if (seen.has(schema)) return 0;
  seen.add(schema);

  const record = schema as Record<string, unknown>;
  const properties: unknown[] = record.properties && typeof record.properties === "object"
    ? Object.values(record.properties as Record<string, unknown>)
    : [];

  let nestedCount = 0;
  for (const value of properties) {
    nestedCount += countSchemaProperties(value, seen);
  }

  return properties.length + nestedCount + (record.items ? countSchemaProperties(record.items, seen) : 0);
}

function prerequisiteHints(endpoint: OpenApiEndpoint, risk: AstrailToolProfile["risk"]) {
  const hints: string[] = [];
  if (endpoint.requires_auth) hints.push("Connect provider credentials before live execution.");
  if (risk !== "read") hints.push("Ask for user confirmation before calling this write-capable tool.");
  if (endpoint.request_body_schema && countSchemaProperties(endpoint.request_body_schema) > 10) {
    hints.push("Complex request body is accepted as one compact JSON object instead of thousands of generated parameters.");
  }
  const requiredPathParams = (endpoint.path_params ?? []).map(parameterName).filter(Boolean);
  if (requiredPathParams.length > 0) {
    hints.push(`Resolve required path parameters first: ${requiredPathParams.join(", ")}.`);
  }
  return hints;
}

function agentInstructions(endpoint: OpenApiEndpoint, risk: AstrailToolProfile["risk"]) {
  const instructions = [
    `Use for ${endpoint.method} ${endpoint.path}.`,
    "Pass only documented arguments; unknown values are rejected by the hosted runtime.",
  ];

  if (endpoint.response_hints) {
    instructions.push("Read response status and error descriptions before retrying or escalating.");
  }
  if (risk === "read") {
    instructions.push("Safe for discovery and context gathering.");
  } else {
    instructions.push("Prefer dry-run or user approval when this changes external state.");
  }
  if (endpoint.request_body_schema && countSchemaProperties(endpoint.request_body_schema) > 10) {
    instructions.push("For complex schemas, pass the full request payload in the body object.");
  }

  return instructions;
}

export function toolAnnotationsForEndpoint(tool: McpTool, endpoint?: OpenApiEndpoint): McpToolAnnotations {
  const risk = methodRisk(endpoint?.method ?? tool.method);
  const method = endpoint?.method?.toUpperCase() ?? tool.method?.toUpperCase();

  return {
    title: titleFromName(tool.name),
    readOnlyHint: risk === "read",
    destructiveHint: risk === "destructive",
    idempotentHint: method === "GET" || method === "PUT" || method === "DELETE",
    openWorldHint: true,
  };
}

export function toolProfileForEndpoint(tool: McpTool, endpoint?: OpenApiEndpoint): AstrailToolProfile {
  const risk = methodRisk(endpoint?.method ?? tool.method);
  const security = endpoint?.security_requirements ?? endpoint?.security;
  const parameterCount = endpoint
    ? (Array.isArray(endpoint.parameters) ? endpoint.parameters.length : 0) + countSchemaProperties(endpoint.request_body_schema)
    : 0;
  const compressed = Boolean(endpoint?.request_body_schema && countSchemaProperties(endpoint.request_body_schema) > 10);

  return {
    method: endpoint?.method ?? tool.method,
    path: endpoint?.path ?? tool.path,
    risk,
    requires_auth: Boolean(endpoint?.requires_auth),
    auth_schemes: authSchemes(security),
    required_scopes: authScopes(security),
    action_level: toolActionLevel(tool, endpoint),
    prerequisites: endpoint ? prerequisiteHints(endpoint, risk) : [],
    agent_instructions: endpoint ? agentInstructions(endpoint, risk) : ["Use only with documented arguments."],
    response_hints: endpoint?.response_hints,
    example_arguments: endpoint ? exampleArguments(endpoint) : {},
    complexity: {
      parameter_count: parameterCount,
      body_mode: compressed ? "compact_object" : "schema",
      compressed,
    },
  };
}

export function enrichToolsForAgents(tools: McpTool[], endpoints: OpenApiEndpoint[]) {
  return tools.map((tool, index) => {
    const endpoint = endpoints[index]
      ?? endpoints.find((item) => item.tool_name === tool.name)
      ?? endpoints.find((item) => item.method === tool.method && item.path === tool.path);

    return {
      ...tool,
      policy: tool.policy ?? endpoint?.policy ?? defaultToolPolicy(tool, endpoint),
      annotations: {
        ...toolAnnotationsForEndpoint(tool, endpoint),
        ...(tool.annotations ?? {}),
      },
      x_astrail: {
        ...toolProfileForEndpoint(tool, endpoint),
        ...(tool.x_astrail ?? {}),
      },
    };
  });
}
