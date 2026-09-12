import { agentFacingToolDescription, assessToolGovernance } from "@/lib/tool-governance";
import { findEndpointForTool } from "@/lib/runtime/execute-tool";
import { visibleEndpointsForRequest, visibleToolsForRequest } from "@/lib/runtime/permissions";
import type { McpServer } from "@/lib/types";
import { resolveMcpEndpoint } from "@/lib/urls";

type WorkerBundleFile = {
  path: string;
  content: string;
};

export type WorkerBundle = {
  serverId: string;
  serverName: string;
  runtime: "cloudflare-worker-template";
  deploymentMode: "manual_export";
  files: WorkerBundleFile[];
};

function workerName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "astrail-mcp";
}

function json(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function dockerServerSource(server: McpServer) {
  const endpoint = server.hosted_endpoint ?? `/api/mcp/${server.id}`;
  return `import http from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT ?? 8787);
const upstreamEndpoint = process.env.ASTRAIL_MCP_ENDPOINT ?? ${JSON.stringify(endpoint)};
const apiKey = process.env.ASTRAIL_API_KEY ?? process.env.ASTRAIL_MCP_API_KEY;
const inboundKey = process.env.ASTRAIL_PROXY_INBOUND_KEY ?? "";
const maxRequestBytes = 64 * 1024;
const maxResponseBytes = 1024 * 1024;
const upstreamTimeoutMs = 30_000;

function safeSecretEqual(provided, expected) {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function authorized(request) {
  if (!inboundKey) return false;
  const header = request.headers.authorization ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(provided) && safeSecretEqual(provided, inboundKey);
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxRequestBytes) {
      request.resume();
      const error = new Error("MCP JSON-RPC payload too large.");
      error.code = "request_too_large";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readUpstreamBody(upstream) {
  const declared = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxResponseBytes) {
    await upstream.body?.cancel();
    const error = new Error("Upstream MCP response too large.");
    error.code = "upstream_too_large";
    throw error;
  }
  if (!upstream.body) return Buffer.alloc(0);
  const reader = upstream.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxResponseBytes) {
      await reader.cancel();
      const error = new Error("Upstream MCP response too large.");
      error.code = "upstream_too_large";
      throw error;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function writeJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true, runtime: "astrail-exported-mcp-docker" });
    return;
  }
  if (!authorized(request)) {
    response.setHeader("www-authenticate", "Bearer");
    writeJson(response, inboundKey ? 401 : 503, {
      error: inboundKey ? "Valid proxy bearer key required." : "ASTRAIL_PROXY_INBOUND_KEY is not configured.",
    });
    return;
  }
  if (request.method === "GET") {
    writeJson(response, 200, {
      name: ${JSON.stringify(server.name)},
      runtime: "astrail-exported-mcp-docker",
      upstream_endpoint: upstreamEndpoint,
      note: "This Docker export forwards MCP JSON-RPC to the reviewed Astrail endpoint.",
    });
    return;
  }
  if (request.method !== "POST") {
    writeJson(response, 405, { error: "Method not allowed." });
    return;
  }
  try {
    const upstream = await fetch(upstreamEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: "Bearer " + apiKey } : {}),
      },
      body: await readBody(request),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
      redirect: "error",
    });
    response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
    response.end(await readUpstreamBody(upstream));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const status = code === "request_too_large" ? 413 : error instanceof Error && error.name === "TimeoutError" ? 504 : 502;
    writeJson(response, status, { error: error instanceof Error ? error.message : "Astrail Docker MCP export failed." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log("Astrail exported MCP Docker server listening on :" + port);
});
`;
}

function dockerfile() {
  return `FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json ./
COPY --chown=node:node src/docker-server.mjs ./src/docker-server.mjs
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/docker-server.mjs"]
`;
}

function dockerPublishWorkflow(name: string) {
  return `name: Publish Exported MCP Docker Image

on:
  workflow_dispatch:
    inputs:
      confirm_publish:
        description: "Type publish to allow the exported MCP Docker image publish job to run"
        required: true
        default: ""
      publish_image:
        description: "Build and publish the exported MCP Docker image"
        required: true
        default: "false"
      image_name:
        description: "Container image name"
        required: true
        default: "ghcr.io/OWNER/${name}"

permissions:
  contents: read
  packages: write

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t ${name}:verify .

  publish:
    needs: verify
    if: \${{ github.event.inputs.publish_image == 'true' && github.event.inputs.confirm_publish == 'publish' }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: \${{ github.event.inputs.image_name }}:latest
`;
}

export function buildWorkerBundle(server: McpServer): WorkerBundle {
  server = { ...server, hosted_endpoint: resolveMcpEndpoint(server.id, server.hosted_endpoint) };
  const name = workerName(server.name);
  const allTools = server.tools_json ?? [];
  const tools = visibleToolsForRequest(server, allTools, findEndpointForTool)
    .map((tool) => ({ ...tool, description: agentFacingToolDescription(tool, server.runtime_policy?.business_context) }));
  const endpointMap = visibleEndpointsForRequest(server);
  const governance = {
    business_context: server.runtime_policy?.business_context ?? null,
    tools: allTools.map((tool) => ({
      name: tool.name,
      enabled: tool.enabled !== false,
      policy: tool.policy ?? null,
      ...assessToolGovernance(tool),
      business_context: tool.x_astrail?.business_context ?? null,
      use_when: tool.x_astrail?.use_when ?? null,
      avoid_when: tool.x_astrail?.avoid_when ?? null,
      edge_case_notes: tool.x_astrail?.edge_case_notes ?? null,
    })),
    execution_policy: server.execution_policy ?? null,
    runtime_policy: server.runtime_policy ?? null,
  };

  const workerSource = `type JsonRpcRequest = {
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
};

const SERVER = ${json({
  id: server.id,
  name: server.name,
  description: server.description,
  protocolVersion: server.protocol_version ?? "2024-11-05",
  businessContext: server.runtime_policy?.business_context ?? null,
  isPublic: server.is_public,
})};

const TOOLS: Array<Record<string, unknown>> = ${json(tools)};
const ENDPOINT_MAP: Array<Record<string, unknown>> = ${json(endpointMap)};
const EXECUTION_POLICY: Record<string, unknown> = ${json(server.execution_policy ?? {})};
const RUNTIME_POLICY: Record<string, unknown> = ${json(server.runtime_policy ?? {})};
const MAX_RPC_BODY_BYTES = 64 * 1024;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_000_000;

type WorkerEnv = {
  ASTRAIL_API_KEY?: string;
  ASTRAIL_ALLOWED_ORIGINS?: string;
  ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION?: string;
};

function traceId() {
  return \`agt_\${Date.now().toString(36)}_\${crypto.randomUUID().slice(0, 8)}\`;
}

function jsonRpc(id: JsonRpcRequest["id"], result: unknown, status = 200) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { status });
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string, status = 400) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status });
}

async function secureTextEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function callerAuthorized(request: Request, env: WorkerEnv) {
  if (SERVER.isPublic) return true;
  return executionCallerAuthorized(request, env);
}

async function executionCallerAuthorized(request: Request, env: WorkerEnv) {
  const expected = typeof env.ASTRAIL_API_KEY === "string" ? env.ASTRAIL_API_KEY : "";
  const authorization = request.headers.get("authorization") ?? "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!expected || !presented) return false;
  return secureTextEqual(presented, expected);
}

function hasSecurityRequirement(endpoint: Record<string, unknown>) {
  if (endpoint.requires_auth === true) return true;
  const security = endpoint.security_requirements ?? endpoint.security;
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

function endpointId(endpoint: Record<string, unknown>) {
  return String(endpoint.tool_name || endpoint.operation_id || \`\${endpoint.method} \${endpoint.path}\`);
}

function catalogEndpoints() {
  return ENDPOINT_MAP.filter((endpoint: Record<string, unknown>) => String(endpoint.method).toUpperCase() !== "ASTRAIL_META");
}

function endpointCatalogItem(endpoint: Record<string, unknown>) {
  return {
    endpoint_id: endpointId(endpoint),
    method: endpoint.method,
    path: endpoint.path,
    operation_id: endpoint.operation_id ?? null,
    summary: endpoint.summary ?? null,
    description: endpoint.description ?? null,
    resource: endpoint.resource ?? null,
    tags: endpoint.tags ?? [],
    operation: endpoint.operation_kind ?? null,
    requires_auth: hasSecurityRequirement(endpoint),
  };
}

function findCatalogEndpoint(id: unknown) {
  if (typeof id !== "string" || !id.trim()) return null;
  const normalized = id.trim().toLowerCase();
  return catalogEndpoints().find((endpoint: Record<string, unknown>) =>
    endpointId(endpoint).toLowerCase() === normalized
    || String(endpoint.tool_name ?? "").toLowerCase() === normalized
    || String(endpoint.operation_id ?? "").toLowerCase() === normalized
    || \`\${endpoint.method} \${endpoint.path}\`.toLowerCase() === normalized
  ) ?? null;
}

function findToolForEndpoint(endpoint: Record<string, unknown>) {
  return TOOLS.find((tool: Record<string, unknown>) => {
    if (typeof endpoint.tool_name === "string" && tool.name === endpoint.tool_name) return true;
    if (typeof endpoint.operation_id === "string" && tool.name === endpoint.operation_id) return true;
    return String(tool.method ?? "").toUpperCase() === String(endpoint.method ?? "").toUpperCase()
      && String(tool.path ?? "") === String(endpoint.path ?? "");
  });
}

function findEndpointForTool(tool: Record<string, unknown>) {
  return ENDPOINT_MAP.find((endpoint: Record<string, unknown>) => {
    if (typeof endpoint.tool_name === "string" && tool.name === endpoint.tool_name) return true;
    if (typeof endpoint.operation_id === "string" && tool.name === endpoint.operation_id) return true;
    return String(tool.method ?? "").toUpperCase() === String(endpoint.method ?? "").toUpperCase()
      && String(tool.path ?? "") === String(endpoint.path ?? "");
  });
}

function listApiEndpoints(args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
  const resource = typeof args.resource === "string" ? args.resource.toLowerCase().trim() : "";
  const tag = typeof args.tag === "string" ? args.tag.toLowerCase().trim() : "";
  const operation = typeof args.operation === "string" ? args.operation.toLowerCase().trim() : "";
  const method = typeof args.method === "string" ? args.method.toUpperCase().trim() : "";
  const limit = Math.max(1, Math.min(Number(args.limit ?? 20) || 20, 50));
  const matches = catalogEndpoints().filter((endpoint: Record<string, unknown>) => {
    const search = [
      endpointId(endpoint),
      endpoint.method,
      endpoint.path,
      endpoint.summary,
      endpoint.description,
      endpoint.resource,
      ...(Array.isArray(endpoint.tags) ? endpoint.tags : []),
    ].filter(Boolean).join(" ").toLowerCase();
    if (query && !search.includes(query)) return false;
    if (resource && String(endpoint.resource ?? "default").toLowerCase() !== resource) return false;
    if (tag && !(Array.isArray(endpoint.tags) ? endpoint.tags : []).some((item) => String(item).toLowerCase() === tag)) return false;
    if (operation && endpoint.operation_kind !== operation) return false;
    if (method && String(endpoint.method).toUpperCase() !== method) return false;
    return true;
  });

  return {
    status: "success",
    total_matches: matches.length,
    returned: Math.min(matches.length, limit),
    endpoints: matches.slice(0, limit).map(endpointCatalogItem),
    next_step: "Call get_api_endpoint_schema with endpoint_id before invoke_api_endpoint.",
  };
}

function getApiEndpointSchema(args: Record<string, unknown>) {
  const endpoint = findCatalogEndpoint(args.endpoint_id);
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
    input_schema: endpoint.input_schema ?? { type: "object", properties: {} },
    parameters: endpoint.parameters ?? [],
    request_body: endpoint.request_body ?? null,
    response_hints: endpoint.response_hints ?? null,
    security: endpoint.security_requirements ?? endpoint.security ?? null,
  };
}

function camelCase(value: string) {
  const parts = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\\s+/).filter(Boolean);
  if (parts.length === 0) return "api";
  return parts.map((part, index) => {
    const lower = part.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
}

function sdkResource(endpoint: Record<string, unknown>) {
  const tags = Array.isArray(endpoint.tags) ? endpoint.tags : [];
  const firstPath = String(endpoint.path ?? "").split("/").find((part) => part && !part.startsWith("{"));
  return camelCase(String(endpoint.resource || tags[0] || firstPath || "api"));
}

function sdkMethod(endpoint: Record<string, unknown>) {
  if (endpoint.operation_id) return camelCase(String(endpoint.operation_id));
  const method = String(endpoint.method ?? "GET").toUpperCase();
  const operation = endpoint.operation_kind;
  const leaf = String(endpoint.path ?? "resource").split("/").filter((part) => part && !part.startsWith("{")).pop() || "resource";
  const verb = operation === "read" ? String(endpoint.path ?? "").includes("{") ? "get" : "list" : operation === "destructive" ? "delete" : method === "POST" ? "create" : "update";
  return camelCase(verb + " " + leaf);
}

function exampleArgumentsFromSchema(schema: unknown) {
  if (!schema || typeof schema !== "object") return {};
  const record = schema as Record<string, unknown>;
  const properties = record.properties && typeof record.properties === "object" ? record.properties as Record<string, unknown> : {};
  const args: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties).slice(0, 5)) {
    const prop = property && typeof property === "object" ? property as Record<string, unknown> : {};
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

function sdkDocForEndpoint(endpoint: Record<string, unknown>) {
  const resource = sdkResource(endpoint);
  const method = sdkMethod(endpoint);
  const exampleArgs = exampleArgumentsFromSchema(endpoint.input_schema);
  return {
    sdk_method: "client." + resource + "." + method,
    endpoint_id: endpointId(endpoint),
    method: endpoint.method,
    path: endpoint.path,
    resource,
    operation: endpoint.operation_kind ?? null,
    summary: endpoint.summary ?? null,
    description: endpoint.description ?? null,
    requires_auth: hasSecurityRequirement(endpoint),
    tags: endpoint.tags ?? [],
    input_schema: endpoint.input_schema ?? { type: "object", properties: {} },
    response_hints: endpoint.response_hints ?? null,
    example: "const result = await client." + resource + "." + method + "(" + JSON.stringify(exampleArgs, null, 2) + ");",
  };
}

function searchDocs(args: Record<string, unknown>) {
  const query = typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
  const resource = typeof args.resource === "string" ? camelCase(args.resource).toLowerCase() : "";
  const operation = typeof args.operation === "string" ? args.operation.toLowerCase().trim() : "";
  const limit = Math.max(1, Math.min(Number(args.limit ?? 8) || 8, 20));
  const matches = catalogEndpoints().filter((endpoint: Record<string, unknown>) => {
    const doc = sdkDocForEndpoint(endpoint);
    const search = [
      doc.sdk_method,
      doc.endpoint_id,
      doc.method,
      doc.path,
      doc.resource,
      doc.operation,
      doc.summary,
      doc.description,
      ...(Array.isArray(doc.tags) ? doc.tags : []),
    ].filter(Boolean).join(" ").toLowerCase();
    if (query && !search.includes(query)) return false;
    if (resource && doc.resource.toLowerCase() !== resource) return false;
    if (operation && doc.operation !== operation) return false;
    return true;
  });

  return {
    status: "success",
    mode: "astrail_code_mode",
    total_matches: matches.length,
    returned: Math.min(matches.length, limit),
    docs: matches.slice(0, limit).map(sdkDocForEndpoint),
    execute_contract: {
      supported_call_shapes: [
        "await client.resource.method({ jsonCompatible: true })",
        "for await (const item of client.resource.list({ jsonCompatible: true })) { ... }",
      ],
      batching: "Hosted Astrail can compile independent read calls in one execute request and run them in parallel.",
      note: "Exported template does not eval arbitrary JavaScript. Wire reviewed execution policy before enabling upstream execute.",
    },
  };
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALLOWED_METHODS = new Set(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"]);
const SAFE_FORWARD_HEADERS = new Set(["accept-language", "content-language", "if-match", "if-none-match", "idempotency-key"]);

function endpointPolicy(endpoint: Record<string, unknown>, tool?: Record<string, unknown>) {
  if (tool?.policy === "allow" || tool?.policy === "approval" || tool?.policy === "block") return tool.policy;
  if (endpoint.policy === "allow" || endpoint.policy === "approval" || endpoint.policy === "block") return endpoint.policy;
  if (endpoint.operation_kind === "read" || READ_METHODS.has(String(endpoint.method).toUpperCase())) return "allow";
  if (endpoint.operation_kind === "destructive" || String(endpoint.method).toUpperCase() === "DELETE") return "block";
  return "approval";
}

function actionLevel(endpoint: Record<string, unknown>, tool?: Record<string, unknown>) {
  const explicit = tool?.x_astrail && typeof tool.x_astrail === "object"
    ? (tool.x_astrail as Record<string, unknown>).action_level ?? (tool.x_astrail as Record<string, unknown>).action_class
    : null;
  if (explicit === "read" || explicit === "draft" || explicit === "write" || explicit === "send" || explicit === "destructive") return explicit;
  if (endpoint.action_class === "read" || endpoint.action_class === "draft" || endpoint.action_class === "write" || endpoint.action_class === "send" || endpoint.action_class === "destructive") return endpoint.action_class;
  if (endpoint.operation_kind === "read" || READ_METHODS.has(String(endpoint.method).toUpperCase())) return "read";
  if (endpoint.operation_kind === "destructive" || String(endpoint.method).toUpperCase() === "DELETE") return "destructive";
  return "write";
}

function runtimePolicyFailure(endpoint: Record<string, unknown>, tool: Record<string, unknown> | undefined, trace_id: string, toolName: string) {
  const unsupported = ["allowed_methods", "blocked_methods", "allowed_resources", "blocked_resources", "roles"]
    .some((field) => {
      const value = RUNTIME_POLICY[field];
      return Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
    });
  if (unsupported) {
    return governanceFailure("permission_denied", "runtime_policy_requires_hosted_identity", "This exported runtime cannot safely evaluate the server's method, resource, or actor-role policy. Use the hosted runtime or add an equivalent authenticated policy adapter.", trace_id, toolName);
  }
  const action = actionLevel(endpoint, tool);
  const allowed = Array.isArray(RUNTIME_POLICY.allowed_actions) ? RUNTIME_POLICY.allowed_actions : [];
  const blocked = Array.isArray(RUNTIME_POLICY.blocked_actions) ? RUNTIME_POLICY.blocked_actions : [];
  if ((RUNTIME_POLICY.allow_http_gets === false && READ_METHODS.has(String(endpoint.method ?? "").toUpperCase())) || (RUNTIME_POLICY.read_only === true && action !== "read") || blocked.includes(action) || (allowed.length > 0 && !allowed.includes(action))) {
    return governanceFailure("permission_denied", "runtime_policy_denied", "The exported runtime policy denied this action before upstream execution.", trace_id, toolName);
  }
  return null;
}

function governanceFailure(status: string, error_code: string, note: string, trace_id: string, tool: string) {
  return { content: [{ type: "text", text: JSON.stringify({ status, error_code, note, trace_id, tool }, null, 2) }], isError: true };
}

function blockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  const host = normalized.startsWith("[") && normalized.endsWith("]") ? normalized.slice(1, -1) : normalized;
  if (host === "localhost" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "169.254.169.254" || host === "metadata.google.internal") return true;
  const ipv4Parts = host.split(".");
  const isIpv4 = ipv4Parts.length === 4 && ipv4Parts.every((part) => part.length > 0 && Array.from(part).every((character) => character >= "0" && character <= "9"));
  if (isIpv4) {
    const octets = ipv4Parts.map(Number);
    if (octets.some((value) => value > 255)) return true;
    if (octets[0] === 10 || octets[0] === 127 || octets[0] === 0) return true;
    if (octets[0] === 169 && octets[1] === 254) return true;
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    if (octets[0] === 192 && octets[1] === 168) return true;
  }
  if (!host.includes(":")) return false;
  return host === "::" || host.startsWith("::ffff:") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function parameterRecords(endpoint: Record<string, unknown>) {
  const values = [endpoint.parameters, endpoint.path_params, endpoint.query_params]
    .flatMap((value) => Array.isArray(value) ? value : [])
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
  const seen = new Set<string>();
  return values.filter((parameter) => {
    const key = String(parameter.in ?? "query") + ":" + String(parameter.name ?? "");
    if (!parameter.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toolInputProperties(tool?: Record<string, unknown>) {
  const schema = tool?.input_schema;
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return {} as Record<string, unknown>;
  const properties = (schema as Record<string, unknown>).properties;
  return properties && typeof properties === "object" && !Array.isArray(properties) ? properties as Record<string, unknown> : {};
}

function argumentNameForParameter(tool: Record<string, unknown> | undefined, parameter: Record<string, unknown>) {
  const sourceName = String(parameter.name ?? "");
  const location = String(parameter.in ?? "query");
  for (const [argumentName, schema] of Object.entries(toolInputProperties(tool))) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) continue;
    const record = schema as Record<string, unknown>;
    if (record["x-astrail-name"] === sourceName && record["x-astrail-in"] === location) return argumentName;
  }
  return sourceName;
}

function argumentValue(args: Record<string, unknown>, tool: Record<string, unknown> | undefined, argumentName: string) {
  const value = args[argumentName];
  const schema = toolInputProperties(tool)[argumentName];
  if (typeof value !== "string" || !schema || typeof schema !== "object" || Array.isArray(schema)) return value;
  const type = String((schema as Record<string, unknown>).type ?? "");
  if (type !== "object" && type !== "array") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function requestBody(args: Record<string, unknown>, tool: Record<string, unknown> | undefined, consumed: Set<string>) {
  const bodyEntries = Object.entries(toolInputProperties(tool)).filter(([, schema]) => {
    return Boolean(schema) && typeof schema === "object" && !Array.isArray(schema) && (schema as Record<string, unknown>)["x-astrail-in"] === "body";
  });
  if (bodyEntries.length === 1) {
    const [argumentName, schema] = bodyEntries[0];
    const record = schema as Record<string, unknown>;
    if (record["x-astrail-name"] === "body") {
      consumed.add(argumentName);
      return argumentValue(args, tool, argumentName);
    }
  }
  if (bodyEntries.length > 0) {
    const body: Record<string, unknown> = {};
    for (const [argumentName, schema] of bodyEntries) {
      consumed.add(argumentName);
      const value = argumentValue(args, tool, argumentName);
      if (value === undefined) continue;
      const sourceName = (schema as Record<string, unknown>)["x-astrail-name"];
      body[typeof sourceName === "string" && sourceName ? sourceName : argumentName] = value;
    }
    return body;
  }
  if (args.body !== undefined) return args.body;
  return Object.fromEntries(Object.entries(args).filter(([key]) => !consumed.has(key) && key !== "endpoint_id" && key !== "idempotency_key"));
}

function buildPublicRestRequest(endpoint: Record<string, unknown>, tool: Record<string, unknown> | undefined, args: Record<string, unknown>, env: WorkerEnv) {
  const method = String(endpoint.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return { error: "unsupported_http_method" } as const;
  if (hasSecurityRequirement(endpoint)) return { error: "auth_required" } as const;
  if (typeof endpoint.base_url !== "string" || !endpoint.base_url) return { error: "missing_base_url" } as const;
  let base: URL;
  try { base = new URL(endpoint.base_url); } catch { return { error: "invalid_base_url" } as const; }
  if (base.protocol !== "https:" || blockedHostname(base.hostname)) return { error: "upstream_url_blocked" } as const;
  const allowedOrigins = typeof env.ASTRAIL_ALLOWED_ORIGINS === "string"
    ? env.ASTRAIL_ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 50)
    : [];
  if (env.ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION !== "true" || !allowedOrigins.includes(base.origin)) return { error: "upstream_origin_not_allowed" } as const;

  const requestTool = tool ?? { input_schema: endpoint.input_schema };
  const inputSchema = requestTool.input_schema;
  const requiredArguments = inputSchema && typeof inputSchema === "object" && !Array.isArray(inputSchema) && Array.isArray((inputSchema as Record<string, unknown>).required)
    ? ((inputSchema as Record<string, unknown>).required as unknown[]).filter((value): value is string => typeof value === "string")
    : [];
  const missingRequired = requiredArguments.find((name) => args[name] === undefined || args[name] === null);
  if (missingRequired) return { error: "missing_required_argument", argument: missingRequired } as const;

  let path = String(endpoint.path ?? "/");
  const headers = new Headers({ accept: "application/json" });
  const consumed = new Set<string>();
  const query = new URLSearchParams();
  for (const parameter of parameterRecords(endpoint)) {
    const name = String(parameter.name);
    const location = String(parameter.in ?? "query");
    const argumentName = argumentNameForParameter(requestTool, parameter);
    const value = argumentValue(args, requestTool, argumentName);
    if (value === undefined || value === null) {
      if (parameter.required === true) return { error: "missing_required_argument", argument: argumentName } as const;
      continue;
    }
    consumed.add(argumentName);
    if (location === "path") {
      const rawPathValue = String(value);
      if (rawPathValue === "." || rawPathValue === "..") return { error: "path_normalization_blocked", argument: name } as const;
      path = path.replace("{" + name + "}", encodeURIComponent(rawPathValue));
    }
    else if (location === "query") {
      if (Array.isArray(value)) value.forEach((item) => query.append(name, String(item)));
      else query.set(name, String(value));
    } else if (location === "header" && SAFE_FORWARD_HEADERS.has(name.toLowerCase())) headers.set(name, String(value));
  }
  if (path.includes("{") || path.includes("}")) return { error: "missing_required_path_argument" } as const;

  const basePath = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
  const expectedPath = basePath + "/" + (path.startsWith("/") ? path.slice(1) : path);
  base.pathname = expectedPath;
  if (base.pathname !== expectedPath) return { error: "path_normalization_blocked" } as const;
  base.search = query.toString();
  const request: RequestInit = { method, headers, redirect: "manual" };
  if (!READ_METHODS.has(method)) {
    headers.set("content-type", "application/json");
    request.body = JSON.stringify(requestBody(args, requestTool, consumed));
  }
  return { url: base, request } as const;
}

async function executePublicRestEndpoint(endpoint: Record<string, unknown>, tool: Record<string, unknown> | undefined, args: Record<string, unknown>, trace_id: string, toolName: string, env: WorkerEnv) {
  const built = buildPublicRestRequest(endpoint, tool, args, env);
  if ("error" in built) {
    const buildError = typeof built.error === "string" ? built.error : "mapping_invalid";
    const status = buildError === "auth_required" ? "auth_required" : "mapping_required";
    return governanceFailure(status, buildError, "The exported runtime blocked this request before upstream execution.", trace_id, toolName);
  }

  const method = String(endpoint.method ?? "GET").toUpperCase();
  const attempts = READ_METHODS.has(method) ? Math.max(1, Math.min(Number(EXECUTION_POLICY.max_attempts ?? 2), 4)) : 1;
  const timeout = Math.max(1000, Math.min(Number(EXECUTION_POLICY.timeout_ms ?? 15000), 30000));
  const retryStatuses = new Set(Array.isArray(EXECUTION_POLICY.retry_statuses) ? EXECUTION_POLICY.retry_statuses.map(Number) : [408, 425, 429, 500, 502, 503, 504]);
  let lastError = "upstream_request_failed";

  const waitBeforeRetry = async (attempt: number, response?: Response) => {
    const retryAfter = response?.headers.get("retry-after") ?? "";
    const retrySeconds = Number(retryAfter);
    const retryAt = Date.parse(retryAfter);
    const providerDelay = Number.isFinite(retrySeconds) && retrySeconds >= 0
      ? retrySeconds * 1000
      : Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : NaN;
    const baseDelay = Math.max(0, Math.min(Number(EXECUTION_POLICY.base_delay_ms ?? 250), 2000));
    const exponentialDelay = Math.min(2000, baseDelay * (2 ** Math.max(0, attempt - 1)));
    const delay = Math.max(0, Math.min(Number.isFinite(providerDelay) ? providerDelay : exponentialDelay, 2000));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(built.url, { ...built.request, signal: AbortSignal.timeout(timeout) });
      if (response.status >= 300 && response.status < 400) return governanceFailure("error", "upstream_redirect_blocked", "Redirects are blocked in the exported runtime.", trace_id, toolName);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_UPSTREAM_RESPONSE_BYTES) return governanceFailure("error", "upstream_response_too_large", "The provider response exceeded 1 MB.", trace_id, toolName);
      if (retryStatuses.has(response.status) && attempt < attempts) {
        await response.body?.cancel();
        await waitBeforeRetry(attempt, response);
        continue;
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          received += next.value.byteLength;
          if (received > MAX_UPSTREAM_RESPONSE_BYTES) {
            await reader.cancel();
            return governanceFailure("error", "upstream_response_too_large", "The provider response exceeded 1 MB.", trace_id, toolName);
          }
          chunks.push(next.value);
        }
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const raw = new TextDecoder().decode(bytes);
      let data: unknown = raw;
      try { data = raw ? JSON.parse(raw) : null; } catch { /* keep bounded text */ }
      const payload = {
        status: response.ok ? "success" : "error",
        tool: toolName,
        trace_id,
        upstream_status: response.status,
        attempt_count: attempt,
        data,
      };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], ...(response.ok ? {} : { isError: true }) };
    } catch (error) {
      lastError = error instanceof Error && error.name === "TimeoutError" ? "upstream_timeout" : "upstream_network_error";
      if (attempt < attempts) {
        await waitBeforeRetry(attempt);
        continue;
      }
    }
  }
  return governanceFailure("error", lastError, "The upstream request failed after bounded attempts.", trace_id, toolName);
}

async function executeTool(name: string, args: Record<string, unknown>, env: WorkerEnv) {
  const trace_id = traceId();
  if (name === "search_docs") {
    return { content: [{ type: "text", text: JSON.stringify({ ...searchDocs(args), trace_id }, null, 2) }] };
  }
  if (name === "execute") {
    return { content: [{ type: "text", text: JSON.stringify({
      status: "mapping_required",
      mode: "astrail_code_mode",
      trace_id,
      error_code: "worker_code_execution_review_required",
      note: "Code Mode docs are exported. Enable execute only after reviewing credentials, sandbox policy, and deterministic endpoint execution in this Worker."
    }, null, 2) }] };
  }
  if (name === "list_api_endpoints") {
    return { content: [{ type: "text", text: JSON.stringify({ ...listApiEndpoints(args), trace_id }, null, 2) }] };
  }
  if (name === "get_api_endpoint_schema") {
    return { content: [{ type: "text", text: JSON.stringify({ ...getApiEndpointSchema(args), trace_id }, null, 2) }] };
  }
  if (name === "invoke_api_endpoint") {
    const endpoint = findCatalogEndpoint(args.endpoint_id);
    if (!endpoint) {
      return { content: [{ type: "text", text: JSON.stringify({
        status: "mapping_required",
        trace_id,
        error_code: "endpoint_not_found",
        endpoint_id: args.endpoint_id ?? null,
        note: "Use list_api_endpoints to find a valid endpoint_id."
      }, null, 2) }] };
    }
    const endpointTool = findToolForEndpoint(endpoint);
    const policyFailure = runtimePolicyFailure(endpoint, endpointTool, trace_id, name);
    if (policyFailure) return policyFailure;
    const policy = endpointPolicy(endpoint, endpointTool);
    if (policy === "block") return governanceFailure("permission_denied", "tool_blocked", "This endpoint is blocked by the exported governance policy.", trace_id, name);
    if (policy === "approval") return governanceFailure("approval_required", "human_approval_required", "This endpoint needs an external approval system before execution.", trace_id, name);
    const forwarded = args.arguments && typeof args.arguments === "object" && !Array.isArray(args.arguments) ? args.arguments as Record<string, unknown> : args;
    return executePublicRestEndpoint(endpoint, endpointTool, forwarded, trace_id, name, env);
  }
  const tool = TOOLS.find((item: Record<string, unknown>) => item.name === name);
  const endpoint = tool ? findEndpointForTool(tool) : undefined;
  if (!endpoint) {
    return { content: [{ type: "text", text: JSON.stringify({ status: "mapping_required", tool: name, trace_id, error_code: "mapping_missing_endpoint" }, null, 2) }] };
  }
  const policyFailure = runtimePolicyFailure(endpoint, tool, trace_id, name);
  if (policyFailure) return policyFailure;
  const policy = endpointPolicy(endpoint, tool);
  if (policy === "block") return governanceFailure("permission_denied", "tool_blocked", "This tool is blocked by the exported governance policy.", trace_id, name);
  if (policy === "approval") return governanceFailure("approval_required", "human_approval_required", "This tool needs an external approval system before execution.", trace_id, name);
  return executePublicRestEndpoint(endpoint, tool, args, trace_id, name, env);
}

async function readBoundedRequestBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RPC_BODY_BYTES) return { error: "payload_too_large" } as const;
  const reader = request.body?.getReader();
  if (!reader) return { text: "" } as const;
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    received += next.value.byteLength;
    if (received > MAX_RPC_BODY_BYTES) {
      await reader.cancel();
      return { error: "payload_too_large" } as const;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { text: new TextDecoder().decode(bytes) } as const;
}

export default {
  async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
    if (!await callerAuthorized(request, env)) return Response.json({ error: "A valid Astrail bearer key is required for this private export." }, { status: 401 });
    if (request.method === "GET") {
      return Response.json({
        name: SERVER.name,
        description: SERVER.description,
        tools: TOOLS,
        business_context: SERVER.businessContext,
        runtime: "cloudflare-worker-template"
      });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let body: JsonRpcRequest;
    try {
      const boundedBody = await readBoundedRequestBody(request);
      if ("error" in boundedBody) return jsonRpcError(null, -32600, "JSON-RPC payload too large.", 413);
      body = JSON.parse(boundedBody.text) as JsonRpcRequest;
    } catch {
      return jsonRpcError(null, -32700, "Invalid JSON-RPC payload.", 400);
    }

    if (body.method === "initialize") {
      return jsonRpc(body.id, {
        protocolVersion: SERVER.protocolVersion,
        serverInfo: { name: SERVER.name, version: "1.0.0" },
        capabilities: { tools: {} },
      });
    }

    if (body.method === "tools/list") {
      return jsonRpc(body.id, {
        tools: TOOLS.map((tool: Record<string, unknown>) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema ?? { type: "object", properties: {} },
        })),
      });
    }

    if (body.method === "tools/call") {
      const toolName = body.params?.name;
      if (!toolName || !TOOLS.some((tool: Record<string, unknown>) => tool.name === toolName)) {
        return jsonRpcError(body.id, -32602, "Unknown tool.", 400);
      }
      const mayExecuteUpstream = !["search_docs", "list_api_endpoints", "get_api_endpoint_schema", "execute"].includes(toolName);
      if (SERVER.isPublic && mayExecuteUpstream && env.ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION === "true" && !await executionCallerAuthorized(request, env)) {
        return jsonRpcError(body.id, -32001, "A valid Astrail bearer key is required for upstream execution.", 401);
      }
      return jsonRpc(body.id, await executeTool(toolName, body.params?.arguments ?? {}, env));
    }

    return jsonRpcError(body.id, -32601, "Method not found.", 404);
  },
};
`;

  const wrangler = `name = "${name}"
main = "src/worker.ts"
compatibility_date = "2026-05-24"
compatibility_flags = ["global_fetch_strictly_public"]

[vars]
ASTRAIL_RUNTIME = "cloudflare-worker-template"
ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION = "false"

[observability]
enabled = true
`;

  const packageJson = json({
    name,
    version: "0.1.0",
    type: "module",
    private: true,
    scripts: {
      dev: "wrangler dev",
      deploy: "wrangler deploy",
      "docker:start": "node src/docker-server.mjs",
    },
    devDependencies: {
      wrangler: "^4.0.0",
      typescript: "^5.0.0",
    },
  });

  const envExample = `# Required bearer key for private deployments and all public upstream execution.
# Do not commit real secrets.
ASTRAIL_API_KEY=

# Required, separate bearer key for callers of the Docker proxy.
ASTRAIL_PROXY_INBOUND_KEY=

# Absolute hosted Astrail MCP endpoint used by the Docker proxy.
ASTRAIL_MCP_ENDPOINT=https://astrail.dev/api/mcp/${server.id}

# Standalone REST execution is opt-in and restricted to reviewed exact origins.
ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION=false
ASTRAIL_ALLOWED_ORIGINS=https://api.example.com
`;

  const readme = `# ${server.name} Cloudflare Worker Export

This is a manual export for the Astrail hosted MCP runtime.

## What this includes

- MCP JSON-RPC surface: \`initialize\`, \`tools/list\`, \`tools/call\`
- Curated tool metadata and business context
- Stored endpoint map
- Deterministic execution for exposed, allow-listed public REST tools
- Bounded timeouts, response sizes, retries for safe reads, redirect blocking, private-network hostname checks, and Cloudflare strict-public fetch routing
- \`astrail-governance.json\` with exposure, approval, risk, context, and runtime policies

## What this does not do yet

- It does not eval generated TypeScript.
- It does not execute arbitrary generated code.
- It does not automatically deploy to Cloudflare.
- It does not inject provider credentials.
- It does not provide durable human-approval storage. Approval-gated tools return \`approval_required\`.
- It does not independently execute authenticated tools. Use the Docker proxy or add a reviewed credential adapter.
- It does not bypass Astrail's no-eval rule.
- It should run as an isolated runtime boundary once reviewed and deployed.

Private exports require an \`ASTRAIL_API_KEY\` Worker secret and reject unauthenticated metadata and MCP calls. Public exports may expose metadata anonymously, but every call that can reach an upstream API still requires the bearer key. Standalone REST execution is off by default. To enable it, set \`ASTRAIL_API_KEY\`, \`ASTRAIL_ALLOW_PUBLIC_REST_EXECUTION=true\`, and \`ASTRAIL_ALLOWED_ORIGINS\` to a comma-separated list of exact reviewed HTTPS origins. The generated Wrangler config enables Cloudflare's \`global_fetch_strictly_public\` compatibility flag; do not remove it or add VPC bindings without a new network-security review.

## Deploy manually

\`\`\`bash
npm create cloudflare@latest ${name}
cp src/worker.ts ${name}/src/worker.ts
cp wrangler.toml ${name}/wrangler.toml
cd ${name}
npx wrangler deploy
\`\`\`

## Docker runtime proxy

This export also includes a Docker wrapper for platforms that require containerized MCP servers. The container forwards MCP JSON-RPC requests to the reviewed Astrail endpoint and does not enable local arbitrary code execution.

\`\`\`bash
docker build -t ${name}:local .
docker run --rm -p 8787:8787 \\
  -e ASTRAIL_MCP_ENDPOINT="${server.hosted_endpoint ?? `/api/mcp/${server.id}`}" \\
  -e ASTRAIL_API_KEY="$ASTRAIL_API_KEY" \\
  -e ASTRAIL_PROXY_INBOUND_KEY="$ASTRAIL_PROXY_INBOUND_KEY" \\
  ${name}:local
curl http://localhost:8787/health
curl -H "Authorization: Bearer $ASTRAIL_PROXY_INBOUND_KEY" http://localhost:8787/
\`\`\`

The Docker image runs as the non-root \`node\` user and exposes a public local \`/health\` probe. Every other route requires the separate \`ASTRAIL_PROXY_INBOUND_KEY\`; it is never sent upstream. Requests are capped at 64 KiB, responses at 1 MiB, and upstream calls at 30 seconds. Pass secrets at runtime through your deployment platform; do not bake either key into the image.

\`.github/workflows/docker-publish.yml\` is opt-in. It builds on every manual run, but only pushes when \`publish_image=true\` and \`confirm_publish=publish\`.

## Operational assumptions

- Keep generated source reviewable.
- Treat provider credentials as Worker secrets.
- Keep runtime logs enabled.
- Preserve MCP JSON-RPC response shapes.
`;

  const productionChecklist = `# Production review checklist

Before deploying this exported runtime:

1. Review \`astrail-governance.json\`; every exposed tool should have an intentional policy and business context.
2. Keep destructive tools hidden or blocked. Connect an external approval store before enabling approval-gated writes.
3. Public REST execution is off by default and limited to fixed HTTPS endpoint-map destinations whose exact origins appear in \`ASTRAIL_ALLOWED_ORIGINS\`. Keep \`global_fetch_strictly_public\` enabled and do not add VPC bindings without a new network-security review.
4. Authenticated tools intentionally return \`auth_required\`. Use the hosted Astrail runtime for per-user OAuth, or implement and audit a self-hosted credential adapter.
5. Keep Worker observability enabled and forward structured logs to your retention system.
6. Test provider timeouts, 429s, 5xx responses, oversized responses, and partial failures before production traffic.
7. Re-export after schema changes so endpoint maps, context, and policies stay synchronized.
8. Docker proxy callers must use the separate \`ASTRAIL_PROXY_INBOUND_KEY\`. Keep it distinct from the upstream \`ASTRAIL_API_KEY\`, and preserve the generated request, response, redirect, and timeout limits.
9. Public Worker metadata can remain anonymous, but upstream execution must keep \`ASTRAIL_API_KEY\` configured and required. Add deployment-level rate limits as defense in depth before production traffic.
`;

  return {
    serverId: server.id,
    serverName: server.name,
    runtime: "cloudflare-worker-template",
    deploymentMode: "manual_export",
    files: [
      { path: "src/worker.ts", content: workerSource },
      { path: "src/docker-server.mjs", content: dockerServerSource(server) },
      { path: "wrangler.toml", content: wrangler },
      { path: "package.json", content: packageJson },
      { path: "Dockerfile", content: dockerfile() },
      { path: ".dockerignore", content: "node_modules\n.wrangler\n.git\n" },
      { path: ".github/workflows/docker-publish.yml", content: dockerPublishWorkflow(name) },
      { path: ".env.example", content: envExample },
      { path: "astrail-governance.json", content: json(governance) },
      { path: "docs/PRODUCTION_CHECKLIST.md", content: productionChecklist },
      { path: "README.md", content: readme },
    ],
  };
}
