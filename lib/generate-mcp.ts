import { getAnthropicClient } from "./anthropic";
import { extractJsonRequestBodySchema } from "./openapiContent";
import { parseSpecText } from "./openapi";
import { assertSafeUpstreamUrl, readBoundedResponseText } from "./runtime/network-policy";
import {
  generationValidationError,
  looksLikeOpenApiSpec,
  validateGeneratedMcp,
  validateOpenApiSpec,
  type OpenApiSpec,
} from "./validators";
import type { GeneratedMcpServer, McpClientPreset, McpGenerationMode, McpTool, OpenApiEndpoint, SourceType } from "./types";

export { looksLikeOpenApiSpec, parseSpecText, validateOpenApiSpec };

const MAX_OPENAPI_SPEC_BYTES = 5_000_000;
const ANTHROPIC_GENERATION_MODEL = process.env.ANTHROPIC_GENERATION_MODEL ?? "claude-sonnet-5";

export async function loadSpec(input: {
  sourceType: SourceType;
  sourceUrl?: string;
  rawJson?: string;
}) {
  let parsed: unknown;

  if (input.sourceType === "openapi_url") {
    if (!input.sourceUrl) throw new Error("OpenAPI URL is required.");
    const sourceUrl = new URL(input.sourceUrl);
    await assertSafeUpstreamUrl(sourceUrl);
    const response = await fetch(sourceUrl, {
      headers: { accept: "application/json, text/plain, */*" },
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("OpenAPI URL redirected without a Location header.");
      const redirectUrl = new URL(location, sourceUrl);
      await assertSafeUpstreamUrl(redirectUrl);
      const redirected = await fetch(redirectUrl, {
        headers: { accept: "application/json, text/plain, */*" },
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
      });
      if (!redirected.ok) {
        throw new Error(`Could not fetch spec. HTTP ${redirected.status}.`);
      }
      parsed = parseSpecText(await readBoundedResponseText(redirected, MAX_OPENAPI_SPEC_BYTES, "OpenAPI document"));
      return validateOpenApiSpec(parsed);
    }

    if (!response.ok) {
      throw new Error(`Could not fetch spec. HTTP ${response.status}.`);
    }

    parsed = parseSpecText(await readBoundedResponseText(response, MAX_OPENAPI_SPEC_BYTES, "OpenAPI document"));
  } else {
    if (!input.rawJson) throw new Error("Raw OpenAPI JSON is required.");
    parsed = parseSpecText(input.rawJson, "json");
  }

  return validateOpenApiSpec(parsed);
}

export type GenerateMcpOptions = {
  clientPreset?: McpClientPreset;
  generationMode?: McpGenerationMode;
};

const CLIENT_CAPABILITIES: Record<McpClientPreset, {
  inlineRefs: boolean;
  allowAnyOf: boolean;
  allowTopLevelAnyOf: boolean;
  keepFormats: boolean;
  toolNameLimit: number;
}> = {
  default: {
    inlineRefs: false,
    allowAnyOf: true,
    allowTopLevelAnyOf: true,
    keepFormats: true,
    toolNameLimit: 64,
  },
  claude: {
    inlineRefs: false,
    allowAnyOf: true,
    allowTopLevelAnyOf: true,
    keepFormats: true,
    toolNameLimit: 64,
  },
  "claude-code": {
    inlineRefs: false,
    allowAnyOf: true,
    allowTopLevelAnyOf: false,
    keepFormats: true,
    toolNameLimit: 64,
  },
  cursor: {
    inlineRefs: true,
    allowAnyOf: false,
    allowTopLevelAnyOf: false,
    keepFormats: false,
    toolNameLimit: 48,
  },
  openai: {
    inlineRefs: true,
    allowAnyOf: true,
    allowTopLevelAnyOf: false,
    keepFormats: false,
    toolNameLimit: 64,
  },
};

export function summarizeEndpointsForGeneration(spec: OpenApiSpec) {
  const paths = spec.paths ?? {};
  return Object.entries(paths).flatMap(([path, value]) => {
    if (!value || typeof value !== "object") return [];
    const methods = value as Record<string, unknown>;
    const pathParameters = Array.isArray(methods.parameters) ? methods.parameters : [];
    return Object.entries(methods)
      .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
      .map(([method, operation]) => {
        const op = operation && typeof operation === "object"
          ? (operation as Record<string, unknown>)
          : {};
        return {
          method: method.toUpperCase(),
          path,
          operationId: typeof op.operationId === "string" ? op.operationId : undefined,
          summary: typeof op.summary === "string" ? op.summary : undefined,
          description: typeof op.description === "string" ? op.description.slice(0, 280) : undefined,
          tags: Array.isArray(op.tags) ? op.tags.filter((tag): tag is string => typeof tag === "string") : [],
          parameters: [...pathParameters, ...(Array.isArray(op.parameters) ? op.parameters : [])],
          requestBody: op.requestBody ?? undefined,
          responses: op.responses ?? undefined,
          security: op.security ?? undefined,
        };
      });
  });
}

function snakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function fallbackName(spec: OpenApiSpec) {
  return spec.info?.title?.trim() || "Generated API";
}

function fallbackDescription(spec: OpenApiSpec) {
  return spec.info?.description?.trim() || `MCP server for ${fallbackName(spec)}.`;
}

function localComponentSchemas(spec: OpenApiSpec) {
  const components = spec.components && typeof spec.components === "object"
    ? (spec.components as Record<string, unknown>)
    : {};
  const schemas = components.schemas && typeof components.schemas === "object"
    ? (components.schemas as Record<string, unknown>)
    : {};

  const defs = (spec as Record<string, unknown>).definitions;
  const swaggerDefinitions = defs && typeof defs === "object" ? defs as Record<string, unknown> : {};
  return { ...swaggerDefinitions, ...schemas };
}

function refName(ref: string) {
  return decodeURIComponent(ref.split("/").pop() ?? "").replace(/[^a-zA-Z0-9_-]+/g, "_") || "schema";
}

function resolveLocalRef(spec: OpenApiSpec, ref: string) {
  if (ref.startsWith("#/components/schemas/")) return localComponentSchemas(spec)[refName(ref)];
  if (ref.startsWith("#/definitions/")) return localComponentSchemas(spec)[refName(ref)];
  if (ref.startsWith("#/$defs/")) return localComponentSchemas(spec)[refName(ref)];
  return null;
}

function cleanSchemaKeyword(key: string) {
  return ![
    "nullable",
    "deprecated",
    "readOnly",
    "writeOnly",
    "xml",
    "externalDocs",
    "discriminator",
  ].includes(key);
}

const SYSTEM_PARAMETER=/^(authorization|cookie|set-cookie|traceparent|tracestate|x-request-id|x-correlation-id|x-api-key|api[-_]?key|access[-_]?token|oauth[-_]?token|user-agent|content-type|accept)$/i;
function pruneRequestSchema(schema:unknown):unknown{if(Array.isArray(schema))return schema.map(pruneRequestSchema);if(!schema||typeof schema!=="object")return schema;const record=schema as Record<string,unknown>;const next:Record<string,unknown>={...record};if(record.properties&&typeof record.properties==="object"){const properties=Object.fromEntries(Object.entries(record.properties as Record<string,unknown>).filter(([,value])=>!(value&&typeof value==="object"&&(value as Record<string,unknown>).readOnly===true)).map(([key,value])=>[key,pruneRequestSchema(value)]));next.properties=properties;if(Array.isArray(record.required))next.required=record.required.filter((name)=>typeof name==="string"&&name in properties);}if(record.items)next.items=pruneRequestSchema(record.items);return next;}

function mergeAllOf(items: unknown[]) {
  const merged: Record<string, unknown> = { type: "object", properties: {} };
  const required = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.properties && typeof record.properties === "object") {
      merged.properties = {
        ...(merged.properties as Record<string, unknown>),
        ...(record.properties as Record<string, unknown>),
      };
    }
    if (Array.isArray(record.required)) {
      for (const value of record.required) {
        if (typeof value === "string") required.add(value);
      }
    }
    for (const [key, value] of Object.entries(record)) {
      if (["type", "properties", "required"].includes(key)) continue;
      if (merged[key] === undefined) merged[key] = value;
    }
  }

  if (required.size > 0) merged.required = Array.from(required);
  return merged;
}

function appendFormatDescription(description: unknown, format: unknown) {
  if (typeof format !== "string" || !format) return description;
  const suffix = `(format: ${format})`;
  return typeof description === "string" && description.trim()
    ? `${description} ${suffix}`
    : suffix;
}

function transformJsonSchema(
  schema: unknown,
  spec: OpenApiSpec,
  preset: McpClientPreset,
  state: {
    depth: number;
    refs: string[];
    defs: Record<string, unknown>;
    insideRoot: boolean;
  }
): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) {
    return schema.map((item) => transformJsonSchema(item, spec, preset, { ...state, depth: state.depth + 1 }));
  }

  const capabilities = CLIENT_CAPABILITIES[preset];
  const record = schema as Record<string, unknown>;

  if (typeof record.$ref === "string") {
    const resolved = resolveLocalRef(spec, record.$ref);
    if (!resolved) return { type: "object", additionalProperties: true, description: `Unresolved schema reference: ${record.$ref}` };
    if (state.refs.includes(record.$ref) || state.depth > 8) {
      return {
        type: "object",
        additionalProperties: true,
        description: `Recursive schema reference omitted for ${preset} compatibility.`,
        "x-astrail-dropped-recursive-ref": record.$ref,
      };
    }

    if (capabilities.inlineRefs) {
      return transformJsonSchema(resolved, spec, preset, {
        ...state,
        depth: state.depth + 1,
        refs: [...state.refs, record.$ref],
        insideRoot: false,
      });
    }

    const name = refName(record.$ref);
    state.defs[name] = transformJsonSchema(resolved, spec, preset, {
      ...state,
      depth: state.depth + 1,
      refs: [...state.refs, record.$ref],
      insideRoot: false,
    });
    return { $ref: `#/$defs/${name}` };
  }

  if (Array.isArray(record.allOf)) {
    return transformJsonSchema(mergeAllOf(record.allOf), spec, preset, state);
  }

  if (!capabilities.allowAnyOf) {
    const union = Array.isArray(record.anyOf) ? record.anyOf : Array.isArray(record.oneOf) ? record.oneOf : null;
    if (union && union.length > 0) {
      return transformJsonSchema(union[0], spec, preset, state);
    }
  }

  if (state.insideRoot && !capabilities.allowTopLevelAnyOf) {
    const union = Array.isArray(record.anyOf) ? record.anyOf : Array.isArray(record.oneOf) ? record.oneOf : null;
    if (union && union.length > 0) {
      return transformJsonSchema(union[0], spec, preset, { ...state, insideRoot: false });
    }
  }

  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!cleanSchemaKeyword(key)) continue;
    if (!capabilities.keepFormats && key === "format") continue;
    if ((!capabilities.allowAnyOf || state.insideRoot && !capabilities.allowTopLevelAnyOf) && (key === "anyOf" || key === "oneOf")) continue;
    next[key] = transformJsonSchema(value, spec, preset, {
      ...state,
      depth: state.depth + 1,
      insideRoot: false,
    });
  }

  if (!capabilities.keepFormats && record.format) {
    next.description = appendFormatDescription(next.description, record.format);
  }

  return next;
}

function normalizeSchemaForClient(schema: unknown, spec: OpenApiSpec, preset: McpClientPreset, insideRoot = false) {
  const defs: Record<string, unknown> = {};
  const transformed = transformJsonSchema(schema, spec, preset, { depth: 0, refs: [], defs, insideRoot });
  if (!transformed || typeof transformed !== "object" || Array.isArray(transformed)) return transformed;

  const result = transformed as Record<string, unknown>;
  if (Object.keys(defs).length > 0 && !CLIENT_CAPABILITIES[preset].inlineRefs) {
    result.$defs = {
      ...(result.$defs && typeof result.$defs === "object" ? result.$defs as Record<string, unknown> : {}),
      ...defs,
    };
  }
  return result;
}

function uniquePropertyName(base: string, used: Set<string>, fallbackPrefix: string) {
  const cleaned = snakeCase(base) || fallbackPrefix;
  if (!used.has(cleaned)) {
    used.add(cleaned);
    return cleaned;
  }

  let index = 2;
  let candidate = `${fallbackPrefix}_${cleaned}`;
  while (used.has(candidate)) {
    candidate = `${fallbackPrefix}_${cleaned}_${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function parameterLocation(parameter: Record<string, unknown>) {
  return typeof parameter.in === "string" ? parameter.in : "query";
}

function enrichParameterSchema(
  schema: Record<string, unknown>,
  parameter: Record<string, unknown>,
  argumentName: string,
  originalName: string
) {
  return {
    ...schema,
    description: typeof parameter.description === "string" ? parameter.description : schema.description ?? `${originalName} parameter`,
    "x-astrail-name": originalName,
    "x-astrail-in": parameterLocation(parameter),
    "x-astrail-argument-name": argumentName,
  };
}

function buildInputSchema(
  endpoint: ReturnType<typeof summarizeEndpointsForGeneration>[number],
  spec: OpenApiSpec,
  options: GenerateMcpOptions = {}
) {
  const preset = options.clientPreset ?? "default";
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const usedPropertyNames = new Set<string>();

  for (const param of endpoint.parameters) {
    if (!param || typeof param !== "object") continue;
    const p = param as Record<string, unknown>;
    const name = typeof p.name === "string" ? p.name : "";
    if (!name) continue;
    const location = parameterLocation(p);
    if((location==="header"||location==="query")&&SYSTEM_PARAMETER.test(name))continue;
    const argumentName = uniquePropertyName(name, usedPropertyNames, location);
    properties[argumentName] = enrichParameterSchema(jsonSchemaForParameter(p, name, spec, preset), p, argumentName, name);
    if (p.required === true) required.push(argumentName);
  }

  const requestBodySchema = pruneRequestSchema(extractJsonRequestBodySchema(endpoint.requestBody));
  if (requestBodySchema) {
    const normalizedBody = compactRequestBodySchema(
      normalizeSchemaForClient(requestBodySchema, spec, preset, false),
      preset
    );
    const requestBody = endpoint.requestBody && typeof endpoint.requestBody === "object"
      ? endpoint.requestBody as Record<string, unknown>
      : {};
    const bodyRecord = normalizedBody && typeof normalizedBody === "object" && !Array.isArray(normalizedBody)
      ? normalizedBody as Record<string, unknown>
      : {};
    const bodyProperties = bodyRecord.properties && typeof bodyRecord.properties === "object"
      ? bodyRecord.properties as Record<string, unknown>
      : null;
    const bodyRequired = Array.isArray(bodyRecord.required)
      ? bodyRecord.required.filter((item): item is string => typeof item === "string")
      : [];
    const shouldFlattenBody = bodyRecord.type === "object" && bodyProperties && countSchemaProperties(bodyRecord) <= 16 && !bodyRecord["x-astrail-body-mode"];

    if (shouldFlattenBody) {
      for (const [bodyName, bodySchema] of Object.entries(bodyProperties)) {
        const argumentName = uniquePropertyName(bodyName, usedPropertyNames, "body");
        properties[argumentName] = {
          ...(bodySchema && typeof bodySchema === "object" && !Array.isArray(bodySchema) ? bodySchema as Record<string, unknown> : { type: "string" }),
          "x-astrail-in": "body",
          "x-astrail-name": bodyName,
          "x-astrail-argument-name": argumentName,
        };
        if (requestBody.required === true && bodyRequired.includes(bodyName)) required.push(argumentName);
      }
    } else {
      const bodyName = uniquePropertyName("body", usedPropertyNames, "body");
      properties[bodyName] = {
        ...(bodyRecord.type ? bodyRecord : { type: "object", additionalProperties: true, description: "JSON request body." }),
        "x-astrail-in": "body",
        "x-astrail-name": "body",
        "x-astrail-argument-name": bodyName,
      };
      if (requestBody.required === true) required.push(bodyName);
    }
  }

  const inputSchema = {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
  return normalizeSchemaForClient(inputSchema, spec, preset, true) as Record<string, unknown>;
}

export function buildEndpointInputSchema(endpoint: OpenApiEndpoint, spec: OpenApiSpec, options: GenerateMcpOptions = {}) {
  return buildInputSchema({
    method: endpoint.method,
    path: endpoint.path,
    operationId: endpoint.operation_id ?? undefined,
    summary: endpoint.summary ?? undefined,
    description: endpoint.description ?? undefined,
    tags: endpoint.tags ?? [],
    parameters: endpoint.parameters ?? [],
    requestBody: endpoint.request_body ?? undefined,
    responses: endpoint.responses ?? undefined,
    security: endpoint.security_requirements ?? endpoint.security ?? undefined,
  }, spec, options);
}

function countSchemaProperties(schema: unknown, seen = new WeakSet<object>()): number {
  if (!schema || typeof schema !== "object") return 0;
  if (seen.has(schema)) return 0;
  seen.add(schema);

  const record = schema as Record<string, unknown>;
  const properties: unknown[] = record.properties && typeof record.properties === "object"
    ? Object.values(record.properties as Record<string, unknown>)
    : [];
  const direct = properties.length;
  let nested = 0;
  for (const value of properties) {
    nested += countSchemaProperties(value, seen);
  }
  const items = record.items ? countSchemaProperties(record.items, seen) : 0;
  return direct + nested + items;
}

function compactRequestBodySchema(schema: unknown, preset: McpClientPreset) {
  if (!schema || typeof schema !== "object") return schema;
  const record = schema as Record<string, unknown>;
  const propertyCount = countSchemaProperties(schema);
  if (propertyCount <= 10) return record;

  return {
    type: "object",
    additionalProperties: true,
    description: `Complex request body compressed into one object for agent usability. Original schema contains ${propertyCount} nested properties; pass the documented JSON payload as body. Client preset: ${preset}.`,
    "x-astrail-body-mode": "compact_object",
    "x-astrail-original-property-count": propertyCount,
  };
}

function jsonSchemaForParameter(parameter: Record<string, unknown>, name: string, spec: OpenApiSpec, preset: McpClientPreset) {
  const normalized = normalizeSchemaForClient(parameter.schema ?? { type: "string" }, spec, preset, false);
  const schema = normalized && typeof normalized === "object" && !Array.isArray(normalized)
    ? { ...(normalized as Record<string, unknown>) }
    : {};
  const description = typeof parameter.description === "string" ? parameter.description : `${name} parameter`;

  if (schema.$ref) {
    return {
      $ref: schema.$ref,
      ...(schema.$defs ? { $defs: schema.$defs } : {}),
      description,
    };
  }

  return {
    type: schema.type ?? "string",
    ...(schema.format ? { format: schema.format } : {}),
    ...(schema.enum ? { enum: schema.enum } : {}),
    ...(schema.items ? { items: schema.items } : {}),
    ...(schema.$ref ? { $ref: schema.$ref } : {}),
    ...(schema.$defs ? { $defs: schema.$defs } : {}),
    ...(schema.properties ? { properties: schema.properties } : {}),
    ...(schema.anyOf ? { anyOf: schema.anyOf } : {}),
    ...(schema.oneOf ? { oneOf: schema.oneOf } : {}),
    ...(schema.default !== undefined ? { default: schema.default } : {}),
    ...(schema.example !== undefined ? { example: schema.example } : {}),
    description,
  };
}

function zodFieldsFromSchema(schema: Record<string, unknown>) {
  const properties = schema.properties && typeof schema.properties === "object"
    ? (schema.properties as Record<string, unknown>)
    : {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  return Object.keys(properties)
    .map((name) => {
      const optional = required.includes(name) ? "" : ".optional()";
      return `    ${JSON.stringify(name)}: ${zodExpressionForJsonSchema(properties[name])}${optional},`;
    })
    .join("\n");
}

function zodExpressionForJsonSchema(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "z.unknown()";
  const record = schema as Record<string, unknown>;
  const description = typeof record.description === "string" ? `.describe(${JSON.stringify(record.description)})` : "";
  if (Array.isArray(record.enum) && record.enum.every((item) => typeof item === "string") && record.enum.length > 0) {
    const values = record.enum.map((item) => JSON.stringify(item)).join(", ");
    return `z.enum([${values}])${description}`;
  }

  switch (record.type) {
    case "integer":
      return `z.number().int()${description}`;
    case "number":
      return `z.number()${description}`;
    case "boolean":
      return `z.boolean()${description}`;
    case "array":
      return `z.array(z.unknown())${description}`;
    case "object":
      return `z.record(z.string(), z.unknown())${description}`;
    default:
      return `z.string()${description}`;
  }
}

function generateFallbackCode(input: {
  name: string;
  description: string;
  tools: McpTool[];
  baseUrl: string;
}) {
  const toolBlocks = input.tools.map((tool) => {
    const fields = zodFieldsFromSchema(tool.input_schema ?? {});
    return `server.tool(
  ${JSON.stringify(tool.name)},
  ${JSON.stringify(tool.description)},
  z.object({
${fields}
  }),
  async (args) => {
    try {
      const path = ${JSON.stringify(tool.path ?? "/")}.replace(/\\{([^}]+)\\}/g, (_match, key) => encodeURIComponent(String(args[key] ?? "")));
      const response = await fetch(baseUrl + path, {
        method: ${JSON.stringify(tool.method ?? "GET")},
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: \`Bearer \${apiKey}\` } : {}),
        },
      });
      const text = await response.text();
      if (!response.ok) {
        return { isError: true, content: [{ type: "text", text: \`HTTP \${response.status}: \${text}\` }] };
      }
      return { content: [{ type: "text", text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown tool error";
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  }
);`;
  }).join("\n\n");

  return `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const baseUrl = process.env.API_BASE_URL ?? ${JSON.stringify(input.baseUrl)};
const apiKey = process.env.API_KEY ?? "";

const server = new McpServer({
  name: ${JSON.stringify(snakeCase(input.name))},
  version: "1.0.0",
});

${toolBlocks}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;
}

function methodRisk(method: string) {
  const normalized = method.toUpperCase();
  if (normalized === "GET" || normalized === "HEAD" || normalized === "OPTIONS") return "read";
  if (normalized === "DELETE") return "destructive";
  return "write";
}

function endpointResource(path: string, tags?: string[]) {
  if (tags && tags.length > 0) return tags[0];
  return path
    .split("/")
    .map((segment) => segment.trim())
    .find((segment) => segment && !segment.startsWith("{"))
    ?.replace(/[-_]+/g, " ") ?? "default";
}

function endpointToolName(prefix: string, endpoint: ReturnType<typeof summarizeEndpointsForGeneration>[number]) {
  const operationName = endpoint.operationId || endpoint.summary || `${endpoint.method}_${endpoint.path}`;
  return `${prefix}_${snakeCase(operationName)}`;
}

function uniqueToolNames(tools: McpTool[], preset: McpClientPreset) {
  const limit = CLIENT_CAPABILITIES[preset].toolNameLimit;
  const seen = new Set<string>();

  return tools.map((tool) => {
    const base = snakeCase(tool.name).slice(0, limit) || "tool";
    let next = base;
    let index = 2;
    while (seen.has(next)) {
      const suffix = `_${index}`;
      next = `${base.slice(0, Math.max(1, limit - suffix.length))}${suffix}`;
      index += 1;
    }
    seen.add(next);
    return { ...tool, name: next };
  });
}

function dynamicTools(preset: McpClientPreset): McpTool[] {
  return uniqueToolNames([
    {
      name: "list_api_endpoints",
      description: "Search the API endpoint catalog by text, resource, tag, operation kind, method, or path. Use this first when the API has many endpoints or you do not know the exact tool to call.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional search text matched against path, method, operation ID, summary, description, tags, and resource." },
          resource: { type: "string", description: "Optional resource/group name such as users, invoices, payments, or accounts." },
          tag: { type: "string", description: "Optional OpenAPI tag to filter by." },
          operation: { type: "string", enum: ["read", "write", "destructive"], description: "Optional operation class." },
          method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], description: "Optional HTTP method." },
          limit: { type: "integer", description: "Maximum number of endpoints to return. Defaults to 20." },
        },
      },
      method: "ASTRAIL_META",
      path: "list_api_endpoints",
      x_astrail: {
        risk: "read",
        requires_auth: false,
        auth_schemes: [],
        required_scopes: [],
        prerequisites: [],
        agent_instructions: [
          "Call this before invoking unknown endpoints.",
          "Use the returned endpoint_id with get_api_endpoint_schema or invoke_api_endpoint.",
        ],
        example_arguments: { query: "customers", operation: "read", limit: 10 },
      },
    },
    {
      name: "get_api_endpoint_schema",
      description: "Return the exact input schema, auth requirements, safety hints, and response hints for one endpoint from the catalog.",
      input_schema: {
        type: "object",
        properties: {
          endpoint_id: { type: "string", description: "Endpoint ID returned by list_api_endpoints. Tool name, operationId, or METHOD path also work." },
        },
        required: ["endpoint_id"],
      },
      method: "ASTRAIL_META",
      path: "get_api_endpoint_schema",
      x_astrail: {
        risk: "read",
        requires_auth: false,
        auth_schemes: [],
        required_scopes: [],
        prerequisites: ["Use list_api_endpoints when you do not already know the endpoint_id."],
        agent_instructions: ["Inspect this before invoke_api_endpoint so arguments match the exact schema."],
        example_arguments: { endpoint_id: "get_user" },
      },
    },
    {
      name: "invoke_api_endpoint",
      description: "Invoke one endpoint from the API catalog with validated arguments. Use only after list_api_endpoints and get_api_endpoint_schema have identified the correct route.",
      input_schema: {
        type: "object",
        properties: {
          endpoint_id: { type: "string", description: "Endpoint ID returned by list_api_endpoints. Tool name, operationId, or METHOD path also work." },
          arguments: { type: "object", additionalProperties: true, description: "Arguments matching get_api_endpoint_schema for the endpoint." },
        },
        required: ["endpoint_id", "arguments"],
      },
      method: "ASTRAIL_META",
      path: "invoke_api_endpoint",
      x_astrail: {
        risk: "write",
        requires_auth: false,
        auth_schemes: [],
        required_scopes: [],
        prerequisites: ["Call get_api_endpoint_schema first.", "Ask for user confirmation before write or destructive operations."],
        agent_instructions: [
          "Never guess endpoint_id values.",
          "For destructive endpoints, confirm intent with the user first.",
        ],
        example_arguments: { endpoint_id: "get_user", arguments: { id: "example_id" } },
      },
    },
  ], preset);
}

function codeModeTools(preset: McpClientPreset): McpTool[] {
  return uniqueToolNames([
    {
      name: "search_docs",
      description: "Search the API and SDK-style documentation for relevant resources, methods, parameters, examples, auth requirements, and response hints. Use this before writing code.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text such as a resource, task, endpoint, SDK method, or field name." },
          resource: { type: "string", description: "Optional SDK resource, for example customers, incidents, invoices, or users." },
          operation: { type: "string", enum: ["read", "write", "destructive"], description: "Optional operation class." },
          detail: { type: "string", enum: ["compact", "schema", "examples", "auth"], description: "Use compact for low-token search results, schema for exact argument fields, examples for call shapes, and auth for credentials/security details." },
          limit: { type: "integer", description: "Maximum number of documentation results. Defaults to 8." },
        },
      },
      method: "ASTRAIL_CODE",
      path: "search_docs",
      x_astrail: {
        risk: "read",
        requires_auth: false,
        auth_schemes: [],
        required_scopes: [],
        prerequisites: [],
        agent_instructions: [
          "Call search_docs before execute unless the exact SDK method and arguments are already known.",
          "Use the returned client.resource.method examples as the only supported execute surface.",
          "For list-like read methods, agents may use returned for-await examples; Astrail compiles the SDK call inside the loop without evaluating arbitrary JavaScript.",
        ],
        example_arguments: { query: "list active incidents", operation: "read", limit: 5 },
      },
    },
    {
      name: "execute",
      description: "Run a TypeScript snippet made of SDK-style calls like await client.customers.list({ limit: 10 }) or for await (const item of client.customers.list({})). Astrail statically analyzes the code and compiles allowed client calls to deterministic endpoint-map execution; arbitrary JavaScript is not evaluated.",
      input_schema: {
        type: "object",
        properties: {
          code: {
            type: "string",
            description: "TypeScript code containing one or more awaited client.resource.method({...}) calls. Arguments must be JSON-compatible object literals.",
          },
          result_mode: {
            type: "string",
            enum: ["compact", "full"],
            description: "compact returns status, IDs/counts, and previews. full returns the upstream response body.",
          },
        },
        required: ["code"],
      },
      method: "ASTRAIL_CODE",
      path: "execute",
      x_astrail: {
        risk: "write",
        requires_auth: false,
        auth_schemes: [],
        required_scopes: [],
        prerequisites: [
          "Search docs first for the target SDK method.",
          "Ask for user confirmation before write or destructive operations.",
        ],
        agent_instructions: [
          "Do not import packages or call arbitrary globals.",
          "Use only client.resource.method(JSON-compatible arguments).",
          "Use for-await loops only around supported client.resource.list(...) calls returned by search_docs.",
          "Batch independent read calls in one execute request; Astrail can run safe reads concurrently.",
          "Astrail returns typecheck-style errors with suggestions when a method or argument shape cannot be compiled.",
        ],
        example_arguments: {
          code: "async function run(client) {\\n  return await client.incidents.list({ status: \"active\" });\\n}",
        },
      },
    },
  ], preset);
}

function describeSchemaContract(inputSchema: Record<string, unknown>) {
  const properties = inputSchema.properties && typeof inputSchema.properties === "object"
    ? inputSchema.properties as Record<string, unknown>
    : {};
  const required = Array.isArray(inputSchema.required)
    ? inputSchema.required.filter((item): item is string => typeof item === "string")
    : [];
  const propertyNames = Object.keys(properties);
  if (propertyNames.length === 0) return "Takes no arguments; pass an empty object.";
  const optionalCount = propertyNames.length - required.length;
  const parts: string[] = [];
  parts.push(required.length > 0
    ? `Required: ${required.slice(0, 8).join(", ")}${required.length > 8 ? ` and ${required.length - 8} more` : ""}.`
    : "All arguments are optional.");
  if (optionalCount > 0 && required.length > 0) {
    parts.push(`${optionalCount} optional argument${optionalCount === 1 ? "" : "s"} — omit anything you do not have a real value for; never pass placeholders or empty strings.`);
  } else {
    parts.push("Omit arguments you do not have a real value for; never pass placeholders or empty strings.");
  }
  const defaulted = propertyNames.filter((name) => {
    const schema = properties[name];
    return Boolean(schema && typeof schema === "object" && "default" in (schema as Record<string, unknown>));
  });
  if (defaulted.length > 0) {
    parts.push(`Defaults exist for ${defaulted.slice(0, 6).join(", ")}; leave them out unless you need to override.`);
  }
  return parts.join(" ");
}

function writeRiskHint(method: string) {
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD") return null;
  if (upper === "DELETE") return "Destructive: permanently removes data. Confirm with the user and double-check identifiers before calling.";
  return "Writes data upstream. Confirm with the user before calling and never invent identifiers or field values.";
}

export function generateMcpLocally(spec: OpenApiSpec, options: GenerateMcpOptions = {}): GeneratedMcpServer {
  const name = fallbackName(spec);
  const description = fallbackDescription(spec);
  const baseUrl = Array.isArray(spec.servers)
    ? ((spec.servers[0] as { url?: string } | undefined)?.url ?? "")
    : "";
  const prefix = snakeCase(name).replace(/_api$/, "") || "api";
  const preset = options.clientPreset ?? "default";
  const generationMode = options.generationMode ?? "static";
  const endpoints = summarizeEndpointsForGeneration(spec);

  if (generationMode === "dynamic" || generationMode === "code") {
    const tools = generationMode === "code" ? codeModeTools(preset) : dynamicTools(preset);
    return {
      name,
      description: generationMode === "code"
        ? `${description} Exposes Astrail Code Mode: two agent tools for documentation search and no-eval SDK-style execution compiled from the OpenAPI endpoint map.`
        : `${description} Exposes a dynamic endpoint catalog so agents can discover and invoke large APIs without loading every route into context.`,
      tools,
      generated_code: generateFallbackCode({ name, description, tools, baseUrl }),
    };
  }

  const tools = uniqueToolNames(endpoints.map((endpoint) => {
    const resource = endpointResource(endpoint.path, endpoint.tags);
    const risk = methodRisk(endpoint.method);
    const inputSchema = buildInputSchema(endpoint, spec, options);
    return {
      name: endpointToolName(prefix, endpoint),
      description: [
        endpoint.summary || `${endpoint.method} ${endpoint.path}`,
        endpoint.description,
        `Use this ${risk} tool for ${endpoint.method} ${endpoint.path}.`,
        `Resource: ${resource}.`,
        describeSchemaContract(inputSchema),
        writeRiskHint(endpoint.method),
      ].filter(Boolean).join(" "),
      input_schema: inputSchema,
      method: endpoint.method,
      path: endpoint.path,
    };
  }), preset);

  return {
    name,
    description,
    tools,
    generated_code: generateFallbackCode({ name, description, tools, baseUrl }),
  };
}

function compactSpec(spec: OpenApiSpec) {
  return {
    openapi: spec.openapi ?? spec.swagger,
    info: spec.info ?? {},
    servers: Array.isArray(spec.servers) ? spec.servers.slice(0, 3) : [],
    endpoints: summarizeEndpointsForGeneration(spec),
    components: spec.components && typeof spec.components === "object"
      ? { schemas: Object.fromEntries(Object.entries((spec.components as Record<string, unknown>).schemas as Record<string, unknown> ?? {}).slice(0, 20)) }
      : undefined,
  };
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude did not return JSON.");
  return match[0];
}

async function repairGeneratedJson(input: {
  invalidText: string;
  validationError: string;
  compactedSpec: unknown;
}) {
  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: ANTHROPIC_GENERATION_MODEL,
    max_tokens: 8000,
    system:
      "Repair this MCP generation response. Return strict JSON only with exactly these keys: name, description, tools, generated_code. tools must be an array of objects with name, description, input_schema. generated_code must be TypeScript source using @modelcontextprotocol/sdk, Zod, native fetch, and structured error handling.",
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            validation_error: input.validationError,
            invalid_response: input.invalidText,
            openapi_summary: input.compactedSpec,
          },
          null,
          2
        ),
      },
    ],
  });

  const first = response.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Claude returned an empty repair response.");
  }

  return first.text;
}

export async function generateMcpFromSpec(spec: OpenApiSpec, options: GenerateMcpOptions = {}): Promise<GeneratedMcpServer> {
  if (options.generationMode === "dynamic" || options.generationMode === "code") {
    return generateMcpLocally(spec, options);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return generateMcpLocally(spec, options);
  }

  const anthropic = getAnthropicClient();
  const compactedSpec = compactSpec(spec);
  const prompt =
    `You are an expert at converting OpenAPI specs into TypeScript MCP servers. Given this OpenAPI spec, generate a complete MCP server using @modelcontextprotocol/sdk. Create clear snake_case tool names, Zod input schemas, native fetch calls, and structured error handling. Write every tool description as if explaining the tool to a slightly literal coworker: state what the tool does and when to use it, name the required arguments, spell out units and formats (ISO 8601 dates, cents vs dollars, IDs vs names), mention defaults so the agent omits arguments instead of guessing, and say what NOT to pass (no placeholders, no empty strings, no invented identifiers). For write or delete operations, say so explicitly and instruct the agent to confirm with the user first. Descriptions like that prevent the model from picking the wrong endpoint — treat them as the most important output. The generated TypeScript must be readable, runnable after adding credentials, and must not require axios or a framework. Apply client preset "${options.clientPreset ?? "default"}": keep every tool schema rooted at an object, avoid unsupported top-level unions for strict clients, preserve or inline refs as needed, and do not hallucinate endpoints. Return JSON with name, description, tools array, and generated_code only.`;

  const response = await anthropic.messages.create({
    model: ANTHROPIC_GENERATION_MODEL,
    max_tokens: 8000,
    system: prompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify(compactedSpec, null, 2),
      },
    ],
  });

  const first = response.content[0];
  if (!first || first.type !== "text") {
    throw new Error("Claude returned an empty response.");
  }

  try {
    const generated = JSON.parse(extractJson(first.text)) as unknown;
    return validateGeneratedMcp(generated);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return generateMcpLocally(spec, options);
    }

    try {
      const repairedText = await repairGeneratedJson({
        invalidText: first.text,
        validationError: generationValidationError(error),
        compactedSpec,
      });
      const repaired = JSON.parse(extractJson(repairedText)) as unknown;
      return validateGeneratedMcp(repaired);
    } catch {
      return generateMcpLocally(spec, options);
    }
  }
}
