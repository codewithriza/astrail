import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);

function loadTsModule(relativePath, requireMap = {}, globals = {}) {
  const source = readFileSync(join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: relativePath,
  });
  const module = { exports: {} };
  const context = vm.createContext({
    AbortSignal,
    Buffer,
    URL,
    URLSearchParams,
    console,
    fetch,
    module,
    exports: module.exports,
    process,
    require(id) {
      if (id in requireMap) return requireMap[id];
      return nodeRequire(id);
    },
    setTimeout,
    clearTimeout,
    ...globals,
  });
  vm.runInContext(outputText, context, { filename: relativePath });
  return module.exports;
}

const permissiveNetworkPolicy = {
  assertPublicHttpUrl: () => undefined,
  assertSafeUpstreamUrl: async () => undefined,
  createPinnedPublicDispatcher: async () => ({ close: async () => undefined }),
  readBoundedResponseText: async (response) => response.text(),
  isBlockedRuntimeHostname: () => false,
  NetworkPolicyError: class NetworkPolicyError extends Error {
    constructor(message) {
      super(message);
      this.code = "network_policy_blocked";
    }
  },
};

// --- Production URL, CORS, and client-response helpers -----------------------

const previousRuntimeBaseUrl = process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const previousCorsOrigins = process.env.ASTRAIL_CORS_ORIGINS;
process.env.NEXT_PUBLIC_RUNTIME_BASE_URL = "https://www.astrail.dev";
process.env.NEXT_PUBLIC_APP_URL = "https://api.astrail.dev";
process.env.ASTRAIL_CORS_ORIGINS = "https://www.astrail.dev";

const urls = loadTsModule("lib/urls.ts");
assert.equal(urls.getPublicBaseUrl(), "https://www.astrail.dev");
assert.equal(urls.resolveMcpEndpoint("srv_1", null), "https://www.astrail.dev/api/mcp/srv_1");
assert.equal(urls.resolveMcpEndpoint("srv_1", "https://api.astrail.dev/api/mcp/stale"), "https://www.astrail.dev/api/mcp/srv_1");
assert.equal(urls.resolveMcpEndpoint("srv_1", "https://customer.example/mcp"), "https://customer.example/mcp");
assert.equal(urls.resolveBundleEndpoint("bundle_1", "https://api.astrail.dev/api/mcp/bundles/stale"), "https://www.astrail.dev/api/mcp/bundles/bundle_1");

const corsOrigins = loadTsModule("lib/cors-origins.ts").configuredCorsOrigins();
assert(corsOrigins.includes("https://www.astrail.dev"));
assert(corsOrigins.includes("https://astrail.dev"));

const clientJson = loadTsModule("lib/client-json.ts");
assert.equal(Object.keys(await clientJson.readJsonResponse(new Response("", { status: 200 }))).length, 0);
await assert.rejects(
  () => clientJson.readJsonResponse(new Response("", { status: 503 })),
  /HTTP 503 without a response body/,
);
await assert.rejects(
  () => clientJson.readJsonResponse(new Response("not-json", { status: 502 })),
  /unreadable response \(HTTP 502\)/,
);

if (previousRuntimeBaseUrl === undefined) delete process.env.NEXT_PUBLIC_RUNTIME_BASE_URL;
else process.env.NEXT_PUBLIC_RUNTIME_BASE_URL = previousRuntimeBaseUrl;
if (previousAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
else process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
if (previousCorsOrigins === undefined) delete process.env.ASTRAIL_CORS_ORIGINS;
else process.env.ASTRAIL_CORS_ORIGINS = previousCorsOrigins;

// --- Field mapping -----------------------------------------------------------

const fieldMapping = loadTsModule("lib/runtime/field-mapping.ts");

const mappings = fieldMapping.normalizeFieldMappings({
  arguments: [
    { argument: "customer_email", upstream_name: "email" },
    { argument: "stage", value_map: { qualified: "05_QUALIFIED", won: "09_WON" } },
    { argument: "region", default: "emea" },
    { argument: "internal_note", drop: true },
    { tool: "other_tool", argument: "customer_email", upstream_name: "wrong" },
    { argument: "" },
  ],
  response: [
    { field: "contacts.cust_id", rename: "id" },
    { field: "internal_score", drop: true },
  ],
});
assert.equal(mappings.arguments.length, 5);
assert.equal(mappings.response.length, 2);

const mappedArgs = fieldMapping.applyArgumentMappings(mappings, "create_contact", {
  customer_email: "a@b.co",
  stage: "qualified",
  internal_note: "secret plan",
});
assert.equal(mappedArgs.email, "a@b.co");
assert.equal("customer_email" in mappedArgs, false);
assert.equal(mappedArgs.stage, "05_QUALIFIED");
assert.equal(mappedArgs.region, "emea");
assert.equal("internal_note" in mappedArgs, false);

const mappedResponse = fieldMapping.applyResponseMappings(mappings, "create_contact", {
  contacts: [{ cust_id: 7, name: "Ada" }],
  internal_score: 0.4,
});
assert.equal(mappedResponse.contacts[0].id, 7);
assert.equal("cust_id" in mappedResponse.contacts[0], false);
assert.equal("internal_score" in mappedResponse, false);
assert.equal(fieldMapping.normalizeFieldMappings({ arguments: [{ argument: "" }] }), null);

// --- Circuit breaker ---------------------------------------------------------

const circuitBreaker = loadTsModule("lib/runtime/circuit-breaker.ts");
circuitBreaker.resetUpstreamCircuitsForTests();

const t0 = 1_000_000;
for (let i = 0; i < 4; i += 1) circuitBreaker.reportUpstreamFailure("api.weird-crm.example", t0);
assert.equal(circuitBreaker.checkUpstreamCircuit("api.weird-crm.example", t0).allowed, true);
circuitBreaker.reportUpstreamFailure("api.weird-crm.example", t0);
const open = circuitBreaker.checkUpstreamCircuit("api.weird-crm.example", t0 + 1_000);
assert.equal(open.allowed, false);
assert.ok(open.retryAtMs > t0);
const probe = circuitBreaker.checkUpstreamCircuit("api.weird-crm.example", t0 + 31_000);
assert.equal(probe.allowed, true);
assert.equal(probe.halfOpenProbe, true);
assert.equal(circuitBreaker.checkUpstreamCircuit("api.weird-crm.example", t0 + 31_001).allowed, false);
circuitBreaker.reportUpstreamSuccess("api.weird-crm.example", t0 + 31_100);
assert.equal(circuitBreaker.checkUpstreamCircuit("api.weird-crm.example", t0 + 31_200).allowed, true);
circuitBreaker.resetUpstreamCircuitsForTests();

// --- Idempotency (memory fallback) ------------------------------------------

const idempotency = loadTsModule("lib/runtime/idempotency.ts", {
  "../neon/server": {
    createAdminClient: () => { throw new Error("no Neon Data API in smoke"); },
    hasServiceRoleKey: () => false,
  },
});
const unavailableIdempotency = loadTsModule("lib/runtime/idempotency.ts", {
  "../neon/server": {
    createAdminClient: () => ({ rpc: async () => ({ data: null, error: { message: "database unavailable" } }) }),
    hasServiceRoleKey: () => true,
  },
});
assert.equal((await unavailableIdempotency.claimToolExecution({ id: "srv_1", user_id: "user_1" }, "create_contact", "must-not-run")).status, "unavailable");

assert.equal(idempotency.extractIdempotencyKey({ idempotency_key: " ord_42 " }), "ord_42");
assert.equal(idempotency.extractIdempotencyKey({ idempotencyKey: "k2" }), "k2");
assert.equal(idempotency.extractIdempotencyKey({}), null);
assert.equal(idempotency.extractIdempotencyKey({ idempotency_key: "x".repeat(300) }), null);

const dedupServer = { id: "srv_1", user_id: "user_1" };
const successExecution = {
  status: "success",
  traceId: "agt_original",
  mcpResult: { content: [{ type: "text", text: JSON.stringify({ status: "success", created: "contact_9" }) }] },
};
const successClaim = await idempotency.claimToolExecution(dedupServer, "create_contact", "ord_42");
assert.equal(successClaim.status, "claimed");
await idempotency.recordToolExecution(dedupServer, "create_contact", "ord_42", successExecution, successClaim.claimToken);
const failedClaim = await idempotency.claimToolExecution(dedupServer, "create_contact", "failed_key");
assert.equal(failedClaim.status, "claimed");
await idempotency.releaseToolExecutionClaim(dedupServer, "create_contact", "failed_key", failedClaim.claimToken);
const recorded = await idempotency.findRecordedToolExecution(dedupServer, "create_contact", "ord_42");
assert.ok(recorded);
assert.equal(recorded.traceId, "agt_original");
assert.equal(await idempotency.findRecordedToolExecution(dedupServer, "create_contact", "failed_key"), null);
assert.equal(await idempotency.findRecordedToolExecution(dedupServer, "other_tool", "ord_42"), null);

const oversizedClaim = await idempotency.claimToolExecution(dedupServer, "create_contact", "large_result");
assert.equal(oversizedClaim.status, "claimed");
await idempotency.recordToolExecution(dedupServer, "create_contact", "large_result", {
  ...successExecution,
  mcpResult: { content: [{ type: "text", text: "x".repeat(100_001) }] },
}, oversizedClaim.claimToken);
assert.equal((await idempotency.claimToolExecution(dedupServer, "create_contact", "large_result")).status, "replay");

const replay = idempotency.replayedExecutionResult("create_contact", "ord_42", recorded);
assert.equal(replay.status, "success");
const replayPayload = JSON.parse(replay.mcpResult.content[0].text);
assert.equal(replayPayload.replayed, true);
assert.equal(replayPayload.idempotency.original_trace_id, "agt_original");
assert.equal(replayPayload.original_result.created, "contact_9");

// --- Schema diff + carry-over ------------------------------------------------

const schemaDiff = loadTsModule("lib/runtime/schema-diff.ts");

const previousTools = [
  { name: "list_contacts", description: "List contacts", method: "GET", path: "/contacts", input_schema: { type: "object", properties: { limit: { type: "integer" } } }, policy: "allow" },
  { name: "create_contact", description: "Create", method: "POST", path: "/contacts", input_schema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] }, policy: "approval", visibility: "private" },
  { name: "legacy_export", description: "Old", method: "GET", path: "/export", input_schema: { type: "object", properties: {} } },
];
const nextTools = [
  { name: "list_contacts", description: "List contacts", method: "GET", path: "/contacts", input_schema: { type: "object", properties: { limit: { type: "integer" } } } },
  { name: "create_contact", description: "Create", method: "POST", path: "/contacts", input_schema: { type: "object", properties: { email: { type: "string" }, team_id: { type: "string" } }, required: ["email", "team_id"] } },
  { name: "delete_contact", description: "Delete", method: "DELETE", path: "/contacts/{id}", input_schema: { type: "object", properties: { id: { type: "string" } } } },
];

const diff = schemaDiff.diffToolSchemas(previousTools, nextTools);
assert.deepEqual(diff.added, ["delete_contact"]);
assert.deepEqual(diff.removed, ["legacy_export"]);
assert.equal(diff.changed.length, 1);
assert.equal(diff.changed[0].name, "create_contact");
assert.equal(diff.changed[0].breaking, true);
assert.equal(diff.unchanged, 1);
assert.equal(diff.breaking, true);
assert.match(diff.summary, /breaking/i);

const carried = schemaDiff.carryOverToolConfiguration(previousTools, nextTools);
assert.equal(carried.find((tool) => tool.name === "create_contact").policy, "approval");
assert.equal(carried.find((tool) => tool.name === "create_contact").visibility, "private");
assert.equal(carried.find((tool) => tool.name === "delete_contact").policy, undefined);

// --- Action levels -----------------------------------------------------------

const toolProfile = loadTsModule("lib/agent-tool-profile.ts");

assert.equal(toolProfile.toolActionLevel({ name: "list_contacts", method: "GET" }), "read");
assert.equal(toolProfile.toolActionLevel({ name: "create_draft_email", method: "POST" }), "draft");
assert.equal(toolProfile.toolActionLevel({ name: "send_email", method: "POST" }), "send");
assert.equal(toolProfile.toolActionLevel({ name: "update_contact", method: "PATCH" }), "write");
assert.equal(toolProfile.toolActionLevel({ name: "delete_contact", method: "DELETE" }), "destructive");
assert.equal(toolProfile.toolActionLevel({ name: "update_contact", method: "PATCH", metadata: { action_level: "send" } }), "send");

// --- Role permissions ----------------------------------------------------------

const permissions = loadTsModule("lib/runtime/permissions.ts", {
  "../agent-tool-profile": toolProfile,
});

const rolePolicy = {
  roles: {
    support: { max_action_level: "draft" },
    default: { max_action_level: "read" },
    ops: { blocked_tools: ["delete_contact"] },
  },
};
const writeEndpoint = { method: "POST", path: "/contacts", operation_id: "create_contact", parameters: [] };
const readEndpoint = { method: "GET", path: "/contacts", operation_id: "list_contacts", parameters: [] };
const writeTool = { name: "create_contact", description: "Create", method: "POST", path: "/contacts" };
const readTool = { name: "list_contacts", description: "List", method: "GET", path: "/contacts" };

const deniedWrite = permissions.evaluateRuntimePermission(rolePolicy, writeEndpoint, writeTool, { actorRole: "support" });
assert.equal(deniedWrite.allowed, false);
assert.match(deniedWrite.reason, /support.*draft/i);
assert.equal(permissions.evaluateRuntimePermission(rolePolicy, readEndpoint, readTool, { actorRole: "support" }).allowed, true);
const deniedDefault = permissions.evaluateRuntimePermission(rolePolicy, writeEndpoint, writeTool, {});
assert.equal(deniedDefault.allowed, false);
const deniedBlockedTool = permissions.evaluateRuntimePermission(
  rolePolicy,
  { ...writeEndpoint, method: "DELETE", operation_id: "delete_contact" },
  { ...writeTool, name: "delete_contact", method: "DELETE" },
  { actorRole: "ops" }
);
assert.equal(deniedBlockedTool.allowed, false);
assert.equal(permissions.normalizeActorRole("  Support "), "support");
assert.equal(permissions.normalizeActorRole(""), null);

// --- OAuth refresh: permanence + single-flight --------------------------------

const credentials = loadTsModule("lib/credentials.ts", {
  "@/lib/runtime/network-policy": permissiveNetworkPolicy,
});

await assert.rejects(
  credentials.refreshOAuthAccessToken({
    provider: "hubspot",
    tokenUrl: "https://example.com/oauth/token",
    refreshToken: "revoked_token",
  }, async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "refresh token revoked" }), { status: 400 })),
  (error) => {
    assert.equal(error.name, "OAuthRefreshError");
    assert.equal(error.permanent, true);
    assert.equal(error.oauthErrorCode, "invalid_grant");
    return true;
  }
);

await assert.rejects(
  credentials.refreshOAuthAccessToken({
    provider: "hubspot",
    tokenUrl: "https://example.com/oauth/token",
    refreshToken: "fine_token",
  }, async () => new Response(JSON.stringify({ error: "temporarily_unavailable" }), { status: 503 })),
  (error) => {
    assert.equal(error.permanent, false);
    return true;
  }
);

let refreshFetchCount = 0;
const singleFlightFetcher = async () => {
  refreshFetchCount += 1;
  await new Promise((resolve) => setTimeout(resolve, 25));
  return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 });
};
const refreshInput = { provider: "hubspot", tokenUrl: "https://example.com/oauth/token", refreshToken: "r1" };
const [first, second] = await Promise.all([
  credentials.refreshOAuthAccessTokenSingleFlight("cred_1", refreshInput, singleFlightFetcher),
  credentials.refreshOAuthAccessTokenSingleFlight("cred_1", refreshInput, singleFlightFetcher),
]);
assert.equal(refreshFetchCount, 1);
assert.equal(first.accessToken, "fresh");
assert.equal(second.accessToken, "fresh");

// --- Human audit summary -------------------------------------------------------

const observability = loadTsModule("lib/runtime/observability.ts");
const summary = observability.humanToolCallSummary({
  toolName: "create_contact",
  status: "success",
  method: "POST",
  path: "/contacts",
  latencyMs: 321,
  attemptCount: 2,
  endUserId: "u_42",
  actorRole: "support",
});
assert.match(summary, /End user "u_42"/);
assert.match(summary, /acting as "support"/);
assert.match(summary, /succeeded in 321ms after 2 attempts/);
const blockedSummary = observability.humanToolCallSummary({
  toolName: "send_email",
  status: "approval_required",
  errorCode: "human_approval_required",
});
assert.match(blockedSummary, /blocked before upstream execution \(human_approval_required\)/);

// --- execute-tool integration: mapping, retries, circuit, reauth ----------------

const responseCache = loadTsModule("lib/runtime/response-cache.ts");
const executionPolicy = loadTsModule("lib/runtime/execution-policy.ts");
const oauthSecurity = loadTsModule("lib/runtime/oauth-security.ts");

function buildRuntime(fetchImpl, networkPolicy = permissiveNetworkPolicy) {
  responseCache.clearResponseCacheForTesting();
  return loadTsModule("lib/runtime/execute-tool.ts", {
    "@/lib/mcp-proxy": { callRemoteMcpTool: async () => { throw new Error("not used"); } },
    "@/lib/runtime/network-policy": networkPolicy,
    "@/lib/runtime/response-cache": responseCache,
    "@/lib/runtime/playwright-website": { executeWebsiteReadWithPlaywright: async () => { throw new Error("not used"); } },
    "@/lib/runtime/permissions": permissions,
    "@/lib/runtime/oauth-security": oauthSecurity,
    "@/lib/runtime/circuit-breaker": circuitBreaker,
    "@/lib/runtime/field-mapping": fieldMapping,
    "@/lib/runtime/execution-policy": executionPolicy,
    "@/lib/runtime/reliability-control-plane": {
      acquireReliabilityPermit: async () => ({ allowed: true, reason: "ready", retryAt: null, queuedMs: 0 }),
      consumeProviderRetryBudget: async () => true,
      recordProviderOutcome: async () => {},
      recordReliabilityMetric: async () => {},
    },
    "@/lib/runtime/x402": {
      prepareX402Payment: async () => ({ status: "denied", code: "not_used", reason: "not used" }),
      inspectX402PaymentRequired: () => null,
      finalizeX402Receipt: async () => null,
    },
  }, { fetch: fetchImpl });
}

function testServer(overrides = {}) {
  return {
    id: "srv_hardening",
    user_id: "user_1",
    name: "Hardening Test Server",
    description: "test",
    source_url: null,
    source_type: "openapi_url",
    generated_code: null,
    tools_json: [
      { name: "list_contacts", description: "List contacts", input_schema: { type: "object", properties: {} }, method: "GET", path: "/contacts" },
      { name: "create_contact", description: "Create a contact", input_schema: { type: "object", properties: {} }, method: "POST", path: "/contacts" },
    ],
    endpoint_map: [
      { method: "GET", path: "/contacts", base_url: "https://example.com", tool_name: "list_contacts", operation_id: "list_contacts", summary: "list", description: "list", parameters: [], requires_auth: false },
      { method: "POST", path: "/contacts", base_url: "https://example.com", tool_name: "create_contact", operation_id: "create_contact", summary: "create", description: "create", parameters: [], requires_auth: false },
    ],
    hosted_endpoint: null,
    is_public: false,
    call_count: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Argument mapping is applied before the upstream request is built.
let capturedUrl = null;
const mappingRuntime = buildRuntime(async (url) => {
  capturedUrl = new URL(url);
  return new Response(JSON.stringify({ contacts: [{ cust_id: 3 }], internal_score: 1 }), { status: 200, headers: { "content-type": "application/json" } });
});
const mappingServer = testServer({ field_mappings: mappings });
const mappedExecution = await mappingRuntime.executeToolFromEndpointMap(mappingServer, mappingServer.tools_json[0], { customer_email: "a@b.co" });
assert.equal(mappedExecution.status, "success");
assert.equal(capturedUrl.searchParams.get("email"), "a@b.co");
assert.equal(capturedUrl.searchParams.get("customer_email"), null);
const mappedPayload = JSON.parse(mappedExecution.mcpResult.content[0].text);
assert.equal(mappedPayload.response.body.contacts[0].id, 3);
assert.equal("internal_score" in mappedPayload.response.body, false);

// Writes retry only when an idempotency key rides along, and the key is
// forwarded upstream as an idempotency-key header.
circuitBreaker.resetUpstreamCircuitsForTests();
let writeAttempts = 0;
let capturedHeaders = null;
let pinnedDispatcherCloses = 0;
const retryNetworkPolicy = {
  ...permissiveNetworkPolicy,
  createPinnedPublicDispatcher: async () => ({
    close: async () => {
      pinnedDispatcherCloses += 1;
    },
  }),
};
const retryRuntime = buildRuntime(async (_url, init) => {
  writeAttempts += 1;
  capturedHeaders = init.headers;
  if (writeAttempts === 1) return new Response("upstream hiccup", { status: 503 });
  return new Response(JSON.stringify({ created: true }), { status: 200, headers: { "content-type": "application/json" } });
}, retryNetworkPolicy);
const retryServer = testServer({ execution_policy: { retry_writes: true } });
const retried = await retryRuntime.executeToolFromEndpointMap(retryServer, retryServer.tools_json[1], { name: "Ada" }, { idempotencyKey: "ord_42" });
assert.equal(retried.status, "success");
assert.equal(retried.attemptCount, 2);
assert.equal(capturedHeaders["idempotency-key"], "ord_42");
assert.equal(pinnedDispatcherCloses, 2, "every retry attempt must close its pinned dispatcher");

const insecureServer = testServer({
  endpoint_map: [{
    ...testServer().endpoint_map[0],
    base_url: "http://example.com",
    requires_auth: true,
    security_requirements: [{ bearerAuth: [] }],
  }],
});
const insecureRuntime = buildRuntime(async () => {
  throw new Error("plaintext authenticated upstream must not be called");
});
const insecureExecution = await insecureRuntime.executeToolFromEndpointMap(
  insecureServer,
  insecureServer.tools_json[0],
  {},
  { credential: { scheme: "bearer", secret: "provider_secret" } },
);
assert.equal(insecureExecution.status, "permission_denied");
assert.equal(insecureExecution.errorCode, "upstream_tls_required");

circuitBreaker.resetUpstreamCircuitsForTests();
writeAttempts = 0;
const noRetryRuntime = buildRuntime(async () => {
  writeAttempts += 1;
  return new Response("upstream hiccup", { status: 503 });
});
const notRetried = await noRetryRuntime.executeToolFromEndpointMap(retryServer, retryServer.tools_json[1], { name: "Ada" });
assert.equal(notRetried.status, "error");
assert.equal(writeAttempts, 1);

// A repeatedly failing upstream opens the circuit and fails fast.
circuitBreaker.resetUpstreamCircuitsForTests();
for (let i = 0; i < 5; i += 1) circuitBreaker.reportUpstreamFailure("srv_hardening:example.com");
const circuitRuntime = buildRuntime(async () => { throw new Error("should not reach upstream while circuit is open"); });
const circuitBlocked = await circuitRuntime.executeToolFromEndpointMap(retryServer, retryServer.tools_json[0], {});
assert.equal(circuitBlocked.status, "error");
assert.equal(circuitBlocked.errorCode, "upstream_circuit_open");
assert.match(JSON.parse(circuitBlocked.mcpResult.content[0].text).note, /circuit breaker/i);
circuitBreaker.resetUpstreamCircuitsForTests();

// A dead OAuth grant is distinguishable from a missing credential.
const oauthServer = testServer({
  endpoint_map: [{
    method: "GET",
    path: "/contacts",
    base_url: "https://example.com",
    tool_name: "list_contacts",
    operation_id: "list_contacts",
    summary: "list",
    description: "list",
    parameters: [],
    requires_auth: true,
    security_requirements: [{ oauth2: ["contacts.read"] }],
  }],
});
const reauthRuntime = buildRuntime(async () => { throw new Error("not used"); });
const reauth = await reauthRuntime.executeToolFromEndpointMap(oauthServer, oauthServer.tools_json[0], {}, {
  credentialFailure: { code: "reauth_required", provider: "hubspot", message: "HubSpot rejected the stored refresh token (invalid_grant)." },
});
assert.equal(reauth.status, "oauth_required");
assert.equal(reauth.errorCode, "oauth_reauth_required");
const reauthPayload = JSON.parse(reauth.mcpResult.content[0].text);
assert.equal(reauthPayload.credential_failure.code, "reauth_required");
assert.match(reauthPayload.note, /reconnect/i);

// A role scope denies over-privileged calls before upstream execution.
const roleServer = testServer({ runtime_policy: { roles: { support: { max_action_level: "read" } } } });
const roleRuntime = buildRuntime(async () => { throw new Error("should not reach upstream when role denies"); });
const roleDenied = await roleRuntime.executeToolFromEndpointMap(roleServer, roleServer.tools_json[1], { name: "Ada" }, { actorRole: "support" });
assert.equal(roleDenied.status, "permission_denied");
assert.match(roleDenied.error, /support/i);

console.log("PASS: field mapping, circuit breaker, idempotent replay + write retries, schema diff/carry-over, action-level roles, OAuth reauth signaling, and human audit summaries are covered.");
