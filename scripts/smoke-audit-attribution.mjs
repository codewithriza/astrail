import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const serverRoute = read("app/api/mcp/[serverId]/route.ts");
const bundleRoute = read("app/api/mcp/bundles/[bundleId]/route.ts");
const exportRoute = read("app/api/audit/export/route.ts");
const schema = read("neon-schema.sql");
const auditPage = read("components/control-plane/AuditTimeline.tsx");
const revocationMigration = read("neon-migration-oauth-revocation-audit.sql");
const billingUsage = read("lib/billing/usage.ts");

for (const field of ["end_user_id", "actor_role", "api_key_id", "api_key_name", "api_key_preview", "client_name", "credential_refs", "trace_id", "tool_name", "created_at"]) {
  assert.match(schema, new RegExp(`tool_call_logs add column if not exists ${field}|${field}[^\\n]*[a-z]`, "i"), `schema missing ${field}`);
  assert.ok(exportRoute.includes(field), `audit export missing ${field}`);
}
for (const field of ["api_key_id", "api_key_name", "api_key_preview", "client_name", "credential_refs"]) {
  assert.ok(serverRoute.includes(field), `server audit insert missing ${field}`);
  assert.ok(bundleRoute.includes(field), `bundle audit insert missing ${field}`);
}
for (const field of ["end_user_id", "actor_role", "api_key_name", "client_name", "credential_refs", "trace_id", "tool_name"]) {
  assert.ok(auditPage.includes(field), `dashboard audit timeline missing ${field}`);
}
assert.match(auditPage, /before_id:[\s\S]*Load older events/);
assert.match(exportRoute, /q: z\.string\(\)[\s\S]*query\.or\(/);
assert.match(auditPage, /useEffect\([\s\S]*\/api\/audit\/export\?[\s\S]*params\.set\("q"/);
assert.doesNotMatch(auditPage, /useMemo\(\(\) => logs\.filter/);
assert.match(serverRoute, /apiKeyId:\s*matchingKey\.id/);
assert.match(bundleRoute, /apiKeyId:\s*matchingKey\.id/);
assert.match(serverRoute, /rememberCredential\(logContext, credentialResult\.credential\)/);
assert.match(bundleRoute, /rememberBundleCredential\(logContext, credentialResult\.credential\)/);
assert.match(serverRoute, /rateLimitedExecutionResult[\s\S]*await logToolExecution\(server, tool\.name, execution, logContext\)/);
assert.match(bundleRoute, /bundleRateLimitedExecutionResult[\s\S]*await logBundleToolExecution\(bundle, server, name, tool, execution, logContext\)/);
assert.match(serverRoute, /shouldPersistRateLimitAudit/);
assert.match(bundleRoute, /shouldPersistRateLimitAudit/);
assert.match(serverRoute, /approvalStorageUnavailableExecutionResult[\s\S]*await logToolExecution\(server, tool\.name, execution, logContext\)/);
assert.match(bundleRoute, /bundleApprovalStorageUnavailableExecutionResult[\s\S]*await logBundleToolExecution\(bundle, server, name, tool, execution, logContext\)/);
assert.match(serverRoute, /insert\(establishedAuditRecord\)[\s\S]*insert\(baseRecord\)/);
assert.match(bundleRoute, /insert\(establishedAuditRecord\)[\s\S]*insert\(insertRecord\)/);
assert.match(bundleRoute, /arguments_redacted:\s*redactedArgumentsForLog\(context\.args\)/);
assert.match(read("lib/runtime/observability.ts"), /Persist names only[\s\S]*argument_names:[\s\S]*values_omitted: true/);
assert.match(revocationMigration, /tool_call_logs for select/);
assert.match(revocationMigration, /api_credentials for select/);
assert.match(revocationMigration, /on delete set null/);
assert.doesNotMatch(revocationMigration, /create index concurrently/i);
assert.match(billingUsage, /execution_mode\.neq\.oauth_revocation/);

console.log("PASS: audit records and exports attribute user, role, agent client, API key, provider credential, tool, time, and trace.");
