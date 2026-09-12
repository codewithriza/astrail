const endpoint = process.env.ASTRAIL_MCP_ENDPOINT ?? "http://localhost:3000/api/mcp/petstore-code-mode";
const apiKey = process.env.ASTRAIL_MCP_API_KEY;

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function headers(extra = {}) {
  return {
    "Content-Type": "application/json",
    Origin: "https://smoke.astrail.local",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  };
}

async function post(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function main() {
  console.log(`endpoint: ${endpoint}`);

  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: headers({
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type, authorization",
    }),
  });
  if (preflight.status !== 204) fail("OPTIONS preflight failed", `${preflight.status}`);
  if (!preflight.headers.get("access-control-allow-origin")) fail("CORS allow-origin missing");
  console.log("preflight: ok");

  const metadata = await fetch(endpoint, {
    method: "GET",
    headers: headers(),
  });
  const metadataPayload = await metadata.json().catch(() => null);
  if (!metadata.ok || !metadataPayload?.agent_profile?.hosted) {
    fail("metadata GET failed", JSON.stringify(metadataPayload, null, 2));
  }
  console.log(`metadata: ${metadataPayload.name}`);

  const initialize = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  if (!initialize.response.ok || initialize.payload?.error) {
    fail("initialize failed", JSON.stringify(initialize.payload, null, 2));
  }
  console.log(`initialize: ${initialize.payload.result?.protocolVersion ?? "ok"}`);

  const listed = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = listed.payload?.result?.tools ?? [];
  if (!listed.response.ok || !Array.isArray(tools) || tools.length === 0) {
    fail("tools/list failed", JSON.stringify(listed.payload, null, 2));
  }
  console.log(`tools/list: ${tools.length}`);

  const batch = await post([
    { jsonrpc: "2.0", id: 3, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
  ]);
  if (!batch.response.ok || !Array.isArray(batch.payload) || batch.payload.length !== 2) {
    fail("JSON-RPC batch failed", JSON.stringify(batch.payload, null, 2));
  }
  console.log("batch: ok");

  const searchDocs = tools.find((tool) => tool.name === "search_docs");
  if (searchDocs) {
    const docs = await post({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "search_docs",
        arguments: { query: "inventory", limit: 1 },
      },
    });
    const text = docs.payload?.result?.content?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text);
    if (!docs.response.ok || parsed.status !== "success") {
      fail("search_docs failed", JSON.stringify(parsed, null, 2));
    }
    console.log(`search_docs: ${parsed.returned} docs`);
  }

  console.log("PASS: hosted MCP endpoint is reachable and production-shaped.");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown smoke failure"));
