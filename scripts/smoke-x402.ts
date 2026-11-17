import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { encodePaymentRequiredHeader, encodePaymentResponseHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { executeToolFromEndpointMap } from "../lib/runtime/execute-tool";
import {
  decodeX402PaymentRequired,
  decodeX402PaymentSignature,
  eligibleX402Domains,
  evaluateX402Requirement,
  finalizeX402Receipt,
  inspectX402PaymentRequired,
  normalizeX402Policy,
  prepareX402Payment,
  recordX402Challenge,
  sameX402Requirement,
  splitX402ApprovalContext,
  withX402ApprovalContext,
} from "../lib/runtime/x402";
import type { McpServer, McpTool } from "../lib/types";

async function main() {
  const target = new URL("https://paid.example.com/weather");
  const requirement = {
    scheme: "exact",
    network: "eip155:8453" as const,
    asset: "0xUSDT",
    amount: "1000000",
    payTo: "0xmerchant",
    maxTimeoutSeconds: 60,
    extra: {},
  };
  const paymentRequired = {
    x402Version: 2 as const,
    resource: { url: target.toString(), description: "Paid weather", mimeType: "application/json" },
    accepts: [requirement],
  };
  const requiredHeader = encodePaymentRequiredHeader(paymentRequired);
  const decodedRequired = decodeX402PaymentRequired(requiredHeader);
  assert.equal(decodedRequired?.requirements[0]?.network, "eip155:8453");
  assert.equal(decodedRequired?.requirements[0]?.amount, "1000000");

  const policy = normalizeX402Policy({
    enabled: true,
    allowed_networks: ["eip155:8453", "solana:mainnet"],
    allowed_assets: ["0xUSDT"],
    max_amount_per_call: "2000000",
    daily_limit: "10000000",
    approval_threshold: "1500000",
  });
  assert.equal(evaluateX402Requirement(decodedRequired!.requirements[0], target, policy).allowed, true);
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], amount: "2000001" }, target, policy).code, "x402_per_call_limit");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], network: "eip155:1" }, target, policy).code, "x402_network_blocked");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], asset: "0xOTHER" }, target, policy).code, "x402_asset_blocked");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], scheme: "upto" }, target, policy).code, "x402_scheme_blocked");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], resource: null }, target, policy).code, "x402_resource_missing");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], resource: "https://paid.example.com/weather?api_key=secret" }, new URL("https://paid.example.com/weather?api_key=secret"), policy).code, "x402_sensitive_resource");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], resource: "https://evil.example/charge" }, target, policy).code, "x402_resource_mismatch");
  assert.equal(evaluateX402Requirement({ ...decodedRequired!.requirements[0], resource: "https://paid.example.com/weather?account=other" }, target, policy).code, "x402_resource_mismatch");
  assert.equal(normalizeX402Policy({ enabled: true }).allowedNetworks.join(","), "eip155:8453,solana:mainnet");
  assert.equal(evaluateX402Requirement(decodedRequired!.requirements[0], target, normalizeX402Policy({ enabled: true })).code, "x402_spend_policy_required");
  assert.equal(evaluateX402Requirement(decodedRequired!.requirements[0], target, normalizeX402Policy({ enabled: true, max_amount_per_call: "1", daily_limit: "1" })).code, "x402_asset_allowlist_required");
  assert.equal(normalizeX402Policy({ enabled: false }).allowedNetworks.length, 0);

  const response = new Response(JSON.stringify(paymentRequired), { status: 402, headers: { "PAYMENT-REQUIRED": requiredHeader } });
  const discovered = inspectX402PaymentRequired(response, paymentRequired, target, {
    enabled: true,
    allowed_networks: ["eip155:8453"],
    allowed_assets: ["0xUSDT"],
    max_amount_per_call: "2000000",
    daily_limit: "10000000",
    approval_threshold: "1000000",
  });
  assert.equal(discovered?.status, "approval_required");
  assert.equal(inspectX402PaymentRequired(new Response("bad", { status: 402 }), "bad", target, { enabled: true })?.status, "denied");

  const signaturePayload = {
    x402Version: 2 as const,
    resource: paymentRequired.resource,
    accepted: requirement,
    payload: { signature: "0xsigned-by-end-user" },
  };
  const signature = encodePaymentSignatureHeader(signaturePayload);
  const reorderedSignature = encodePaymentSignatureHeader({
    payload: signaturePayload.payload,
    accepted: signaturePayload.accepted,
    resource: signaturePayload.resource,
    x402Version: signaturePayload.x402Version,
  });
  assert.notEqual(signature, reorderedSignature);
  const decodedSignature = decodeX402PaymentSignature(signature);
  assert.equal(sameX402Requirement(decodedRequired!.requirements[0], decodedSignature), true);
  assert.equal(decodeX402PaymentSignature("not-base64"), null);

  const stored = withX402ApprovalContext({ city: "Delhi" }, decodedSignature!);
  const split = splitX402ApprovalContext(stored);
  assert.deepEqual(split.args, { city: "Delhi" });
  assert.equal(split.hadContext, true);
  assert.equal(sameX402Requirement(split.requirement, decodedSignature), true);
  assert.equal(sameX402Requirement({ ...split.requirement!, resource: "https://paid.example.com/other" }, decodedSignature), false);
  assert.equal(sameX402Requirement({ ...split.requirement!, asset: "0xusdt" }, decodedSignature), false);

  process.env.ASTRAIL_ENABLE_LOCAL_SECURITY_FIXTURES = "1";
  const runtimeTarget = "http://127.0.0.1:43210/api/security-smoke/paid";
  const runtimeRequirement = { ...requirement, amount: "250000", network: "eip155:8453" as const };
  const runtimeRequired = {
    x402Version: 2 as const,
    resource: { url: runtimeTarget },
    accepts: [runtimeRequirement],
  };
  const runtimeSignature = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: runtimeRequired.resource,
    accepted: runtimeRequirement,
    payload: { signature: "0xruntime-user-signature" },
  });
  const runtimeServer = {
    id: "local-x402",
    user_id: "local-demo-user",
    name: "x402 fixture",
    description: null,
    source_url: null,
    source_type: "openapi_url",
    generated_code: null,
    tools_json: [],
    endpoint_map: [{ method: "GET", path: "/api/security-smoke/paid", base_url: "http://127.0.0.1:43210", tool_name: "paidWeather", operation_id: "paidWeather", summary: null, description: null }],
    runtime_policy: { x402: { enabled: true, allowed_networks: ["eip155:8453"], allowed_assets: ["0xUSDT"], max_amount_per_call: "1000000", daily_limit: "10000000", require_domain_verification: true } },
    is_public: false,
    hosted_endpoint: "/api/mcp/local-x402",
    call_count: 0,
    created_at: new Date().toISOString(),
  } as McpServer;
  const runtimeTool = { name: "paidWeather", description: "Paid weather", method: "GET", path: "/api/security-smoke/paid", input_schema: { type: "object", properties: {} } } as McpTool;
  const approvalServer = {
    ...runtimeServer,
    id: "local-x402-approval",
    runtime_policy: { x402: { ...runtimeServer.runtime_policy?.x402, approval_threshold: "200000" } },
  } as McpServer;
  assert.equal((await recordX402Challenge({
    server: runtimeServer,
    tool: runtimeTool,
    endUserId: "customer_tamper",
    requirement: decodeX402PaymentSignature(runtimeSignature)!,
  })).ok, true);
  const editedWrapperSignature = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: runtimeRequired.resource,
    accepted: { ...runtimeRequirement, amount: "249999" },
    payload: { signature: "0xruntime-user-signature" },
  });
  const editedWrapper = await prepareX402Payment({
    server: runtimeServer,
    tool: runtimeTool,
    target: new URL(runtimeTarget),
    signature: editedWrapperSignature,
    endUserId: "customer_tamper",
    traceId: "trace_tamper",
  });
  assert.equal(editedWrapper.status, "denied");
  assert.equal(editedWrapper.status === "denied" ? editedWrapper.code : null, "x402_challenge_mismatch");
  const approvalPrepared = await prepareX402Payment({
    server: approvalServer,
    tool: runtimeTool,
    target: new URL(runtimeTarget),
    signature: runtimeSignature,
    endUserId: "customer_82",
    traceId: "trace_approval",
  });
  assert.equal(approvalPrepared.status, "approval_required");
  assert.equal((await prepareX402Payment({ server: runtimeServer, tool: runtimeTool, target: new URL(runtimeTarget), signature: runtimeSignature, endUserId: null, traceId: "trace_no_user" })).status, "denied");
  assert.equal((await prepareX402Payment({ server: runtimeServer, tool: runtimeTool, target: new URL(runtimeTarget), signature: "invalid", endUserId: "customer_82", traceId: "trace_invalid" })).status, "denied");
  assert.equal((await prepareX402Payment({ server: { ...runtimeServer, runtime_policy: {} }, tool: runtimeTool, target: new URL(runtimeTarget), signature: runtimeSignature, endUserId: "customer_82", traceId: "trace_disabled" })).status, "denied");
  const originalFetch = globalThis.fetch;
  let forwardedSignature: string | null = null;
  let paidRedirectMode: RequestRedirect | null = null;
  let fetchCalls = 0;
  globalThis.fetch = async (_input, init) => {
    fetchCalls += 1;
    const headers = new Headers(init?.headers);
    forwardedSignature = headers.get("payment-signature");
    if (!forwardedSignature) {
      return new Response(JSON.stringify(runtimeRequired), { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(runtimeRequired) } });
    }
    paidRedirectMode = init?.redirect ?? null;
    return new Response(JSON.stringify({ temperature: 31 }), {
      status: 200,
      headers: { "content-type": "application/json", "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: true, transaction: `0x${"a".repeat(64)}`, network: "eip155:8453" }) },
    });
  };
  try {
    const first = await executeToolFromEndpointMap(runtimeServer, runtimeTool, {}, { x402EndUserId: "customer_82" });
    assert.equal(first.status, "payment_required");
    assert.equal(first.errorCode, "x402_payment_required");
    const paid = await executeToolFromEndpointMap(runtimeServer, runtimeTool, {}, {
      x402PaymentSignature: runtimeSignature,
      x402EndUserId: "customer_82",
    });
    assert.equal(paid.status, "success");
    assert.equal(paid.executionMode, "x402_payment");
    assert.equal(forwardedSignature, runtimeSignature);
    assert.equal(paidRedirectMode, "manual");

    const maliciousRequirement = { ...runtimeRequirement, amount: "270000" };
    const maliciousSignature = encodePaymentSignatureHeader({ x402Version: 2, resource: runtimeRequired.resource, accepted: maliciousRequirement, payload: { signature: "0xmalicious-settlement-test" } });
    assert.equal((await recordX402Challenge({
      server: runtimeServer,
      tool: runtimeTool,
      endUserId: "customer_settlement",
      requirement: decodeX402PaymentSignature(maliciousSignature)!,
    })).ok, true);
    const maliciousPrepared = await prepareX402Payment({
      server: runtimeServer,
      tool: runtimeTool,
      target: new URL(runtimeTarget),
      signature: maliciousSignature,
      endUserId: "customer_settlement",
      traceId: "trace_malicious_settlement",
    });
    assert.equal(maliciousPrepared.status, "ready");
    if (maliciousPrepared.status === "ready") {
      const maliciousReceipt = await finalizeX402Receipt(maliciousPrepared.payment, new Response("ok", {
        status: 200,
        headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader({ success: true, transaction: maliciousSignature, network: "eip155:8453", payment_signature: maliciousSignature } as unknown as Parameters<typeof encodePaymentResponseHeader>[0]) },
      }));
      assert.equal(maliciousReceipt.status, "in_doubt");
      assert.equal(maliciousReceipt.settlement, null);
    }
    const callsBeforeReplay = fetchCalls;
    const replay = await executeToolFromEndpointMap(runtimeServer, runtimeTool, {}, {
      x402PaymentSignature: encodePaymentSignatureHeader({
        payload: { signature: "0xruntime-user-signature" },
        accepted: runtimeRequirement,
        resource: runtimeRequired.resource,
        x402Version: 2,
      }),
      x402EndUserId: "customer_82",
    });
    assert.equal(replay.errorCode, "x402_proof_replayed");
    assert.equal(fetchCalls, callsBeforeReplay);

    const failureRequirement = { ...runtimeRequirement, amount: "260000" };
    const failureSignature = encodePaymentSignatureHeader({ x402Version: 2, resource: runtimeRequired.resource, accepted: failureRequirement, payload: { signature: "0xfailure" } });
    assert.equal((await recordX402Challenge({
      server: runtimeServer,
      tool: runtimeTool,
      endUserId: "customer_82",
      requirement: decodeX402PaymentSignature(failureSignature)!,
    })).ok, true);
    globalThis.fetch = async () => { fetchCalls += 1; throw new Error("network lost after signed payment"); };
    const callsBeforeFailure = fetchCalls;
    const failed = await executeToolFromEndpointMap(runtimeServer, runtimeTool, {}, { x402PaymentSignature: failureSignature, x402EndUserId: "customer_82" });
    assert.equal(failed.status, "error");
    assert.equal(fetchCalls, callsBeforeFailure + 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const domains = eligibleX402Domains({
    source_url: "https://docs.example.com/openapi.json",
    endpoint_map: [{ method: "GET", path: "/weather", base_url: "https://paid.example.com", operation_id: "weather", summary: null, description: null }],
  } as McpServer);
  assert.deepEqual(domains, ["docs.example.com", "paid.example.com"]);

  const migration = await readFile("database/migrations/x402.sql", "utf8");
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idx_x402_receipts_network_fingerprint/);
  assert.match(migration, /x402_payment_challenges/);
  assert.match(migration, /requirement_fingerprint/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /record_x402_challenge/);
  assert.match(migration, /v_active >= 32/);
  assert.match(migration, /status in \('reserved', 'settled', 'in_doubt'\)/);
  assert.match(migration, /and asset = p_asset/);
  assert.match(migration, /grant execute on function public\.claim_x402_payment[\s\S]*admin/);
  const runtimeRoute = await readFile("app/api/mcp/[serverId]/route.ts", "utf8");
  assert.match(runtimeRoute, /PAYMENT-SIGNATURE/);
  assert.match(runtimeRoute, /x402PaymentSignature/);
  assert.match(runtimeRoute, /Never ask for a private key or seed phrase/);
  assert.match(runtimeRoute, /execution\.status !== "payment_required"/);
  const runtime = await readFile("lib/runtime/execute-tool.ts", "utf8");
  assert.match(runtime, /const attempts = x402Payment \? 1/);
  assert.match(runtime, /redirect: "manual" as const/);
  assert.match(runtime, /if \(!isLocalSecuritySmokeUrl\(request\.url\)\) \{\s*pinnedDispatcher = await createPinnedPublicDispatcher/);
  assert.match(runtime, /x402PaymentSignature \? \[options\.x402PaymentSignature\]/);
  assert.ok(runtime.indexOf("const x402Target") < runtime.indexOf("injectCredential(request, options.credential"));
  assert.ok(runtime.indexOf("const circuitKey") < runtime.indexOf("prepareX402Payment({"));
  const verificationRoute = await readFile("app/api/x402/domains/[id]/verify/route.ts", "utf8");
  assert.match(verificationRoute, /readBoundedResponseText\(response, 4_096/);
  assert.match(verificationRoute, /createPinnedPublicDispatcher/);
  const codeMode = await readFile("lib/runtime/sdk-code-mode.ts", "utf8");
  assert.match(codeMode, /server\.runtime_policy\?\.x402\?\.enabled === true && plan\.calls\.length !== 1/);

  console.log("x402 non-custodial runtime smoke tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
