import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import net from "node:net";

const validKey = "ag_test_valid_mcp_key";
const wrongKey = "ag_test_wrong_mcp_key";
const providerSecret = "provider_secret_must_not_leak";
const startedServer = !process.env.ASTRAIL_BASE_URL;
const preferredPort = process.env.ASTRAIL_SECURITY_SMOKE_PORT
  ? Number(process.env.ASTRAIL_SECURITY_SMOKE_PORT)
  : 0;
const port = startedServer
  ? await findOpenPort(preferredPort)
  : null;
const baseUrl = (process.env.ASTRAIL_BASE_URL ?? `http://localhost:${port}`).replace(/\/$/, "");

let child = null;

async function canListen(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(portToCheck);
  });
}

async function findOpenPort(preferredPort) {
  if (preferredPort > 0 && await canListen(preferredPort)) return preferredPort;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("Could not allocate a smoke-test port"));
      });
    });
    server.listen(0);
  });
}

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  if (child) child.kill("SIGTERM");
  process.exit(1);
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail);
}

function headers(key, origin = "https://security-smoke.astrail.local") {
  return {
    "content-type": "application/json",
    origin,
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };
}

async function rpc(path, body, key) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: headers(key),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload, text: JSON.stringify(payload) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseToolText(payload) {
  const text = payload?.result?.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function assertJsonRpcAuditTrace(payload, reason, status, detail) {
  const data = payload?.error?.data;
  assert(data?.reason === reason, `JSON-RPC error did not include reason ${reason}`, detail);
  assert(data?.status === status, `JSON-RPC error did not include status ${status}`, detail);
  assert(/^sec_[a-z0-9]+_[a-z0-9]+$/.test(data?.trace_id ?? ""), "JSON-RPC error did not include security trace ID", detail);
}

async function rpcRetryingTransientUpstream(path, body, key) {
  let lastResult = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await rpc(path, body, key);
    const parsed = parseToolText(result.payload);
    const transientUpstreamError = parsed.runtime?.error_code === "upstream_http_error" &&
      [502, 503, 504].includes(Number(parsed.response?.status));
    if (!transientUpstreamError) return result;
    lastResult = result;
    await sleep(750 * (attempt + 1));
  }
  return lastResult;
}

async function assertBundleBillingGate() {
  const routeSource = await readFile(join(process.cwd(), "app/api/mcp/bundles/[bundleId]/route.ts"), "utf8");
  const billingImport = routeSource.indexOf("import { checkBillingAllowance } from \"@/lib/billing/usage\";");
  const billingCheck = routeSource.indexOf("const billing = await checkBillingAllowance(server.user_id);");
  const billingResponse = routeSource.indexOf("billingRequiredResult(name, tool, billing.summary)");
  const callCount = routeSource.indexOf("await incrementServerCallCount(server);");
  const execution = routeSource.indexOf("await executeToolFromEndpointMap(server, tool, args");

  assert(billingImport >= 0, "bundle MCP route does not import billing allowance enforcement");
  assert(billingCheck >= 0, "bundle MCP tools/call path does not check billing allowance");
  assert(billingResponse > billingCheck, "bundle MCP billing denial response is missing or ordered before the allowance check");
  assert(
    billingCheck < callCount && billingCheck < execution,
    "bundle MCP billing allowance must run before call counts or upstream execution",
  );
  console.log("public-bundle-billing-gate: enforced-before-execution");
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/mcp/security-public`, {
        headers: { origin: "https://security-smoke.astrail.local" },
      });
      if (response.status < 500) return;
    } catch {
      // Keep polling until Next is listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  fail("local Next server did not become ready");
}

async function startServerIfNeeded() {
  if (!startedServer) return;
  child = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
    env: {
      ...process.env,
      ASTRAIL_REQUIRE_AUTH: "false",
      NEXT_PUBLIC_NEON_AUTH_URL: "",
      NEXT_PUBLIC_NEON_DATA_API_URL: "",
      ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES: "1",
      ASTRAIL_LOCAL_MCP_API_KEY: validKey,
      ASTRAIL_LOCAL_MCP_END_USER_ID: "customer_82",
      ASTRAIL_LOCAL_MCP_ACTOR_ROLE: "operator",
      ASTRAIL_LOCAL_PROVIDER_SECRET: providerSecret,
      ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX: "12",
      ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX: "40",
      ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX: "20",
      ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX: "60",
      ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS: "60000",
      ASTRAIL_MCP_EDGE_MAX_BODY_BYTES: "4096",
      ASTRAIL_CORS_ORIGINS: "https://security-smoke.astrail.local",
      ASTRAIL_SECURITY_SMOKE_UPSTREAM_BASE_URL: baseUrl,
    },
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer();
}

async function stopServerIfNeeded() {
  if (!child) return;
  const stopped = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function assertIntegrationOperationsRoutes() {
  const policyResponse = await fetch(`${baseUrl}/api/servers/security-private`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      field_mappings: { arguments: [{ argument: "q", upstream_name: "query" }] },
      execution_policy: { max_attempts: 2, timeout_ms: 5000, base_delay_ms: 0, retry_statuses: [429, 503], retry_writes: true },
      runtime_policy: {
        allowed_actions: ["read", "draft", "write", "send", "destructive"],
        roles: { operator: { max_action_level: "read" } },
      },
    }),
  });
  const policyPayload = await policyResponse.json().catch(() => null);
  assert(policyResponse.ok && policyPayload?.server?.execution_policy?.max_attempts === 2, "server operations policy did not persist in preview", JSON.stringify(policyPayload));
  assert(policyPayload?.server?.field_mappings?.arguments?.[0]?.upstream_name === "query", "server field mapping did not persist", JSON.stringify(policyPayload));

  const contextResponse = await fetch(`${baseUrl}/api/servers/security-private`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ business_context: "Support agents may inspect customer records but must escalate billing changes." }),
  });
  const contextPayload = await contextResponse.json().catch(() => null);
  assert(contextResponse.ok, "server business context did not persist in preview", JSON.stringify(contextPayload));
  assert(contextPayload?.server?.runtime_policy?.business_context?.includes("must escalate billing changes"), "server business context was not merged into runtime policy", JSON.stringify(contextPayload));
  assert(contextPayload?.server?.runtime_policy?.allowed_actions?.includes("send"), "business context update overwrote sibling runtime policy fields", JSON.stringify(contextPayload));

  const patchResponse = await fetch(`${baseUrl}/api/servers/security-private`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runtime_policy_patch: { allowed_actions: ["read", "draft", "write", "send", "destructive"] } }),
  });
  const patchPayload = await patchResponse.json().catch(() => null);
  assert(patchResponse.ok, "runtime policy patch did not persist in preview", JSON.stringify(patchPayload));
  assert(patchPayload?.server?.runtime_policy?.business_context?.includes("must escalate billing changes"), "runtime policy patch erased business context", JSON.stringify(patchPayload));
  assert(patchPayload?.server?.runtime_policy?.roles?.operator?.max_action_level === "read", "runtime policy patch erased role restrictions", JSON.stringify(patchPayload));
  assert(patchPayload?.server?.runtime_policy?.allowed_actions?.length === 5, "runtime policy patch did not replace the requested field", JSON.stringify(patchPayload));

  const invalidToolResponse = await fetch(`${baseUrl}/api/servers/security-private`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tools_json: [{ name: "unsafe", description: "Unsafe tool", enabled: "yes" }] }),
  });
  assert(invalidToolResponse.status === 400, "non-boolean tool exposure state was accepted");

  const scopedKeyResponse = await fetch(`${baseUrl}/api/apikeys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Consumer 82", end_user_id: "customer_82", actor_role: "operator" }),
  });
  const scopedKey = await scopedKeyResponse.json().catch(() => null);
  assert(scopedKeyResponse.ok && scopedKey?.key?.end_user_id === "customer_82" && scopedKey?.key?.actor_role === "operator", "scoped API key route did not preserve identity scope", JSON.stringify(scopedKey));

  const routeChecks = [
    ["webhook-auth", "/api/webhooks", { method: "POST" }, 401],
    ["cost-auth", "/api/integration-costs", { method: "POST" }, 401],
    ["audit-storage", "/api/audit/export", {}, 503],
    ["schema-watch-auth", "/api/cron/schema-watch", {}, 401],
    ["oauth-storage", "/api/oauth/connect", { method: "POST" }, 503],
  ];
  for (const [name, path, init, expected] of routeChecks) {
    const response = await fetch(`${baseUrl}${path}`, init);
    assert(response.status === expected, `${name} guard returned ${response.status}, expected ${expected}`);
  }
  console.log("integration-operations-routes: validation-and-guards-covered");
}

async function main() {
  console.log(`base_url: ${baseUrl}`);
  await assertBundleBillingGate();
  await startServerIfNeeded();
  await assertIntegrationOperationsRoutes();

  const privatePath = "/api/mcp/security-private";
  const publicPath = "/api/mcp/security-public";
  const publicBundlePath = "/api/mcp/bundles/security-public-bundle";
  const mixedBundlePath = "/api/mcp/bundles/security-mixed-bundle";

  for (const path of [privatePath, mixedBundlePath]) {
    const mismatchedContext = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...headers(validKey), "x-astrail-end-user": "customer_attacker", "x-astrail-actor-role": "admin" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "scope-check", method: "tools/list", params: {} }),
    });
    assert(mismatchedContext.status === 403, `caller-controlled identity scope was not rejected for ${path}`);
  }
  console.log("api-key-context-scope: server-and-bundle-rejected-impersonation");

  const noKey = await rpc(privatePath, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  assert(noKey.response.status === 401 && noKey.payload?.error?.code === -32001, "private MCP without API key was not rejected", noKey.text);
  assertJsonRpcAuditTrace(noKey.payload, "invalid_or_missing_api_key", 401, noKey.text);
  console.log("private-no-key: rejected");

  const badKey = await rpc(privatePath, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, wrongKey);
  assert(badKey.response.status === 401 && badKey.payload?.error?.code === -32001, "private MCP with wrong API key was not rejected", badKey.text);
  assertJsonRpcAuditTrace(badKey.payload, "invalid_or_missing_api_key", 401, badKey.text);
  console.log("private-wrong-key: rejected");

  const valid = await rpc(privatePath, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }, validKey);
  assert(valid.response.ok && Array.isArray(valid.payload?.result?.tools), "private MCP with valid API key was not allowed", valid.text);
  const initialized = await rpc(privatePath, { jsonrpc: "2.0", id: "context-init", method: "initialize", params: {} }, validKey);
  assert(initialized.payload?.result?.instructions?.includes("must escalate billing changes"), "initialize did not deliver the configured business context", initialized.text);
  console.log("private-valid-key: allowed");

  const catalogPolicyBypass = await rpc(privatePath, {
    jsonrpc: "2.0",
    id: "catalog-policy-bypass",
    method: "tools/call",
    params: { name: "invoke_api_endpoint", arguments: { endpoint_id: "private_status", arguments: {} } },
  }, validKey);
  assert(parseToolText(catalogPolicyBypass.payload).status === "permission_denied", "invoke_api_endpoint bypassed the canonical per-tool block policy", catalogPolicyBypass.text);

  const catalogRoleBypass = await rpc(privatePath, {
    jsonrpc: "2.0",
    id: "catalog-role-bypass",
    method: "tools/call",
    params: { name: "invoke_api_endpoint", arguments: { endpoint_id: "write_probe", arguments: {} } },
  }, validKey);
  assert(parseToolText(catalogRoleBypass.payload).status === "permission_denied", "invoke_api_endpoint bypassed the caller actor-role policy", catalogRoleBypass.text);
  console.log("endpoint-catalog-policy-and-role: enforced");

  const publicList = await rpc(publicPath, { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  const publicTools = publicList.payload?.result?.tools ?? [];
  const publicText = JSON.stringify(publicList.payload);
  assert(publicList.response.ok && publicTools.some((tool) => tool.name === "public_echo"), "public tools/list did not expose public tool", publicText);
  assert(!publicTools.some((tool) => tool.name === "private_delete_everything"), "public tools/list leaked private tool", publicText);
  assert(!publicText.includes("SECRET_DO_NOT_LEAK"), "public tools/list leaked secret/config text", publicText);
  console.log("public-tools-list: filtered");

  const publicMetadata = await fetch(`${baseUrl}${publicPath}`, {
    headers: { origin: "https://security-smoke.astrail.local" },
  });
  const publicMetadataPayload = await publicMetadata.json().catch(() => null);
  const publicMetadataTools = publicMetadataPayload?.tools ?? [];
  const publicMetadataText = JSON.stringify(publicMetadataPayload);
  assert(publicMetadata.ok && publicMetadataTools.some((tool) => tool.name === "public_echo"), "public GET metadata did not expose public tool", publicMetadataText);
  assert(!publicMetadataTools.some((tool) => tool.name === "private_delete_everything"), "public GET metadata leaked private tool", publicMetadataText);
  assert(!publicMetadataText.includes("SECRET_DO_NOT_LEAK"), "public GET metadata leaked secret/config text", publicMetadataText);
  console.log("public-get-metadata: filtered");

  const publicBundleList = await rpc(publicBundlePath, { jsonrpc: "2.0", id: "bundle-list", method: "tools/list", params: {} });
  const publicBundleTools = publicBundleList.payload?.result?.tools ?? [];
  const publicBundleText = JSON.stringify(publicBundleList.payload);
  assert(
    publicBundleList.response.ok && publicBundleTools.some((tool) => tool.name.endsWith("__public_echo")),
    "public bundle tools/list did not expose public bundled tool",
    publicBundleText,
  );
  assert(
    !publicBundleTools.some((tool) => tool.name.includes("private_delete_everything")),
    "public bundle tools/list leaked private bundled tool",
    publicBundleText,
  );
  assert(!publicBundleText.includes("SECRET_DO_NOT_LEAK"), "public bundle tools/list leaked secret/config text", publicBundleText);
  console.log("public-bundle-tools-list: filtered");

  const mixedBundleNoKey = await rpc(mixedBundlePath, { jsonrpc: "2.0", id: "mixed-bundle-no-key", method: "tools/list", params: {} });
  assert(
    mixedBundleNoKey.response.status === 401 && mixedBundleNoKey.payload?.error?.code === -32001,
    "public bundle containing a private server did not require an owner API key",
    mixedBundleNoKey.text,
  );
  console.log("mixed-bundle-private-server-no-key: rejected");

  const mixedBundleList = await rpc(mixedBundlePath, { jsonrpc: "2.0", id: "mixed-bundle-list", method: "tools/list", params: {} }, validKey);
  const mixedBundleTools = mixedBundleList.payload?.result?.tools ?? [];
  const mixedBundleText = JSON.stringify(mixedBundleList.payload);
  assert(
    mixedBundleList.response.ok && mixedBundleTools.some((tool) => tool.name === "security_private_mcp_fixture__private_status"),
    "authenticated mixed bundle tools/list did not expose the private server tool",
    mixedBundleText,
  );
  assert(
    mixedBundleTools.some((tool) => tool.name === "security_public_mcp_fixture__public_echo"),
    "authenticated mixed bundle tools/list did not preserve public server tools",
    mixedBundleText,
  );
  assert(!mixedBundleText.includes("SECRET_DO_NOT_LEAK"), "authenticated mixed bundle tools/list leaked hidden public-server secret/config text", mixedBundleText);
  console.log("mixed-bundle-tools-list: auth-and-visibility-preserved");

  const sameOriginPreflight = await fetch(`${baseUrl}${publicPath}`, {
    method: "OPTIONS",
    headers: { origin: baseUrl },
  });
  assert(
    sameOriginPreflight.status === 204 && sameOriginPreflight.headers.get("access-control-allow-origin") === baseUrl,
    "exact same-origin MCP preflight was rejected",
    await sameOriginPreflight.text(),
  );
  console.log("same-origin-preflight: allowed");

  const badOrigin = await fetch(`${baseUrl}${publicPath}`, {
    method: "POST",
    headers: headers(undefined, "https://evil.example"),
    body: JSON.stringify({ jsonrpc: "2.0", id: 41, method: "tools/list", params: {} }),
  });
  const badOriginPayload = await badOrigin.json().catch(() => null);
  assert(
    badOrigin.status === 403 && badOriginPayload?.error?.code === -32003,
    "invalid MCP Origin was not rejected before route execution",
    JSON.stringify(badOriginPayload),
  );
  assertJsonRpcAuditTrace(badOriginPayload, "origin_not_allowed", 403, JSON.stringify(badOriginPayload));
  assert(badOrigin.headers.get("x-content-type-options") === "nosniff", "invalid Origin response missed nosniff header");
  assert(badOrigin.headers.get("x-frame-options") === "DENY", "invalid Origin response missed frame denial header");
  console.log("invalid-origin: rejected");

  const invalidMethod = await rpc(publicPath, { jsonrpc: "2.0", id: 5, method: "resources/list", params: {} });
  assert(invalidMethod.response.status === 404 && invalidMethod.payload?.error?.code === -32601, "invalid JSON-RPC method did not fail cleanly", invalidMethod.text);
  assertJsonRpcAuditTrace(invalidMethod.payload, "method_not_found", 404, invalidMethod.text);
  console.log("invalid-method: clean-error");

  const malformedBeforeLookup = await rpc(`/api/mcp/security-missing-${Date.now()}`, "not-a-json-rpc-object");
  assert(
    malformedBeforeLookup.response.status === 400 && malformedBeforeLookup.payload?.error?.code === -32600,
    "malformed top-level JSON-RPC was not rejected before server lookup",
    malformedBeforeLookup.text,
  );
  assertJsonRpcAuditTrace(malformedBeforeLookup.payload, "invalid_json_rpc_request", 400, malformedBeforeLookup.text);
  console.log("malformed-envelope: rejected-before-lookup");

  const invalidId = await rpc(publicPath, { jsonrpc: "2.0", id: { reflect: "no" }, method: "tools/list", params: {} });
  assert(
    invalidId.response.status === 400 && invalidId.payload?.id === null && invalidId.payload?.error?.code === -32600,
    "invalid JSON-RPC id did not fail closed with a null response id",
    invalidId.text,
  );
  assertJsonRpcAuditTrace(invalidId.payload, "invalid_json_rpc_request", 400, invalidId.text);
  assert(!invalidId.text.includes("reflect"), "invalid JSON-RPC id was reflected in response", invalidId.text);
  console.log("invalid-json-rpc-id: rejected");

  const malformedArgs = await rpc(publicPath, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "public_echo", arguments: { q: 42 } },
  });
  const malformedParsed = parseToolText(malformedArgs.payload);
  assert(
    malformedArgs.response.ok && malformedArgs.payload?.result?.isError === true && malformedParsed.status === "validation_failed",
    "malformed tools/call args did not fail validation",
    malformedArgs.text,
  );
  console.log("malformed-args: validation-error");

  const blockedTool = await rpc(publicPath, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "private_delete_everything", arguments: { confirmation: "yes" } },
  });
  const blockedParsed = parseToolText(blockedTool.payload);
  assert(blockedParsed.status === "permission_denied", "blocked method/resource did not return permission_denied", blockedTool.text);
  console.log("blocked-resource: permission_denied");

  const blockedBundleTool = await rpc(publicBundlePath, {
    jsonrpc: "2.0",
    id: "bundle-blocked",
    method: "tools/call",
    params: { name: "security_public_mcp_fixture__private_delete_everything", arguments: { confirmation: "yes" } },
  });
  const blockedBundleParsed = parseToolText(blockedBundleTool.payload);
  assert(blockedBundleParsed.status === "permission_denied", "hidden bundled tool did not return permission_denied", blockedBundleTool.text);
  console.log("public-bundle-blocked-resource: permission_denied");

  const malformedBundleArgs = await rpc(publicBundlePath, {
    jsonrpc: "2.0",
    id: "bundle-malformed",
    method: "tools/call",
    params: { name: "security_public_mcp_fixture__public_echo", arguments: { q: 42 } },
  });
  const malformedBundleParsed = parseToolText(malformedBundleArgs.payload);
  assert(
    malformedBundleArgs.response.ok && malformedBundleArgs.payload?.result?.isError === true && malformedBundleParsed.status === "validation_failed",
    "malformed bundled tools/call args did not fail validation",
    malformedBundleArgs.text,
  );
  console.log("public-bundle-malformed-args: validation-error");

  const invalidBundleId = await rpc(publicBundlePath, {
    jsonrpc: "2.0",
    id: "x".repeat(300),
    method: "tools/list",
    params: {},
  });
  assert(
    invalidBundleId.response.status === 400 && invalidBundleId.payload?.id === null && invalidBundleId.payload?.error?.code === -32600,
    "oversized bundled JSON-RPC id did not fail closed with a null response id",
    invalidBundleId.text,
  );
  assertJsonRpcAuditTrace(invalidBundleId.payload, "invalid_json_rpc_request", 400, invalidBundleId.text);
  console.log("public-bundle-invalid-json-rpc-id: rejected");

  const emptyBatch = await rpc(publicBundlePath, []);
  assert(
    emptyBatch.response.status === 400 && emptyBatch.payload?.error?.code === -32600,
    "empty JSON-RPC batch was not rejected before execution",
    emptyBatch.text,
  );
  assertJsonRpcAuditTrace(emptyBatch.payload, "empty_batch", 400, emptyBatch.text);
  console.log("json-rpc-empty-batch: rejected");

  const oversizedBatch = await rpc(publicBundlePath, Array.from({ length: 21 }, (_, index) => ({
    jsonrpc: "2.0",
    id: `batch-${index}`,
    method: "ping",
  })));
  assert(
    oversizedBatch.response.status === 413 && oversizedBatch.payload?.error?.code === -32014,
    "oversized JSON-RPC batch was not rejected before execution",
    oversizedBatch.text,
  );
  assertJsonRpcAuditTrace(oversizedBatch.payload, "batch_too_large", 413, oversizedBatch.text);
  console.log("json-rpc-batch-limit: rejected");

  const ssrf = await rpc(privatePath, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "ssrf_probe", arguments: {} },
  }, validKey);
  const ssrfParsed = parseToolText(ssrf.payload);
  assert(
    ssrfParsed.status === "permission_denied" && ssrfParsed.runtime?.error_code === "upstream_url_blocked",
    "SSRF target was not rejected before fetch",
    ssrf.text,
  );
  console.log("ssrf-target: rejected");

  const upstreamError = await rpc(privatePath, {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "credential_error", arguments: {} },
  }, validKey);
  assert(upstreamError.payload?.result?.isError === true, "upstream error fixture did not return an MCP error", upstreamError.text);
  assert(!upstreamError.text.includes(providerSecret), "upstream error leaked provider credential", upstreamError.text);
  assert(!/api_key=provider_secret/i.test(upstreamError.text), "upstream error leaked credential query", upstreamError.text);
  console.log("upstream-error-redaction: ok");

  const argumentSecret = "argument_secret_must_not_leak";
  const argumentSecretEcho = await rpcRetryingTransientUpstream(privatePath, {
    jsonrpc: "2.0",
    id: "argument-secret-echo",
    method: "tools/call",
    params: { name: "argument_secret_echo", arguments: { access_token: argumentSecret } },
  }, validKey);
  const argumentSecretParsed = parseToolText(argumentSecretEcho.payload);
  assert(argumentSecretEcho.response.ok && argumentSecretEcho.payload?.result, "argument secret fixture did not return an MCP result", argumentSecretEcho.text);
  assert(!argumentSecretEcho.text.includes(argumentSecret), "upstream response leaked sensitive tool argument", argumentSecretEcho.text);
  const echoedHeaders = argumentSecretParsed.response?.body?.headers ?? {};
  if (argumentSecretParsed.status === "success" && Object.keys(echoedHeaders).length > 0) {
    assert(
      echoedHeaders["X-Echo-Value"] === "[redacted]" || echoedHeaders["x-echo-value"] === "[redacted]",
      "echoed upstream header was not redacted",
      argumentSecretEcho.text,
    );
  }
  console.log("argument-secret-redaction: ok");

  const oversized = await fetch(`${baseUrl}/api/mcp/security-public`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "public_echo",
        arguments: { q: "x".repeat(5000) },
      },
    }),
  });
  const oversizedPayload = await oversized.json().catch(() => null);
  assert(oversized.status === 413 && oversizedPayload?.error?.code === -32013, "oversized MCP payload was not rejected at edge", JSON.stringify(oversizedPayload));
  assertJsonRpcAuditTrace(oversizedPayload, "payload_too_large", 413, JSON.stringify(oversizedPayload));
  console.log("edge-body-limit: rejected");

  const probePath = `/api/mcp/security-rate-limit-probe-${Date.now()}`;
  let edgeLimited = null;
  for (let index = 0; index < 13; index += 1) {
    const response = await fetch(`${baseUrl}${probePath}`, {
      headers: { origin: "https://security-smoke.astrail.local" },
    });
    if (response.status === 429) {
      edgeLimited = response;
      break;
    }
  }
  assert(edgeLimited?.status === 429, "MCP edge abuse guard did not return 429", edgeLimited ? `${edgeLimited.status}` : "no 429");
  assert(edgeLimited.headers.get("retry-after"), "MCP edge abuse guard did not set Retry-After");
  console.log("edge-abuse-guard: rate-limited");

  let globalEdgeLimited = null;
  const sprayBase = Date.now();
  for (let index = 0; index < 45; index += 1) {
    const response = await fetch(`${baseUrl}/api/mcp/security-random-${sprayBase}-${index}`, {
      headers: { origin: "https://security-smoke.astrail.local" },
    });
    if (response.status === 429) {
      globalEdgeLimited = response;
      break;
    }
  }
  assert(globalEdgeLimited?.status === 429, "global MCP edge guard did not catch random-serverId spray", globalEdgeLimited ? `${globalEdgeLimited.status}` : "no 429");
  assert(globalEdgeLimited.headers.get("retry-after"), "global MCP edge guard did not set Retry-After");
  console.log("edge-global-abuse-guard: rate-limited");

  console.log("PASS: hosted MCP endpoint security smoke checks passed.");
}

main()
  .catch((error) => fail(error instanceof Error ? error.message : "unknown MCP security smoke failure"))
  .finally(stopServerIfNeeded);
