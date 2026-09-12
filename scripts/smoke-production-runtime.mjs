const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://smoke.astrail.local" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function rpc(endpoint, body) {
  return postJson(endpoint, body);
}

function parseToolText(payload) {
  const text = payload?.result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function smokeJsonRpcAndCodeMode() {
  const endpoint = `${baseUrl}/api/mcp/petstore-code-mode`;
  const badVersion = await rpc(endpoint, { jsonrpc: "1.0", id: 1, method: "tools/list", params: {} });
  if (badVersion.response.status !== 400 || badVersion.payload?.error?.code !== -32600) {
    fail("JSON-RPC protocol validation failed", JSON.stringify(badVersion.payload, null, 2));
  }

  const missingCode = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "execute", arguments: {} },
  });
  const missingCodeParsed = parseToolText(missingCode.payload);
  if (missingCode.response.status !== 200 || missingCode.payload?.result?.isError !== true || missingCodeParsed.status !== "validation_failed") {
    fail("Code Mode input validation did not return an MCP tool error", JSON.stringify(missingCode.payload, null, 2));
  }

  const validExecute = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "execute",
      arguments: { code: "async function run(client) { return await client.store.getInventory({}); }" },
    },
  });
  const validExecuteParsed = parseToolText(validExecute.payload);
  if (!validExecute.response.ok || validExecute.payload?.result?.isError || validExecuteParsed.status !== "success") {
    fail("Code Mode valid execution failed", JSON.stringify(validExecuteParsed, null, 2));
  }
  console.log("code-mode: ok");
}

async function smokeDynamicGeneratedEndpoint() {
  const spec = {
    openapi: "3.0.3",
    info: { title: "Public Echo API", version: "1.0.0" },
    servers: [{ url: "https://postman-echo.com" }],
    paths: {
      "/get": {
        get: {
          operationId: "inspectRequest",
          summary: "Inspect query parameters",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Echo query." },
            { name: "limit", in: "query", required: false, schema: { type: "integer" }, description: "Echo numeric limit." },
          ],
          responses: { "200": { description: "Echo response" } },
        },
      },
    },
  };

  const generated = await postJson(`${baseUrl}/api/generate`, {
    sourceType: "json_paste",
    rawJson: JSON.stringify(spec),
    generationMode: "dynamic",
    endpointLimit: 5,
  });
  if (!generated.response.ok || !generated.payload?.server?.hosted_endpoint) {
    fail("Dynamic OpenAPI endpoint generation failed", JSON.stringify(generated.payload, null, 2));
  }

  const endpoint = generated.payload.server.hosted_endpoint;
  const list = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "list_api_endpoints", arguments: { query: "inspect", limit: 5 } },
  });
  const listed = parseToolText(list.payload);
  const endpointId = listed.endpoints?.[0]?.endpoint_id;
  if (!endpointId) fail("Dynamic endpoint catalog did not return endpoint_id", JSON.stringify(listed, null, 2));

  const invalid = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "invoke_api_endpoint",
      arguments: { endpoint_id: endpointId, arguments: { q: "production", limit: "bad" } },
    },
  });
  const invalidParsed = parseToolText(invalid.payload);
  if (invalid.payload?.result?.isError !== true || invalidParsed.status !== "validation_failed") {
    fail("Dynamic invoke did not validate endpoint arguments", JSON.stringify(invalidParsed, null, 2));
  }

  const valid = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: {
      name: "invoke_api_endpoint",
      arguments: { endpoint_id: endpointId, arguments: { q: "production", limit: 7 } },
    },
  });
  const validParsed = parseToolText(valid.payload);
  if (!valid.response.ok || valid.payload?.result?.isError || validParsed.status !== "success" || validParsed.response?.body?.args?.q !== "production") {
    fail("Dynamic invoke did not execute public upstream", JSON.stringify(validParsed, null, 2));
  }
  if (typeof validParsed.response?.body_bytes !== "number" || validParsed.response?.body_truncated !== false) {
    fail("Dynamic invoke missing response size metadata", JSON.stringify(validParsed, null, 2));
  }
  console.log("dynamic-openapi: ok");
}

async function main() {
  console.log(`base_url: ${baseUrl}`);
  await smokeJsonRpcAndCodeMode();
  await smokeDynamicGeneratedEndpoint();
  console.log("PASS: production runtime endpoints are validating, executing, and exposing MCP correctly.");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown production runtime smoke failure"));
