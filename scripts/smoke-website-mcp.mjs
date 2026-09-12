const baseUrl = (process.env.ASTRAIL_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const websiteUrls = (process.env.ASTRAIL_WEBSITE_URLS ?? process.env.ASTRAIL_WEBSITE_URL ?? "https://example.com")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const blockedWebsiteUrl = process.env.ASTRAIL_BLOCKED_WEBSITE_URL ?? "http://127.0.0.1:3000";
const blockedWebsiteUrls = [
  blockedWebsiteUrl,
  "http://localhost:3000",
  "http://[::1]:3000",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.1/",
  "ftp://example.com/",
  "file:///etc/passwd",
];

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://smoke.astrail.local" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function rpc(endpoint, body) {
  return postJson(endpoint, body);
}

async function smokeWebsite(websiteUrl) {
  const generated = await postJson(`${baseUrl}/api/website-to-mcp`, { url: websiteUrl });
  if (!generated.response.ok || !generated.payload?.server?.hosted_endpoint) {
    fail("website-to-MCP generation failed", JSON.stringify(generated.payload, null, 2));
  }

  const server = generated.payload.server;
  const endpoint = server.hosted_endpoint;
  console.log(`server: ${server.id}`);
  console.log(`endpoint: ${endpoint}`);

  const metadata = await fetch(endpoint, { headers: { Origin: "https://smoke.astrail.local" } });
  const metadataPayload = await metadata.json().catch(() => null);
  if (!metadata.ok || !metadataPayload?.agent_profile?.hosted) {
    fail("metadata GET failed", JSON.stringify(metadataPayload, null, 2));
  }
  console.log(`metadata: ${metadataPayload.name}`);

  const initialize = await rpc(endpoint, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  if (!initialize.response.ok || initialize.payload?.error) {
    fail("initialize failed", JSON.stringify(initialize.payload, null, 2));
  }
  console.log(`initialize: ${initialize.payload.result?.protocolVersion ?? "ok"}`);

  const listed = await rpc(endpoint, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = listed.payload?.result?.tools ?? [];
  if (!listed.response.ok || !Array.isArray(tools) || tools.length === 0) {
    fail("tools/list failed", JSON.stringify(listed.payload, null, 2));
  }
  console.log(`tools/list: ${tools.length}`);

  const tool = tools.find((item) => item.name.includes("open_page")) ?? tools[0];
  const called = await rpc(endpoint, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: tool.name,
      arguments: { instruction: "Smoke-test this public website read." },
    },
  });
  const text = called.payload?.result?.content?.[0]?.text ?? "{}";
  const parsed = JSON.parse(text);
  if (!called.response.ok || parsed.status !== "success") {
    fail("browser tool call failed", JSON.stringify(parsed, null, 2));
  }
  console.log(`tools/call: ${parsed.response?.title ?? parsed.response?.final_url ?? "success"}`);

  const sdk = await fetch(`${baseUrl}/api/servers/${server.id}/sdk`);
  const sdkPayload = await sdk.json().catch(() => null);
  if (!sdk.ok || sdkPayload?.runtime !== "astrail-sdk-factory" || !Array.isArray(sdkPayload.files)) {
    fail("website SDK export failed", JSON.stringify(sdkPayload, null, 2));
  }
  const tsFile = sdkPayload.files.find((file) => file.path === "typescript/src/index.ts");
  if (!tsFile?.content?.includes("browser")) {
    fail("website SDK does not expose browser workflow methods");
  }
  console.log(`sdk: ${sdkPayload.files.length} files`);

  console.log(`PASS: ${websiteUrl} generated a reachable MCP endpoint and SDK bundle.`);
}

async function smokeBlockedUrl() {
  for (const url of blockedWebsiteUrls) {
    const blocked = await postJson(`${baseUrl}/api/website-to-mcp`, { url });
    if (blocked.response.status >= 200 && blocked.response.status < 300) {
      fail("blocked private/local website URL was accepted", JSON.stringify({ url, payload: blocked.payload }, null, 2));
    }
    const message = String(blocked.payload?.error ?? "");
    if (!/public|local|private|unsupported|auth|valid/i.test(message)) {
      fail("blocked URL returned an unexpected error", JSON.stringify({ url, payload: blocked.payload }, null, 2));
    }
    console.log(`blocked: ${url}`);
  }
}

async function main() {
  console.log(`base_url: ${baseUrl}`);
  console.log(`website_urls: ${websiteUrls.join(", ")}`);

  if (websiteUrls.length === 0) fail("Set at least one website URL.");
  for (const websiteUrl of websiteUrls) {
    await smokeWebsite(websiteUrl);
  }
  await smokeBlockedUrl();

  console.log("PASS: website URL(s) generated reachable MCP endpoint(s) and SDK bundle(s).");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown website MCP smoke failure"));
