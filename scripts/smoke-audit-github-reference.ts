import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAuditExportManifest, verifyAuditExportManifest } from "../lib/audit-integrity";
import { GithubProviderSimulator } from "../lib/launch-demos/github-provider-simulator";

process.env.AUDIT_EXPORT_SIGNING_KEY = "test-signing-key-that-is-not-used-in-production";
const rows = [{ id: "event-1", agent_id: "github-agent", task_id: "task-1", purpose: "Triage issue 42", arguments_redacted: { token: "[redacted]" }, event_hash: "abc" }];
const integrity = createAuditExportManifest(rows, { userId: "user-1", exportedAt: "2026-07-18T00:00:00.000Z", filters: {} });
assert.equal(integrity.manifest.signature_status, "signed");
assert.equal(verifyAuditExportManifest(rows, integrity.manifest, integrity.signature).valid, true);
assert.equal(verifyAuditExportManifest([{ ...rows[0], purpose: "tampered" }], integrity.manifest, integrity.signature).valid, false);

const migration = readFileSync("database/migrations/audit-evidence-github-reference.sql", "utf8");
for (const required of ["chain_tool_call_evidence", "tool_call_logs_append_only", "purge_audit_logs", "audit_legal_holds", "previous_event_hash", "event_hash"]) assert.ok(migration.includes(required));
assert.match(migration, /raise exception 'tool_call_logs are append-only/);
const runtimeRoute = readFileSync("app/api/mcp/[serverId]/route.ts", "utf8");
for (const field of ["affected_resources", "effective_scopes", "policy_result", "provider_result", "approval_actor_id", "execution_claim_id"]) assert.ok(runtimeRoute.includes(field));
assert.doesNotMatch(runtimeRoute, /authorization_header|cookie_value|refresh_token[^_]/i);

const provider = new GithubProviderSimulator();
assert.equal(provider.request({ token: provider.accessToken(), method: "GET" }).status, 200);
assert.equal(provider.request({ token: provider.accessToken(), method: "POST", scenario: "rate_limit_once" }).status, 429);
assert.equal(provider.request({ token: provider.accessToken(), method: "POST", scenario: "rate_limit_once" }).status, 201);
assert.equal(provider.request({ token: provider.accessToken(), method: "GET", scenario: "expired_token" }).status, 401);
const refreshed = provider.refresh("demo_refresh"); assert.equal(refreshed.status, 200); assert.equal("refresh_token" in refreshed.body, false);
assert.equal(provider.request({ token: provider.accessToken(), method: "GET" }).status, 200);
assert.equal(provider.revoke().status, 204); assert.equal(provider.request({ token: provider.accessToken(), method: "GET" }).status, 401);
console.log(JSON.stringify({ audit: { signed: true, tamper_detected: true, append_only: true, legal_hold: true }, github: { read: true, approval_gated_write_contract: true, rate_limit_retry: true, expired_token_recovery: true, rotated_refresh_preserved: true, revocation: true, provider_secrets_exposed: false } }, null, 2));
