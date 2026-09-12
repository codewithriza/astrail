import type { McpServer, OpenApiEndpoint } from "./types";

export type SearchDocsDetail = "compact" | "schema" | "examples" | "auth";

type SchemaPropertyDoc = {
  name: string;
  type: string;
  required: boolean;
  location?: string;
  source_name?: string;
  description?: string;
  enum?: unknown[];
  format?: string;
};

const DETAIL_MODES: SearchDocsDetail[] = ["compact", "schema", "examples", "auth"];
const PUBLIC_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS", "BROWSER"]);
const SENSITIVE_KEY_PATTERN = /(^|_|\b)(api_?key|access_?token|authorization|bearer|client_?secret|credential|password|refresh_?token|secret|signature|token)($|_|\b)/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const ASSIGNMENT_SECRET_PATTERN = /\b(api_?key|access_?token|authorization|bearer|client_?secret|password|refresh_?token|secret|token)=([^&\s"'`]+)/gi;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "api",
  "by",
  "for",
  "from",
  "get",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function camelCase(value: string) {
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

export function endpointId(endpoint: OpenApiEndpoint) {
  return endpoint.tool_name || endpoint.operation_id || `${endpoint.method} ${endpoint.path}`;
}

export function sdkResource(endpoint: OpenApiEndpoint) {
  return camelCase(endpoint.resource || endpoint.tags?.[0] || endpoint.path.split("/").find((part) => part && !part.startsWith("{")) || "api");
}

export function sdkMethod(endpoint: OpenApiEndpoint) {
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

function truncate(value: string | null | undefined, max = 240) {
  if (!value) return null;
  const normalized = redactText(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function tokenize(value: unknown) {
  if (typeof value !== "string") return [];
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function redactText(value: string) {
  return value
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(ASSIGNMENT_SECRET_PATTERN, (_match, key) => `${key}=[redacted]`);
}

function redactSensitive<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return redactText(value) as T;
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[redacted]" as T;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen)) as T;
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : redactSensitive(nested, seen);
  }
  return output as T;
}

function endpointVisibility(value: unknown) {
  return value === "public" || value === "private" ? value : null;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function endpointToolVisibility(server: McpServer, endpoint: OpenApiEndpoint) {
  const ids = new Set([
    endpointId(endpoint),
    endpoint.tool_name,
    endpoint.operation_id,
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
  const tools = Array.isArray(server.tools_json) ? server.tools_json : [];

  for (const tool of tools) {
    const matches = ids.has(tool.name) || Boolean(
      tool.method
      && tool.path
      && tool.method.toUpperCase() === endpoint.method.toUpperCase()
      && tool.path === endpoint.path
    );
    if (!matches) continue;
    const visibility = endpointVisibility(tool.visibility)
      ?? endpointVisibility(tool.x_astrail?.visibility)
      ?? endpointVisibility(record(tool.metadata).visibility);
    if (visibility) return visibility;
  }

  return null;
}

function endpointHasSecurityRequirement(endpoint: OpenApiEndpoint) {
  if (endpoint.requires_auth === true) return true;
  const security = endpoint.security_requirements ?? endpoint.security;
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

function endpointOperationKind(endpoint: OpenApiEndpoint) {
  if (endpoint.operation_kind) return endpoint.operation_kind;
  const method = endpoint.method.toUpperCase();
  if (PUBLIC_READ_METHODS.has(method)) return "read";
  if (method === "DELETE") return "destructive";
  return "write";
}

function isPublicDocsEndpoint(server: McpServer, endpoint: OpenApiEndpoint) {
  if (endpointVisibility(endpoint.visibility) === "private") return false;
  if (endpointToolVisibility(server, endpoint) === "private") return false;
  if (endpointHasSecurityRequirement(endpoint)) return false;
  return endpointOperationKind(endpoint) === "read" && PUBLIC_READ_METHODS.has(endpoint.method.toUpperCase());
}

export function visibleDocsEndpoints(server: McpServer) {
  const endpoints = (server.endpoint_map ?? [])
    .filter((endpoint) => !["ASTRAIL_META", "ASTRAIL_CODE"].includes(endpoint.method.toUpperCase()));
  return server.is_public ? endpoints.filter((endpoint) => isPublicDocsEndpoint(server, endpoint)) : endpoints;
}

function schemaType(schema: Record<string, unknown>) {
  if (typeof schema.type === "string") return schema.type;
  if (schema.$ref) return "ref";
  if (Array.isArray(schema.enum)) return "enum";
  if (schema.anyOf || schema.oneOf) return "union";
  return "unknown";
}

export function exampleArgumentsFromSchema(schema: unknown) {
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
    else if (prop.default !== undefined) args[name] = prop.default;
    else if (prop.type === "integer" || prop.type === "number") args[name] = 1;
    else if (prop.type === "boolean") args[name] = true;
    else if (prop.type === "array") args[name] = [];
    else if (prop.type === "object") args[name] = {};
    else args[name] = name.toLowerCase().includes("id") ? "example_id" : "example";
    args[name] = SENSITIVE_KEY_PATTERN.test(name) ? "[redacted]" : redactSensitive(args[name]);
  }

  return args;
}

export function schemaProperties(schema: unknown) {
  if (!schema || typeof schema !== "object") return [] as SchemaPropertyDoc[];
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object"
    ? record.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(record.required) ? record.required : [];
  return Object.entries(properties).slice(0, 16).map(([name, property]) => {
    const prop = property && typeof property === "object" ? property as Record<string, unknown> : {};
    return {
      name,
      type: schemaType(prop),
      required: required.includes(name),
      location: stringValue(prop["x-astrail-in"]) || undefined,
      source_name: stringValue(prop["x-astrail-name"]) || undefined,
      description: truncate(redactText(stringValue(prop.description)), 160) ?? undefined,
      enum: Array.isArray(prop.enum) ? redactSensitive(prop.enum.slice(0, 8)) : undefined,
      format: stringValue(prop.format) || undefined,
    };
  });
}

function collectParameterNames(endpoint: OpenApiEndpoint) {
  const params = Array.isArray(endpoint.parameters) ? endpoint.parameters : [];
  return params
    .map((param) => param && typeof param === "object" ? (param as Record<string, unknown>).name : null)
    .filter((name): name is string => typeof name === "string")
    .map((name) => name.toLowerCase());
}

export function paginationHint(endpoint: OpenApiEndpoint) {
  const names = collectParameterNames(endpoint);
  if (names.some((name) => ["cursor", "starting_after", "ending_before", "next_cursor", "page_token"].includes(name))) {
    return { type: "cursor", fields: names.filter((name) => name.includes("cursor") || name.includes("token") || name.includes("after") || name.includes("before")) };
  }
  if (names.some((name) => ["page", "per_page", "page_size"].includes(name))) {
    return { type: "page", fields: names.filter((name) => name.includes("page")) };
  }
  if (names.some((name) => ["offset", "limit"].includes(name))) {
    return { type: "offset", fields: names.filter((name) => ["offset", "limit"].includes(name)) };
  }
  return null;
}

export function securitySchemeNames(value: unknown) {
  const names = new Set<string>();
  const collect = (item: unknown) => {
    if (!item) return;
    if (typeof item === "string") {
      names.add(item);
      return;
    }
    if (Array.isArray(item)) {
      for (const child of item) collect(child);
      return;
    }
    if (typeof item === "object") {
      for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
        names.add(key);
        if (Array.isArray(child) && child.every((value) => typeof value === "string")) continue;
        collect(child);
      }
    }
  };
  collect(value);
  return Array.from(names).filter(Boolean).sort();
}

export function authSummary(endpoint: OpenApiEndpoint) {
  const security = endpoint.security_requirements ?? endpoint.security ?? null;
  const schemes = securitySchemeNames(security);
  return {
    required: Boolean(endpoint.requires_auth),
    schemes,
    note: endpoint.requires_auth
      ? "Provider credentials must be configured in Astrail before execute can call this upstream endpoint."
      : "No upstream auth requirement was declared for this endpoint.",
  };
}

function responseHints(endpoint: OpenApiEndpoint) {
  const hints = Array.isArray(endpoint.response_hints) ? endpoint.response_hints : [];
  return hints.slice(0, 4).map((hint) => {
    const record = hint && typeof hint === "object" ? hint as Record<string, unknown> : {};
    return {
      status: stringValue(record.status),
      description: truncate(redactText(stringValue(record.description)), 140),
      content_types: Array.isArray(record.content_types) ? record.content_types.slice(0, 4) : undefined,
      schema_hint: redactSensitive(record.schema_hint ?? undefined),
    };
  });
}

function endpointExamples(endpoint: OpenApiEndpoint) {
  const resource = sdkResource(endpoint);
  const method = sdkMethod(endpoint);
  const exampleArgs = exampleArgumentsFromSchema(endpoint.input_schema);
  const argJson = JSON.stringify(exampleArgs, null, 2);
  const call = `client.${resource}.${method}(${argJson})`;
  const isListLikeRead = endpoint.operation_kind === "read" && (method.toLowerCase().startsWith("list") || !endpoint.path.includes("{"));

  return {
    arguments: exampleArgs,
    typescript: `const result = await ${call};`,
    iterable_typescript: isListLikeRead
      ? `const results = [];\nfor await (const item of ${call}) {\n  results.push(item);\n}\nreturn results;`
      : null,
  };
}

export function endpointDocsCorpus(endpoint: OpenApiEndpoint) {
  const resource = sdkResource(endpoint);
  const method = sdkMethod(endpoint);
  const args = schemaProperties(endpoint.input_schema);
  const auth = authSummary(endpoint);
  const pagination = paginationHint(endpoint);
  const sdkMethodName = `client.${resource}.${method}`;
  const required_arguments = args.filter((arg) => arg.required).map((arg) => arg.name);
  const searchable = [
    sdkMethodName,
    endpointId(endpoint),
    endpoint.method,
    endpoint.path,
    endpoint.operation_id,
    endpoint.summary,
    endpoint.description,
    endpoint.resource,
    endpoint.operation_kind,
    ...(endpoint.tags ?? []),
    ...args.flatMap((arg) => [arg.name, arg.source_name, arg.location, arg.description, arg.type]),
    ...auth.schemes,
    pagination?.type,
  ].filter(Boolean).join(" ");

  return {
    sdk_method: sdkMethodName,
    endpoint_id: endpointId(endpoint),
    method: endpoint.method,
    path: endpoint.path,
    resource,
    operation: endpoint.operation_kind,
    title: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
    searchable_text: truncate(searchable, 2000) ?? "",
    required_arguments,
    argument_count: args.length,
    auth,
    pagination,
    response_hints: responseHints(endpoint),
    examples: endpointExamples(endpoint),
  };
}

export function sdkDocForEndpoint(endpoint: OpenApiEndpoint, detail: SearchDocsDetail = "compact", score?: number, matchedTerms?: string[]) {
  const corpus = endpointDocsCorpus(endpoint);
  const args = schemaProperties(endpoint.input_schema);
  const compactDoc = {
    sdk_method: corpus.sdk_method,
    endpoint_id: corpus.endpoint_id,
    http: `${endpoint.method} ${endpoint.path}`,
    method: endpoint.method,
    path: endpoint.path,
    resource: corpus.resource,
    operation: corpus.operation,
    summary: truncate(endpoint.summary, 180),
    description: truncate(endpoint.description, 320),
    requires_auth: corpus.auth.required,
    auth_schemes: corpus.auth.schemes,
    tags: endpoint.tags ?? [],
    required_fields: corpus.required_arguments,
    arguments: args,
    pagination: corpus.pagination,
    response_hints: corpus.response_hints,
    example: corpus.examples.typescript,
    iterable_example: corpus.examples.iterable_typescript,
    score,
    matched_terms: matchedTerms,
    execution_notes: [
      "Use only the returned client.resource.method shape with execute.",
      "Astrail statically compiles supported SDK calls to endpoint-map execution; arbitrary JavaScript is not evaluated.",
      corpus.operation === "destructive" || corpus.operation === "write" ? "Ask the user to confirm intent before write or destructive operations." : null,
      corpus.pagination ? `Pagination appears ${corpus.pagination.type}-based; pass the documented pagination fields when continuing a list.` : null,
    ].filter(Boolean),
  };

  if (detail === "schema") {
    return redactSensitive({
      ...compactDoc,
      input_schema: redactSensitive(endpoint.input_schema ?? { type: "object", properties: {} }),
      request_body_schema: redactSensitive(endpoint.request_body_schema ?? null),
      parameters: redactSensitive(Array.isArray(endpoint.parameters) ? endpoint.parameters.slice(0, 20) : []),
    });
  }

  if (detail === "examples") {
    return redactSensitive({
      ...compactDoc,
      examples: corpus.examples,
    });
  }

  if (detail === "auth") {
    return redactSensitive({
      ...compactDoc,
      auth: {
        ...corpus.auth,
        schemes: [...corpus.auth.schemes],
        security: redactSensitive(endpoint.security_requirements ?? endpoint.security ?? null),
      },
    });
  }

  return redactSensitive(compactDoc);
}

function weightedSearchFields(endpoint: OpenApiEndpoint) {
  const corpus = endpointDocsCorpus(endpoint);
  const args = schemaProperties(endpoint.input_schema);
  return [
    { weight: 18, text: corpus.sdk_method },
    { weight: 16, text: endpoint.operation_id },
    { weight: 14, text: endpoint.summary },
    { weight: 12, text: `${endpoint.method} ${endpoint.path}` },
    { weight: 10, text: corpus.resource },
    { weight: 8, text: endpoint.description },
    { weight: 7, text: (endpoint.tags ?? []).join(" ") },
    { weight: 6, text: args.map((arg) => `${arg.name} ${arg.source_name ?? ""} ${arg.description ?? ""}`).join(" ") },
    { weight: 4, text: responseHints(endpoint).map((hint) => `${hint.status} ${hint.description ?? ""}`).join(" ") },
    { weight: 3, text: authSummary(endpoint).schemes.join(" ") },
    { weight: 2, text: corpus.searchable_text },
  ];
}

function scoreEndpoint(endpoint: OpenApiEndpoint, query: string) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { score: 1, matchedTerms: [] };

  const phrase = query.toLowerCase().trim();
  let score = 0;
  const matched = new Set<string>();

  for (const field of weightedSearchFields(endpoint)) {
    const text = stringValue(field.text).toLowerCase();
    if (!text) continue;
    if (phrase.length > 2 && text.includes(phrase)) {
      score += field.weight * 3;
    }
    const fieldTokens = new Set(tokenize(text));
    for (const token of tokens) {
      if (fieldTokens.has(token)) {
        score += field.weight;
        matched.add(token);
      } else if (text.includes(token)) {
        score += field.weight / 2;
        matched.add(token);
      }
    }
  }

  if (tokens.length > 0 && matched.size === tokens.length) score += 20;
  if (endpoint.operation_kind === "read" && tokens.some((token) => ["list", "search", "find", "retrieve", "fetch"].includes(token))) score += 4;
  return { score, matchedTerms: Array.from(matched) };
}

function normalizeDetailMode(value: unknown): SearchDocsDetail {
  return DETAIL_MODES.includes(value as SearchDocsDetail) ? value as SearchDocsDetail : "compact";
}

export function searchDocs(server: McpServer, args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  const resource = typeof args.resource === "string" ? camelCase(args.resource).toLowerCase() : "";
  const operation = typeof args.operation === "string" ? args.operation.toLowerCase().trim() : "";
  const detail = normalizeDetailMode(args.detail);
  const limit = Math.max(1, Math.min(Number(args.limit ?? 8) || 8, 20));
  const allDocsEndpoints = (server.endpoint_map ?? [])
    .filter((endpoint) => !["ASTRAIL_META", "ASTRAIL_CODE"].includes(endpoint.method.toUpperCase()));
  const visibleEndpoints = visibleDocsEndpoints(server);
  const scored = visibleEndpoints
    .map((endpoint) => {
      const doc = endpointDocsCorpus(endpoint);
      const ranking = scoreEndpoint(endpoint, query);
      return { endpoint, doc, ...ranking };
    })
    .filter((item) => {
      if (query && item.score <= 0) return false;
      if (resource && item.doc.resource.toLowerCase() !== resource) return false;
      if (operation && item.doc.operation !== operation) return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || a.doc.sdk_method.localeCompare(b.doc.sdk_method));

  return {
    status: "success",
    server: server.name,
    mode: "astrail_code_mode",
    detail,
    total_matches: scored.length,
    returned: Math.min(scored.length, limit),
    docs_corpus: {
      version: "2026-06-23",
      total_endpoints: allDocsEndpoints.length,
      searched_endpoints: visibleEndpoints.length,
      visibility_filter: server.is_public
        ? "public servers expose only read endpoints without upstream auth and without visibility=private"
        : "private servers expose the authenticated endpoint map",
      fields: [
        "sdk_method",
        "http",
        "summary",
        "arguments",
        "required_fields",
        "auth",
        "pagination",
        "response_hints",
        "examples",
      ],
      ranking: "weighted token scoring over SDK method, operationId, summary, path, parameters, tags, auth, and response hints",
    },
    docs: scored.slice(0, limit).map((item) => sdkDocForEndpoint(item.endpoint, detail, Math.round(item.score * 100) / 100, item.matchedTerms)),
    execute_contract: {
      supported_call_shapes: [
        "await client.resource.method({ jsonCompatible: true })",
        "for await (const item of client.resource.list({ jsonCompatible: true })) { ... }",
      ],
      batching: "Independent read calls in one execute request are compiled and run in parallel.",
      note: "Astrail statically compiles SDK-style calls to endpoint-map execution. It does not eval arbitrary JavaScript.",
    },
  };
}
