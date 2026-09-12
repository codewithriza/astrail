import assert from "node:assert/strict";
import { oauthRefreshDue, deterministicRefreshFraction } from "../lib/runtime/token-lifecycle";
import { evaluateComposableAuthorization } from "../lib/runtime/composable-authorization";
import type { McpTool, OpenApiEndpoint } from "../lib/types";
import { readFileSync } from "node:fs";

async function concurrencyDemo() {
  let generation = 0, refreshCalls = 0, peerReuses = 0, refreshing: Promise<string> | null = null;
  const acquire = async () => {
    const observed = generation;
    if (!refreshing) refreshing = (async () => { refreshCalls += 1; await new Promise((resolve) => setTimeout(resolve, 20)); generation = observed + 1; return `access-generation-${generation}`; })().finally(() => { refreshing = null; });
    else peerReuses += 1;
    return refreshing;
  };
  const values = await Promise.all(Array.from({ length: 20 }, acquire));
  assert.equal(refreshCalls, 1); assert.equal(peerReuses, 19); assert.equal(new Set(values).size, 1);
  assert.ok(values.every((value) => !value.includes("refresh_token")));
  return { workers: 20, provider_refreshes: refreshCalls, peer_reuses: peerReuses, leaked_tokens: 0 };
}

const fraction = deterministicRefreshFraction("credential-demo");
assert.ok(fraction >= 0.8 && fraction <= 0.9);
const issuedAt = new Date(0).toISOString(), expiresAt = new Date(1000_000).toISOString();
assert.equal(oauthRefreshDue({ credentialId: "credential-demo", issuedAt, expiresAt, originalTtlSeconds: 1000 }, 790_000), false);
assert.equal(oauthRefreshDue({ credentialId: "credential-demo", issuedAt, expiresAt, originalTtlSeconds: 1000 }, 910_000), true);
const migration = readFileSync("database/migrations/composable-auth-lifecycle.sql", "utf8");
assert.match(migration, /refresh_generation = p_expected_generation/);
assert.match(migration, /refresh_lease_id = p_lease_id and refresh_generation = p_expected_generation/);
assert.match(migration, /coalesce\(p_refresh_token_ciphertext, refresh_token_ciphertext\)/);
assert.doesNotMatch(migration, /access_token\s+text|refresh_token\s+text/);

const tool: McpTool = { name: "send_message", description: "send", method: "POST", path: "/messages" };
const endpoint: OpenApiEndpoint = { method: "POST", path: "/messages", tool_name: "send_message", operation_kind: "write", action_class: "send", resource: "messages", security_requirements: [{ oauth: ["chat:write"] }], oauth_security_schemes: ["oauth"] } as OpenApiEndpoint;
const task = { id: "task", agent_id: "support-agent", purpose: "Reply to ticket 42", issuer: "operator", nonce: "nonce", expires_at: new Date(Date.now() + 60_000).toISOString(), allowed_tools: ["send_message"], allowed_actions: ["send" as const], approval_actions: ["send" as const], allowed_resources: ["messages"], allowed_scopes: ["chat:write"] };
const decision = evaluateComposableAuthorization({ tool, endpoint, agentId: "support-agent", agentPolicy: { allowed_tools: ["send_message"], allowed_actions: ["send"], allowed_resources: ["messages"], allowed_scopes: ["chat:write"] }, task, providerScopes: ["chat:write"] });
assert.equal(decision.allowed, true); assert.equal(decision.requiresApproval, true); assert.equal(decision.dimensions.length, 5);
const denied = evaluateComposableAuthorization({ tool, endpoint, agentId: "other-agent", agentPolicy: {}, task, providerScopes: [] });
assert.equal(denied.allowed, false); assert.ok(denied.missing.some((item) => item.startsWith("task_authorization"))); assert.ok(denied.missing.some((item) => item.startsWith("provider_grant")));

async function main() {
  console.log(JSON.stringify({ lifecycle: await concurrencyDemo(), authorization: { allowed: decision.allowed, requires_approval: decision.requiresApproval, action: decision.action, dimensions: decision.dimensions.map((item) => item.name) }, boundaries: ["read", "draft", "write", "send", "destructive"] }, null, 2));
}
void main();
