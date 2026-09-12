import { CopySnippet } from "@/components/CopySnippet";
import type { McpTool, OpenApiEndpoint } from "@/lib/types";

function configName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "astrail-server";
}

export function McpClientSnippets({
  serverName,
  endpoint,
  tools,
  endpointMap = [],
  isPublic = true,
  x402Enabled = false,
}: {
  serverName: string;
  endpoint: string;
  tools: McpTool[];
  endpointMap?: OpenApiEndpoint[];
  isPublic?: boolean;
  x402Enabled?: boolean;
}) {
  const firstEndpoint =
    endpointMap.find((item) => item.runtime_kind === "browser" || item.method.toUpperCase() === "BROWSER") ??
    endpointMap.find((item) => item.method.toUpperCase() === "GET" && !hasPathParams(item)) ??
    endpointMap.find((item) => item.method.toUpperCase() === "GET") ??
    endpointMap.find((item) => item.tool_name || item.operation_id) ??
    endpointMap[0];
  const firstTool = tools.find((tool) => tool.name === firstEndpoint?.tool_name || tool.name === firstEndpoint?.operation_id) ?? tools[0];
  const firstToolArgs = firstEndpoint
    ? sampleArgsFromEndpoint(firstEndpoint)
    : sampleArgsFromSchema(firstTool);
  const isCodeMode = tools.some((tool) => tool.name === "search_docs") && tools.some((tool) => tool.name === "execute");
  const codeModeCall = firstEndpoint
    ? `client.${sdkResource(firstEndpoint)}.${sdkMethod(firstEndpoint)}(${JSON.stringify(firstToolArgs, null, 2)})`
    : "client.resource.list({ limit: 10 })";

  const desktopConfig = JSON.stringify({
    mcpServers: {
      [configName(serverName)]: {
        url: endpoint,
        ...(isPublic ? {} : { headers: { Authorization: "Bearer ${ASTRAIL_API_KEY}" } }),
      },
    },
  }, null, 2);

  const authHeader = isPublic ? "" : " \\\n  -H 'Authorization: Bearer $ASTRAIL_API_KEY'";

  const initialize = `curl -sS -X POST ${JSON.stringify(endpoint)} \\
  -H 'Content-Type: application/json'${authHeader} \\
  --data '${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}'`;

  const toolsList = `curl -sS -X POST ${JSON.stringify(endpoint)} \\
  -H 'Content-Type: application/json'${authHeader} \\
  --data '${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}'`;

  const toolsCall = `curl -sS -X POST ${JSON.stringify(endpoint)} \\
  -H 'Content-Type: application/json'${authHeader} \\
  --data '${JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: isCodeMode ? "search_docs" : firstTool?.name ?? "tool_name",
      arguments: isCodeMode ? { query: "list active records", operation: "read", limit: 5 } : firstToolArgs,
    },
  })}'`;
  const codeModeExecute = `curl -sS -X POST ${JSON.stringify(endpoint)} \\
  -H 'Content-Type: application/json'${authHeader} \\
  --data '${JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "execute",
      arguments: {
        code: `async function run(client) {\\n  return await ${codeModeCall};\\n}`,
        result_mode: "compact",
      },
    },
  })}'`;
  const paidToolsCall = `curl -sS -X POST ${JSON.stringify(endpoint)} \\
  -H 'Content-Type: application/json'${authHeader} \\
  -H 'PAYMENT-SIGNATURE: $X402_PAYMENT_SIGNATURE' \\
  --data '${JSON.stringify({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: firstTool?.name ?? "paid_tool", arguments: firstToolArgs },
  })}'`;

  return (
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <CopySnippet title="Claude Desktop config" code={desktopConfig} />
      <CopySnippet title="cURL initialize" code={initialize} />
      <CopySnippet title="cURL tools/list" code={toolsList} />
      <CopySnippet title={isCodeMode ? "cURL search_docs" : "cURL tools/call"} code={toolsCall} />
      {isCodeMode && <CopySnippet title="cURL execute" code={codeModeExecute} />}
      {x402Enabled && <CopySnippet title="cURL caller-signed x402 retry" code={paidToolsCall} />}
    </div>
  );
}

function sampleArgsFromSchema(tool: McpTool | undefined) {
  if (!tool?.input_schema?.properties || typeof tool.input_schema.properties !== "object") return {};
  return Object.fromEntries(Object.keys(tool.input_schema.properties).slice(0, 3).map((key) => [key, sampleValue(key)]));
}

function sampleArgsFromEndpoint(endpoint: OpenApiEndpoint) {
  if (endpoint.runtime_kind === "browser" || endpoint.method.toUpperCase() === "BROWSER") {
    const args: Record<string, string> = {
      instruction: "Review this workflow in an isolated browser session.",
    };
    for (const parameter of Array.isArray(endpoint.parameters) ? endpoint.parameters : []) {
      if (!parameter || typeof parameter !== "object") continue;
      const name = (parameter as Record<string, unknown>).name;
      if (typeof name === "string") args[name] = "example";
    }
    return args;
  }
  const args: Record<string, string | number> = {};
  for (const parameter of Array.isArray(endpoint.parameters) ? endpoint.parameters : []) {
    if (!parameter || typeof parameter !== "object") continue;
    const record = parameter as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : null;
    if (!name) continue;
    args[name] = sampleValue(name);
  }
  return args;
}

function hasPathParams(endpoint: OpenApiEndpoint) {
  return (Array.isArray(endpoint.parameters) ? endpoint.parameters : []).some((parameter) => {
    if (!parameter || typeof parameter !== "object") return false;
    return (parameter as Record<string, unknown>).in === "path";
  });
}

function camelCase(value: string) {
  const parts = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "api";
  return parts.map((part, index) => {
    const lower = part.toLowerCase();
    return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join("");
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
  const leaf = endpoint.path.split("/").filter((part) => part && !part.startsWith("{")).pop() || "resource";
  return camelCase(`${verb} ${leaf}`);
}

function sampleValue(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "status") return "available";
  if (normalized.includes("id")) return 1;
  if (normalized.includes("limit")) return 10;
  return "example";
}
