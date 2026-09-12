import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { buildRemoteMcpImport, callRemoteMcpTool, previewRemoteMcpServer } from "../lib/mcp-proxy";
import { executeToolFromEndpointMap } from "../lib/runtime/execute-tool";
import type { McpServer } from "../lib/types";

process.env.ASTRAIL_ENABLE_LOCAL_MCP_PROXY_FIXTURES = "1";

const upstreamToolCalls: string[] = [];

function readRequestBody(request: IncomingMessage) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}") as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response: ServerResponse, payload: Record<string, unknown>) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

const upstream = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/mcp") {
    response.writeHead(404);
    response.end("not found");
    return;
  }

  const body = await readRequestBody(request);
  const method = String(body.method ?? "");
  const id = body.id ?? 1;

  if (method === "initialize") {
    response.writeHead(200, { "content-type": "application/json", "mcp-session-id": "smoke-session" });
    response.end(JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "Local smoke MCP" },
      },
    }));
    return;
  }

  if (method === "tools/list") {
    sendJson(response, {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "list/items",
            description: "List smoke items.",
            inputSchema: {
              type: "object",
              properties: {
                limit: { type: "number" },
              },
            },
            annotations: { readOnlyHint: true },
          },
          {
            name: "delete_item",
            description: "Delete a smoke item.",
            inputSchema: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
            annotations: { destructiveHint: true },
          },
          {
            name: "secure_echo",
            description: "Echo through an authenticated MCP session.",
            inputSchema: { type: "object", properties: { value: { type: "string" } } },
          },
        ],
      },
    });
    return;
  }

  if (method === "tools/call") {
    const params = body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? body.params as Record<string, unknown>
      : {};
    const name = String(params.name ?? "");
    if (request.headers["mcp-session-id"] !== "smoke-session") {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message: "session required" } }));
      return;
    }
    if (name === "secure_echo" && request.headers.authorization !== "Bearer smoke-token") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32001, message: "auth required" } }));
      return;
    }
    upstreamToolCalls.push(name);
    if (name === "oversized") {
      sendJson(response, {
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: "x".repeat(1_000_100) }] },
      });
      return;
    }
    sendJson(response, {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, name, arguments: params.arguments ?? {} }),
          },
        ],
      },
    });
    return;
  }

  sendJson(response, {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unknown method ${method}` },
  });
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  let plaintextCredentialRejected = false;
  try {
    await callRemoteMcpTool("http://example.com/mcp", "secure_echo", {}, { scheme: "bearer", secret: "smoke-token" });
  } catch (error) {
    plaintextCredentialRejected = error instanceof Error && error.message.includes("require HTTPS");
  }
  assert(plaintextCredentialRejected, "Expected authenticated remote MCP calls over plaintext HTTP to be rejected.");

  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  assert(address && typeof address === "object", "Expected local MCP smoke server address.");
  const endpoint = `http://127.0.0.1:${address.port}/mcp`;

  try {
    const preview = await previewRemoteMcpServer(endpoint);
    assert(preview.endpoint_count === 3, `Expected 3 MCP tools, got ${preview.endpoint_count}.`);
    assert(preview.operations?.some((item) => item.name === "read" && item.count === 1), "Expected one read tool.");
    assert(preview.operations?.some((item) => item.name === "destructive" && item.count === 1), "Expected one destructive tool.");

    const imported = await buildRemoteMcpImport(endpoint, { read_only: true });
    assert(imported.tools.length === 3, "Expected import to preserve all tools.");
    assert(imported.endpointMap.every((entry) => entry.method === "MCP_PROXY" && entry.runtime_kind === "mcp_proxy"), "Expected MCP proxy endpoint map.");

    const direct = await callRemoteMcpTool(endpoint, "list/items", { limit: 2 });
    assert(direct && typeof direct === "object", "Expected direct remote MCP result.");
    const authenticated = await callRemoteMcpTool(endpoint, "secure_echo", { value: "ok" }, { scheme: "bearer", secret: "smoke-token" });
    assert(authenticated && typeof authenticated === "object", "Expected authenticated sessionful MCP result.");

    let oversizedRejected = false;
    try {
      await callRemoteMcpTool(endpoint, "oversized", {});
    } catch (error) {
      oversizedRejected = error instanceof Error && error.message.includes("exceeded 1000000 bytes");
    }
    assert(oversizedRejected, "Expected MCP proxy to stop reading oversized upstream responses.");

    const server: McpServer = {
      id: "mcp-proxy-smoke",
      user_id: "smoke-user",
      name: imported.generated.name,
      description: imported.generated.description,
      source_url: endpoint,
      source_type: "mcp_url",
      generated_code: imported.generated.generated_code,
      tools_json: imported.tools,
      endpoint_map: imported.endpointMap,
      runtime_policy: { read_only: true },
      status: "live",
      validation_status: "passed",
      generation_status: "completed",
      is_public: false,
      hosted_endpoint: "http://127.0.0.1/api/mcp/mcp-proxy-smoke",
      call_count: 0,
      created_at: new Date().toISOString(),
    };

    const listTool = imported.tools.find((tool) => tool.name === "list_items");
    const deleteTool = imported.tools.find((tool) => tool.name === "delete_item");
    assert(listTool, "Expected list_items tool.");
    assert(deleteTool, "Expected delete_item tool.");

    const listResult = await executeToolFromEndpointMap(server, listTool, { limit: 1 }, { traceId: "trace_mcp_proxy_read" });
    assert(listResult.status === "success", `Expected successful proxy execution, got ${listResult.status}.`);
    assert(listResult.executionMode === "mcp_proxy", `Expected mcp_proxy execution mode, got ${listResult.executionMode}.`);
    assert(upstreamToolCalls.at(-1) === "list/items", `Expected proxy execution to preserve the upstream tool name, got ${upstreamToolCalls.at(-1)}.`);

    const beforeDenied = upstreamToolCalls.length;
    const denied = await executeToolFromEndpointMap(server, deleteTool, { id: "danger" }, { traceId: "trace_mcp_proxy_denied" });
    assert(denied.status === "permission_denied", `Expected read-only policy denial, got ${denied.status}.`);
    assert(upstreamToolCalls.length === beforeDenied, "Read-only policy should deny destructive MCP proxy call before upstream execution.");

    console.log("MCP proxy import smoke passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      upstream.close((error) => error ? reject(error) : resolve());
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
