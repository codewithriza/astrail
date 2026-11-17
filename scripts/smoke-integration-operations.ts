import assert from "node:assert/strict";
import { buildAuthorizeUrl, connectStateExpired, exchangeAuthorizationCode, generateConnectState, generatePkcePair } from "../lib/oauth-connect";
import { isolateBatchItem } from "../lib/runtime/batch";
import { credentialColumnSet, pickCredential, type CredentialRow } from "../lib/runtime/credential-loader";
import { executeToolFromEndpointMap } from "../lib/runtime/execute-tool";
import { claimToolExecution, idempotencyAuthorizationFingerprint, recordToolExecution, releaseToolExecutionClaim, resetIdempotencyMemoryForTests, scopeIdempotencyKey } from "../lib/runtime/idempotency";
import { normalizeExecutionPolicy, retryDelayMs } from "../lib/runtime/execution-policy";
import { applyArgumentMappings, applyResponseMappings, normalizeFieldMappings } from "../lib/runtime/field-mapping";
import { endpointActionClass, evaluateRuntimePermission } from "../lib/runtime/permissions";
import { fingerprintEndpointMap, fingerprintOpenApiSpec, preserveGeneratedToolPolicy, schemaSummaryHasChanges, summarizeSchemaChanges } from "../lib/schema-drift";
import { readBoundedRequestText, signWebhookPayload, verifyWebhookSignature, webhookEventId } from "../lib/webhook-security";
import type { McpServer, McpTool, OpenApiEndpoint } from "../lib/types";

async function main() {
  const mappings = {
    arguments: [
      { argument: "customer_id", upstream_name: "external_id" },
      { argument: "stage", upstream_name: "lifecycle", value_map: { lead: "prospect", prospect: "qualified" } },
    ],
    response: [{ field: "record.external_id", rename: "id" }],
  };
  assert.deepEqual(applyArgumentMappings(mappings, "createCustomer", { customer_id: "c-82", stage: "lead" }), {
    external_id: "c-82", lifecycle: "prospect",
  });
  assert.deepEqual(applyResponseMappings(mappings, "createCustomer", { record: { external_id: 82 } }), {
    record: { id: 82 },
  });
  assert.equal(normalizeFieldMappings({ arguments: [{ argument: "safe", upstream_name: "__proto__" }] })?.arguments?.[0]?.upstream_name, undefined);
  assert.equal(normalizeFieldMappings({ response: [{ field: "__proto__.polluted", rename: "owned" }] }), null);
  assert.deepEqual(applyResponseMappings({ response: [{ field: "__proto__.polluted", rename: "owned" }] }, "createCustomer", {}), {});
  assert.equal(({} as { owned?: unknown }).owned, undefined);

  const policy = normalizeExecutionPolicy({ max_attempts: 99, timeout_ms: 20, base_delay_ms: 9999, retry_statuses: [429, 503], retry_writes: true });
  assert(normalizeExecutionPolicy({}).retryWrites === false, "Write retries must remain opt-in for providers without native idempotency.");
  assert.equal(policy.maxAttempts, 4);
  assert.equal(policy.timeoutMs, 1000);
  assert.equal(policy.baseDelayMs, 2000);
  assert.deepEqual(Array.from(policy.retryStatuses), [429, 503]);
  assert.deepEqual(Array.from(normalizeExecutionPolicy({ retry_statuses: [400, 401, 408, 429, 500] }).retryStatuses), [408, 429, 500]);
  const defaults = normalizeExecutionPolicy();
  assert.equal(defaults.maxAttempts, 3);
  assert.equal(defaults.idempotencyHeader, "idempotency-key");
  assert.equal(retryDelayMs(defaults, 2, "1.25"), 1250);
  assert.equal(retryDelayMs(defaults, 99, "99"), 5000);

  const sendEndpoint: OpenApiEndpoint = { method: "POST", path: "/messages/send", operation_id: "sendMessage", summary: "Send message", description: null, operation_kind: "write" };
  const sendTool: McpTool = { name: "sendMessage", description: "Send a message" };
  assert.equal(endpointActionClass(sendEndpoint, sendTool), "send");
  assert.equal(evaluateRuntimePermission({ allowed_actions: ["read", "draft"] }, sendEndpoint, sendTool).allowed, false);
  assert.equal(evaluateRuntimePermission({ allowed_actions: ["send"] }, sendEndpoint, sendTool).allowed, true);
  assert.equal(evaluateRuntimePermission({ roles: { admin: { max_action_level: "destructive" } } }, sendEndpoint, sendTool, { actorRole: "unknown" }).allowed, false);
  assert.equal(evaluateRuntimePermission({ roles: { admin: { max_action_level: "destructive" } } }, sendEndpoint, sendTool).allowed, false);

  const state = generateConnectState();
  const pkce = generatePkcePair();
  const authorization = buildAuthorizeUrl({
    authorizationUrl: "https://auth.example.com/authorize", clientId: "client", scopes: ["crm.read"],
    redirectUri: "https://astrail.dev/api/oauth/callback", state, codeChallenge: pkce.challenge,
  });
  assert.equal(authorization.searchParams.get("state"), state);
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.equal(authorization.toString().includes("client_secret"), false);
  assert.equal(connectStateExpired(new Date(Date.now() + 30_000).toISOString()), false);
  assert.equal(connectStateExpired(new Date(Date.now() - 1).toISOString()), true);
  assert.equal(credentialColumnSet("connect").includes("token_auth_method"), true);
  assert.equal(credentialColumnSet("legacy").includes("token_auth_method"), false);

  const sharedOAuth = { id: "shared", auth_scheme: "oauth2", connect_status: "active", end_user_id: null } as CredentialRow;
  const aliceOAuth = { id: "alice", auth_scheme: "oauth2", connect_status: "active", end_user_id: "user_alice" } as CredentialRow;
  assert.equal(pickCredential([sharedOAuth, aliceOAuth], true, "user_alice")?.id, "alice");
  assert.equal(pickCredential([sharedOAuth, aliceOAuth], true, "user_bob"), null);
  assert.equal(pickCredential([sharedOAuth, aliceOAuth], true, null)?.id, "shared");

  const sharedApiKey = { id: "service", auth_scheme: "api_key_header", connect_status: "active", end_user_id: null } as CredentialRow;
  assert.equal(pickCredential([sharedApiKey], false, "user_bob")?.id, "service");

  let exchangeRequest: RequestInit | undefined;
  const exchange = await exchangeAuthorizationCode({
    provider: "Example", tokenUrl: "https://example.com/oauth/token", code: "code", redirectUri: "https://astrail.dev/api/oauth/callback",
    clientId: "client", clientSecret: "secret", tokenAuthMethod: "client_secret_basic", codeVerifier: pkce.verifier,
    fallbackScopes: ["crm.read"],
  }, async (_input, init) => {
    exchangeRequest = init;
    return new Response("access_token=access-82&refresh_token=refresh-82&expires_in=3600", {
      status: 200, headers: { "content-type": "application/x-www-form-urlencoded" },
    });
  });
  assert.equal(new Headers(exchangeRequest?.headers).get("authorization"), `Basic ${Buffer.from("client:secret").toString("base64")}`);
  assert.equal(String(exchangeRequest?.body).includes("client_secret"), false);
  assert.equal(exchange.accessToken, "access-82");
  assert.equal(exchange.refreshToken, "refresh-82");
  assert.deepEqual(exchange.scopes, ["crm.read"]);

  await assert.rejects(() => exchangeAuthorizationCode({
    provider: "Example", tokenUrl: "https://example.com/oauth/token", code: "bad", redirectUri: "https://astrail.dev/api/oauth/callback",
    clientId: "client", tokenAuthMethod: "client_secret_post", codeVerifier: pkce.verifier,
  }, async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Code expired." }), { status: 400 })), /Code expired/);

  const previousEndpoints: OpenApiEndpoint[] = [
    { method: "GET", path: "/customers", operation_id: "listCustomers", summary: null, description: null },
    { method: "POST", path: "/customers", operation_id: "createCustomer", summary: null, description: null },
  ];
  const currentEndpoints: OpenApiEndpoint[] = [
    { method: "GET", path: "/customers", operation_id: "listCustomers", summary: null, description: null, parameters: [{ name: "limit", in: "query" }] },
    { method: "DELETE", path: "/customers/{id}", operation_id: "deleteCustomer", summary: null, description: null },
  ];
  const schemaChanges = summarizeSchemaChanges(previousEndpoints, currentEndpoints);
  assert.deepEqual(schemaChanges, { added: ["deleteCustomer"], removed: ["createCustomer"], changed: ["listCustomers"] });
  assert.equal(schemaSummaryHasChanges(schemaChanges), true);
  assert.equal(fingerprintOpenApiSpec({ b: 2, a: 1 }), fingerprintOpenApiSpec({ a: 1, b: 2 }));
  assert.equal(fingerprintEndpointMap([{ ...previousEndpoints[0], tool_name: "generated_a" }]), fingerprintEndpointMap([{ ...previousEndpoints[0], tool_name: "generated_b" }]));
  const preserved = preserveGeneratedToolPolicy(
    [{ name: "listCustomers", description: "Custom description", policy: "approval" }],
    [{ name: "listCustomers", description: "Generated description" }],
  );
  assert.equal(preserved[0]?.description, "Custom description");
  assert.equal(preserved[0]?.policy, "approval");

  const webhookSecret = "whsec_test-secret";
  const webhookBody = JSON.stringify({ event: "created", id: 82 });
  const signature = signWebhookPayload(webhookBody, webhookSecret);
  assert.equal(verifyWebhookSignature(webhookBody, `sha256=${signature}`, webhookSecret), true);
  assert.equal(verifyWebhookSignature(`${webhookBody}x`, signature, webhookSecret), false);
  const signedEvent = signWebhookPayload(webhookBody, webhookSecret, "evt_82");
  assert.equal(verifyWebhookSignature(webhookBody, signedEvent, webhookSecret, "evt_82"), true);
  assert.equal(verifyWebhookSignature(webhookBody, signedEvent, webhookSecret, "evt_replay"), false);
  assert.equal(webhookEventId(webhookBody, "evt_82"), "evt_82");
  assert.equal(webhookEventId(webhookBody), webhookEventId(webhookBody));
  assert.equal(await readBoundedRequestText(new Request("https://astrail.dev/hook", { method: "POST", body: "12345" }), 5), "12345");
  assert.equal(await readBoundedRequestText(new Request("https://astrail.dev/hook", { method: "POST", body: "123456" }), 5), null);

  const batch = await Promise.all([1, 2, 3].map((value) => isolateBatchItem(
    async () => {
      if (value === 2) throw new Error("fixture failure");
      return { id: value, ok: true };
    },
    () => ({ id: value, ok: false }),
  )));
  assert.deepEqual(batch, [{ id: 1, ok: true }, { id: 2, ok: false }, { id: 3, ok: true }]);
  assert.notEqual(scopeIdempotencyKey("same-key", "alice", "buyer"), scopeIdempotencyKey("same-key", "bob", "buyer"));
  assert.notEqual(scopeIdempotencyKey("same-key", "alice", "buyer"), scopeIdempotencyKey("same-key", "alice", "admin"));
  assert.notEqual(scopeIdempotencyKey("same-key", null, null), scopeIdempotencyKey("same-key", "workspace", "default"));
  const oldEndpointFingerprint = idempotencyAuthorizationFingerprint({ method: "POST", path: "/orders", base_url: "https://old.example.com", operation_id: "createOrder", summary: null, description: null }, "allow", {});
  const newEndpointFingerprint = idempotencyAuthorizationFingerprint({ method: "POST", path: "/orders", base_url: "https://new.example.com", operation_id: "createOrder", summary: null, description: null }, "allow", {});
  assert.notEqual(scopeIdempotencyKey("same-key", "alice", "buyer", oldEndpointFingerprint), scopeIdempotencyKey("same-key", "alice", "buyer", newEndpointFingerprint));

  process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES = "1";
  const tool: McpTool = { name: "createOrder", description: "Create order", method: "POST", path: "/api/security-smoke/orders", input_schema: { type: "object", properties: { amount: { type: "number" } } } };
  const endpoint: OpenApiEndpoint = { method: "POST", path: "/api/security-smoke/orders", operation_id: "createOrder", tool_name: "createOrder", summary: null, description: null, base_url: "http://127.0.0.1:3000", operation_kind: "write" };
  const server = {
    id: "server", user_id: "user", name: "Orders", description: null, source_url: null, source_type: "openapi_url",
    generated_code: null, tools_json: [tool], endpoint_map: [endpoint], is_public: false, hosted_endpoint: null,
    call_count: 0, created_at: new Date().toISOString(), field_mappings: mappings,
    execution_policy: { max_attempts: 3, base_delay_ms: 0, retry_statuses: [503], retry_writes: true, idempotency_header: "Idempotency-Key" },
  } satisfies McpServer;
  const originalFetch = globalThis.fetch;
  const idempotencyKeys: string[] = [];
  const requestBodies: string[] = [];
  let calls = 0;
  resetIdempotencyMemoryForTests();
  const firstClaim = await claimToolExecution(server, tool.name, "claim-race");
  assert.equal(firstClaim.status, "claimed");
  assert.equal((await claimToolExecution(server, tool.name, "claim-race")).status, "in_progress");
  if (firstClaim.status === "claimed") await releaseToolExecutionClaim(server, tool.name, "claim-race", firstClaim.claimToken);
  const reclaimed = await claimToolExecution(server, tool.name, "claim-race");
  assert.equal(reclaimed.status, "claimed");
  if (reclaimed.status === "claimed") await releaseToolExecutionClaim(server, tool.name, "claim-race", reclaimed.claimToken);
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    const headers = new Headers(init?.headers);
    idempotencyKeys.push(headers.get("Idempotency-Key") ?? "");
    requestBodies.push(String(init?.body ?? ""));
    return calls === 1
      ? new Response(JSON.stringify({ error: "busy" }), { status: 503, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify({ id: "po_82" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const executionClaim = await claimToolExecution(server, tool.name, "po-retry-82");
    assert.equal(executionClaim.status, "claimed");
    const result = await executeToolFromEndpointMap(server, tool, { amount: 1200, stage: "lead" }, { idempotencyKey: "po-retry-82" });
    assert.equal(result.status, "success");
    assert.equal(result.attemptCount, 2);
    assert.equal(calls, 2);
    assert.ok(idempotencyKeys[0]);
    assert.equal(idempotencyKeys[0], idempotencyKeys[1]);
    assert.match(requestBodies[0] ?? "", /"lifecycle":"prospect"/);
    assert.equal((requestBodies[0] ?? "").includes("qualified"), false);
    if (executionClaim.status === "claimed") await recordToolExecution(server, tool.name, "po-retry-82", result, executionClaim.claimToken);
    assert.equal((await claimToolExecution(server, tool.name, "po-retry-82")).status, "replay");

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "busy" }), { status: 503, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const noWriteRetry = await executeToolFromEndpointMap({
      ...server,
      id: "no-write-retry",
      endpoint_map: [{ ...endpoint, base_url: "http://127.0.0.1:3101" }],
      execution_policy: { max_attempts: 4, base_delay_ms: 0, retry_statuses: [503], retry_writes: false },
    }, tool, { amount: 1 }, { idempotencyKey: "no-retry" });
    assert.equal(noWriteRetry.attemptCount, 1);
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: "custom retry" }), { status: 520, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const customStatus = await executeToolFromEndpointMap({
      ...server,
      id: "custom-status",
      endpoint_map: [{ ...endpoint, base_url: "http://127.0.0.1:3102" }],
      execution_policy: { max_attempts: 2, base_delay_ms: 0, retry_statuses: [520], retry_writes: true },
    }, tool, { amount: 1 }, { idempotencyKey: "custom-retry" });
    assert.equal(customStatus.attemptCount, 2);
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("Timeout exceeded");
    }) as typeof fetch;
    const timeoutResult = await executeToolFromEndpointMap({
      ...server,
      id: "timeout-retry",
      endpoint_map: [{ ...endpoint, base_url: "http://127.0.0.1:3103" }],
      execution_policy: { max_attempts: 2, base_delay_ms: 0, retry_statuses: [503], retry_writes: true },
    }, tool, { amount: 1 }, { idempotencyKey: "timeout-retry" });
    assert.equal(timeoutResult.attemptCount, 2);
    assert.equal(timeoutResult.errorCode, "upstream_timeout");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("Integration operations smoke passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
