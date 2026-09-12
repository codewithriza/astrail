import { emptyDiagnostics } from "./diagnostics";
import { assertSafeUpstreamUrl, NetworkPolicyError, readBoundedResponseText } from "./runtime/network-policy";
import type { GeneratedMcpServer, GenerationDiagnostics, McpOperationFilter, McpTool, OpenApiEndpoint, RuntimePermissionPolicy, SpecPreview } from "./types";

const MAX_MCP_TOOLS = 100;
const MAX_MCP_RESPONSE_BYTES = 1_000_000;
const MCP_TIMEOUT_MS = 15_000;

type JsonRpcPayload = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

type RemoteMcpTool = {
  name?: unknown;
  description?: unknown;
  inputSchema?: unknown;
  input_schema?: unknown;
  annotations?: unknown;
};

type RemoteMcpImport = {
  endpointUrl: string;
  tools: McpTool[];
  endpointMap: OpenApiEndpoint[];
  diagnostics: GenerationDiagnostics;
  generated: GeneratedMcpServer;
};

export type RemoteMcpCredential = {
  scheme: "bearer" | "api_key_header" | "api_key_query" | "oauth2";
  secret: string;
  injectionName?: string | null;
};

type RemoteMcpRpcOptions = {
  credential?: RemoteMcpCredential | null;
  sessionId?: string | null;
};

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeToolName(value: string, index: number) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || `mcp_tool_${index + 1}`;
}

function titleFromUrl(url: URL) {
  return `${url.hostname.replace(/^www\./, "")} MCP`;
}

function localMcpProxyFixtureEnabled() {
  return process.env.ASTRAIL_ENABLE_LOCAL_MCP_PROXY_FIXTURES === "1";
}

function isLocalMcpProxyFixture(endpoint: URL) {
  const hostname = endpoint.hostname.toLowerCase();
  return localMcpProxyFixtureEnabled()
    && endpoint.protocol === "http:"
    && (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]");
}

async function assertSafeMcpEndpoint(endpoint: URL, credential?: RemoteMcpCredential | null) {
  if (isLocalMcpProxyFixture(endpoint)) return;
  if (credential && endpoint.protocol !== "https:") {
    throw new NetworkPolicyError("Authenticated remote MCP calls require HTTPS.", "upstream_tls_required");
  }
  await assertSafeUpstreamUrl(endpoint);
}

function inferOperationKind(tool: McpTool): McpOperationFilter {
  const annotations = jsonRecord(tool.annotations);
  if (annotations.destructiveHint === true) return "destructive";
  if (annotations.readOnlyHint === true) return "read";
  if (/delete|remove|destroy|purge|erase|void|refund/i.test(tool.name)) return "destructive";
  if (/^(get|list|search|read|fetch|describe|find|lookup)/i.test(tool.name)) return "read";
  return "write";
}

function normalizeInputSchema(tool: RemoteMcpTool) {
  const schema = tool.inputSchema ?? tool.input_schema;
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : { type: "object", properties: {} };
}

function normalizeAnnotations(tool: RemoteMcpTool) {
  return tool.annotations && typeof tool.annotations === "object" && !Array.isArray(tool.annotations)
    ? tool.annotations as McpTool["annotations"]
    : undefined;
}

function normalizeRemoteTools(rawTools: unknown) {
  const tools = Array.isArray(rawTools) ? rawTools : [];
  const seen = new Set<string>();

  return tools.slice(0, MAX_MCP_TOOLS).map((raw, index) => {
    const record = jsonRecord(raw) as RemoteMcpTool;
    const upstreamName = typeof record.name === "string" && record.name.trim()
      ? record.name.trim()
      : `mcp_tool_${index + 1}`;
    const baseName = safeToolName(upstreamName, index);
    let name = baseName;
    let suffix = 2;
    while (seen.has(name)) {
      name = `${baseName.slice(0, 74)}_${suffix}`;
      suffix += 1;
    }
    seen.add(name);

    const tool: McpTool = {
      name,
      description: typeof record.description === "string" && record.description.trim()
        ? record.description
        : `Proxy ${name} through the upstream MCP server.`,
      input_schema: normalizeInputSchema(record),
      annotations: normalizeAnnotations(record),
      metadata: { upstream_tool_name: upstreamName },
      method: "MCP_PROXY",
      path: name,
    };
    const operationKind = inferOperationKind(tool);
    tool.policy = operationKind === "read" ? "allow" : operationKind === "destructive" ? "block" : "approval";
    return tool;
  });
}

function extractJsonFromSse(text: string) {
  const dataLines = text
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter((line) => line && line !== "[DONE]");

  for (const line of dataLines) {
    try {
      return JSON.parse(line) as unknown;
    } catch {
      // Keep scanning. Some SSE streams include comments or non-JSON events.
    }
  }
  return null;
}

function parseJsonRpcPayload(text: string): JsonRpcPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = extractJsonFromSse(text);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Remote MCP endpoint did not return a JSON-RPC object.");
  }
  return parsed as JsonRpcPayload;
}

function remoteMcpRequest(endpointUrl: string, options: RemoteMcpRpcOptions) {
  const endpoint = new URL(endpointUrl);
  if (options.credential && endpoint.protocol !== "https:" && !isLocalMcpProxyFixture(endpoint)) {
    throw new NetworkPolicyError("Authenticated remote MCP calls require HTTPS.", "upstream_tls_required");
  }
  const headers: Record<string, string> = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": "2024-11-05",
    "x-astrail-upstream": "mcp-proxy",
  };
  if (options.sessionId) headers["mcp-session-id"] = options.sessionId;
  const credential = options.credential;
  if (credential?.scheme === "bearer" || credential?.scheme === "oauth2") {
    headers.authorization = `Bearer ${credential.secret}`;
  } else if (credential?.scheme === "api_key_header") {
    const headerName = credential.injectionName?.trim() || "x-api-key";
    if (!/^[a-z0-9-]+$/i.test(headerName)) throw new Error("MCP credential header name is invalid.");
    headers[headerName] = credential.secret;
  } else if (credential?.scheme === "api_key_query") {
    endpoint.searchParams.set(credential.injectionName?.trim() || "api_key", credential.secret);
  }
  return { endpoint, headers };
}

async function callRemoteMcpRpc(endpointUrl: string, method: string, params: Record<string, unknown> = {}, options: RemoteMcpRpcOptions = {}) {
  const request = remoteMcpRequest(endpointUrl, options);
  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `astrail_${Date.now().toString(36)}`,
      method,
      params,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Remote MCP endpoint returned HTTP ${response.status}.`);
  }

  const payload = parseJsonRpcPayload(await readBoundedResponseText(response, MAX_MCP_RESPONSE_BYTES, "Remote MCP response"));
  if (payload.error) {
    throw new Error(payload.error.message || `Remote MCP JSON-RPC error ${payload.error.code ?? "unknown"}.`);
  }
  if (payload.result === undefined) {
    throw new Error("Remote MCP endpoint returned an empty JSON-RPC result.");
  }
  return { result: payload.result, sessionId: response.headers.get("mcp-session-id") ?? options.sessionId ?? null };
}

async function notifyRemoteMcpInitialized(endpointUrl: string, options: RemoteMcpRpcOptions = {}) {
  const request = remoteMcpRequest(endpointUrl, options);
  const response = await fetch(request.endpoint, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    redirect: "manual",
    signal: AbortSignal.timeout(MCP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Remote MCP initialized notification returned HTTP ${response.status}.`);
}

function toolsFromListResult(result: unknown) {
  const record = jsonRecord(result);
  return Array.isArray(record.tools) ? record.tools : [];
}

async function listRemoteMcpTools(endpointUrl: string, credential?: RemoteMcpCredential | null) {
  let sessionId: string | null = null;
  try {
    const initialized = await callRemoteMcpRpc(endpointUrl, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "Astrail MCP Importer",
        version: "1.0.0",
      },
    }, { credential });
    sessionId = initialized.sessionId;
    await notifyRemoteMcpInitialized(endpointUrl, { credential, sessionId });
  } catch {
    // Some stateless HTTP MCP servers allow tools/list without initialize.
  }

  const listed = await callRemoteMcpRpc(endpointUrl, "tools/list", {}, { credential, sessionId });
  return normalizeRemoteTools(toolsFromListResult(listed.result));
}

export async function inspectRemoteMcpServer(sourceUrl: string, credential?: RemoteMcpCredential | null) {
  const endpoint = new URL(sourceUrl);
  await assertSafeMcpEndpoint(endpoint, credential);
  const tools = await listRemoteMcpTools(endpoint.toString(), credential);
  if (tools.length === 0) {
    throw new Error("Remote MCP endpoint returned no tools.");
  }
  return { endpoint, tools };
}

export async function previewRemoteMcpServer(sourceUrl: string, credential?: RemoteMcpCredential | null): Promise<SpecPreview> {
  const { endpoint, tools } = await inspectRemoteMcpServer(sourceUrl, credential);
  const allOperations: Array<{ name: McpOperationFilter; count: number }> = [
    { name: "read", count: tools.filter((tool) => inferOperationKind(tool) === "read").length },
    { name: "write", count: tools.filter((tool) => inferOperationKind(tool) === "write").length },
    { name: "destructive", count: tools.filter((tool) => inferOperationKind(tool) === "destructive").length },
  ];
  const operations = allOperations.filter((item) => item.count > 0);

  return {
    source_url: endpoint.toString(),
    spec_size_bytes: 0,
    endpoint_count: tools.length,
    endpoint_limit: tools.length,
    groups: [{ name: "MCP tools", count: tools.length }],
    resources: [{ name: "mcp", count: tools.length }],
    operations,
    recommended_mode: "dynamic",
    client_presets: ["default", "claude", "claude-code", "cursor", "openai"],
    is_large: tools.length > 30,
    warning: tools.length >= MAX_MCP_TOOLS
      ? `Imported the first ${MAX_MCP_TOOLS} tools from this MCP endpoint.`
      : null,
    diagnostics: [
      `Remote MCP endpoint: ${endpoint.toString()}`,
      `Tools found: ${tools.length}.`,
      "Transport: streamable HTTP JSON-RPC.",
    ],
  };
}

export async function buildRemoteMcpImport(sourceUrl: string, runtimePolicy?: RuntimePermissionPolicy | null, credential?: RemoteMcpCredential | null): Promise<RemoteMcpImport> {
  const { endpoint, tools } = await inspectRemoteMcpServer(sourceUrl, credential);
  const diagnostics = emptyDiagnostics(endpoint.toString());
  diagnostics.discovered_url = endpoint.toString();
  diagnostics.discovery_method = "mcp_tools_list";
  diagnostics.endpoint_count = tools.length;
  diagnostics.selected_group = "MCP tools";
  diagnostics.tools_generated = tools.length;
  diagnostics.timestamps.completed_at = new Date().toISOString();
  diagnostics.raw = [
    `Remote MCP endpoint: ${endpoint.toString()}`,
    `Tools imported: ${tools.length}.`,
    `Runtime policy: ${runtimePolicy ? "enabled" : "open"}.`,
  ];
  diagnostics.trace.push(
    {
      label: "Remote MCP endpoint inspected",
      status: "passed",
      detail: endpoint.toString(),
    },
    {
      label: `${tools.length} MCP tools imported`,
      status: "passed",
    }
  );

  const endpointMap = tools.map((tool): OpenApiEndpoint => ({
    method: "MCP_PROXY",
    path: typeof tool.metadata?.upstream_tool_name === "string" ? tool.metadata.upstream_tool_name : tool.name,
    base_url: endpoint.toString(),
    runtime_kind: "mcp_proxy",
    tool_name: tool.name,
    operation_id: tool.name,
    summary: tool.description,
    description: tool.description,
    tags: ["mcp"],
    parameters: [],
    input_schema: tool.input_schema ?? { type: "object", properties: {} },
    requires_auth: false,
    visibility: "private",
    resource: "mcp",
    operation_kind: inferOperationKind(tool),
    policy: tool.policy,
  }));

  return {
    endpointUrl: endpoint.toString(),
    tools,
    endpointMap,
    diagnostics,
    generated: {
      name: titleFromUrl(endpoint),
      description: `Astrail proxy for ${endpoint.toString()}. Tools execute through the upstream MCP server while Astrail handles hosted access, billing, logs, and runtime policy.`,
      tools,
      generated_code: [
        `// Astrail MCP proxy for ${endpoint.toString()}`,
        "// This server fronts an existing streamable-HTTP MCP endpoint.",
        "// Live calls are forwarded by Astrail's hosted runtime; no upstream code is executed inside the dashboard.",
      ].join("\n"),
    },
  };
}

export async function callRemoteMcpTool(endpointUrl: string, toolName: string, args: Record<string, unknown>, credential?: RemoteMcpCredential | null) {
  const endpoint = new URL(endpointUrl);
  await assertSafeMcpEndpoint(endpoint, credential);
  let sessionId: string | null = null;
  try {
    const initialized = await callRemoteMcpRpc(endpoint.toString(), "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Astrail MCP Proxy", version: "1.0.0" },
    }, { credential });
    sessionId = initialized.sessionId;
    await notifyRemoteMcpInitialized(endpoint.toString(), { credential, sessionId });
  } catch {
    // Stateless servers may reject initialization and still accept tools/call.
  }
  const called = await callRemoteMcpRpc(endpoint.toString(), "tools/call", {
    name: toolName,
    arguments: args,
  }, { credential, sessionId });
  return called.result;
}
