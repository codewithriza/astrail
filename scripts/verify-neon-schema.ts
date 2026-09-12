const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { Client } = require("pg");

const requirements = [
  {
    table: "api_keys",
    columns: ["id", "user_id", "name", "key_hash", "key_preview", "end_user_id", "actor_role", "last_used", "created_at"],
  },
  {
    table: "mcp_servers",
    columns: ["id", "user_id", "field_mappings", "execution_policy", "runtime_policy", "schema_fingerprint", "schema_checked_at", "schema_drift_detected"],
  },
  {
    table: "tool_call_logs",
    columns: [
      "id",
      "server_id",
      "user_id",
      "tool_name",
      "status",
      "method",
      "path",
      "execution_mode",
      "upstream_status",
      "trace_id",
      "attempt_count",
      "error_code",
      "error",
      "end_user_id",
      "actor_role",
      "api_key_id",
      "api_key_name",
      "api_key_preview",
      "client_name",
      "credential_refs",
      "bundle_id",
      "arguments_redacted",
      "summary",
      "latency_ms",
      "created_at",
    ],
  },
  {
    table: "mcp_bundles",
    columns: ["id", "user_id", "name", "hosted_endpoint", "is_public", "created_at"],
  },
  {
    table: "mcp_bundle_servers",
    columns: ["bundle_id", "server_id", "created_at"],
  },
  {
    table: "hosted_endpoint_slots",
    columns: ["user_id", "slot", "resource_kind", "resource_id", "created_at"],
  },
  {
    table: "api_credentials",
    columns: [
      "id",
      "user_id",
      "server_id",
      "name",
      "provider",
      "security_scheme",
      "security_binding",
      "auth_scheme",
      "client_id",
      "client_secret_ciphertext",
      "authorization_url",
      "token_auth_method",
      "refresh_lease_id",
      "refresh_lease_until",
      "connect_status",
      "connect_state",
      "connect_state_expires_at",
      "pkce_verifier_ciphertext",
      "end_user_id",
      "injection_name",
      "scopes",
      "secret_ciphertext",
      "access_token_ciphertext",
      "refresh_token_ciphertext",
      "token_url",
      "expires_at",
      "revocation_url",
      "revocation_status",
      "revocation_error",
      "revocation_attempted_at",
      "key_preview",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "tool_approval_requests",
    columns: ["id", "server_id", "user_id", "tool_name", "arguments_ciphertext", "arguments_redacted", "status", "expires_at", "decided_at", "executed_at", "created_at"],
  },
  {
    table: "tool_execution_dedup",
    columns: ["id", "server_id", "user_id", "tool_name", "idempotency_key", "trace_id", "result_text", "status", "claim_token", "lease_expires_at", "updated_at", "created_at"],
  },
  {
    table: "tool_schema_versions",
    columns: ["id", "server_id", "user_id", "version", "tools_json", "endpoint_map", "diff", "tool_count", "created_at"],
  },
  {
    table: "webhook_endpoints",
    columns: ["id", "user_id", "server_id", "name", "secret_ciphertext", "secret_preview", "signature_header", "event_id_header", "is_active", "created_at"],
  },
  {
    table: "webhook_events",
    columns: ["id", "endpoint_id", "user_id", "server_id", "event_id", "event_type", "payload", "headers", "status", "correlation_id", "attempt_count", "max_attempts", "next_attempt_at", "lease_id", "lease_until", "last_error", "task_authorization_id", "trigger_tool", "processed_at", "dead_lettered_at", "received_at"],
  },
  { table: "webhook_event_transitions", columns: ["id","event_id","user_id","from_status","to_status","reason","correlation_id","created_at"] },
  { table: "organizations", columns: ["id","name","slug","argument_retention","audit_retention_days","created_at"] },
  { table: "organization_memberships", columns: ["organization_id","user_id","role","status","last_reviewed_at"] },
  { table: "organization_oidc_configs", columns: ["id","organization_id","issuer","client_id","client_secret_ciphertext","allowed_domains","enabled","created_at"] },
  { table: "organization_scim_configs", columns: ["id","organization_id","token_hash","token_preview","enabled","created_at"] },
  { table: "enterprise_identity_grant_mappings", columns: ["id","organization_id","issuer","subject","user_id","outbound_end_user_id","created_at"] },
  { table: "organization_access_reviews", columns: ["id","organization_id","reviewer_id","status","snapshot","decisions","completed_at","created_at"] },
  { table: "provider_reliability_state", columns: ["tenant_id","provider","credential_id","requests","queued","consecutive_failures","retry_budget_remaining","circuit_open_until","updated_at"] },
  { table: "reliability_metrics", columns: ["id","tenant_id","provider","credential_id","metric","value","recorded_at"] },
  { table: "schema_reconciliation_events", columns: ["id","user_id","server_id","decision","classification","diff","from_version","to_version","actor_id","created_at"] },
  { table: "field_mapping_versions", columns: ["id","user_id","server_id","provider","name","version","mappings","is_template","created_at"] },
  {
    table: "integration_schema_versions",
    columns: ["id", "user_id", "server_id", "fingerprint", "endpoint_count", "change_summary", "detected_at"],
  },
  {
    table: "integration_cost_events",
    columns: ["id", "user_id", "server_id", "category", "minutes", "amount", "note", "created_at"],
  },
  {
    table: "integration_cost_totals",
    columns: ["user_id", "server_id", "category", "minutes", "amount", "events"],
  },
  {
    table: "billing_webhook_events",
    columns: ["id", "dodo_event_id", "event_type", "user_id", "event_created_at", "processing_result", "payload", "processed_at"],
  },
  {
    table: "billing_subscriptions",
    columns: [
      "id",
      "user_id",
      "dodo_customer_id",
      "dodo_subscription_id",
      "dodo_payment_id",
      "plan",
      "status",
      "entitlement_status",
      "paid_confirmed_at",
      "current_period_start",
      "current_period_end",
      "cancel_at_period_end",
      "last_payment_status",
      "last_payment_at",
      "dodo_last_event_id",
      "dodo_last_event_type",
      "dodo_last_event_at",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "billing_payment_events",
    columns: [
      "id",
      "dodo_event_id",
      "dodo_payment_id",
      "user_id",
      "dodo_customer_id",
      "dodo_subscription_id",
      "plan",
      "status",
      "amount",
      "currency",
      "event_created_at",
      "payload",
      "processed_at",
    ],
  },
  {
    table: "billing_usage",
    columns: ["id", "user_id", "server_id", "tool_name", "usage_type", "quantity", "created_at"],
  },
  {
    table: "x402_domain_verifications",
    columns: ["id", "server_id", "user_id", "domain", "token_hash", "status", "verified_at", "last_error", "created_at", "updated_at"],
  },
  {
    table: "x402_payment_challenges",
    columns: ["id", "server_id", "user_id", "end_user_id", "tool_name", "requirement_fingerprint", "requirement", "expires_at", "consumed_at", "created_at"],
  },
  {
    table: "x402_payment_receipts",
    columns: ["id", "server_id", "user_id", "end_user_id", "tool_name", "trace_id", "payment_fingerprint", "network", "asset", "amount", "pay_to", "status", "transaction", "settlement_response", "settled_at", "created_at", "updated_at"],
  },
];

const expectedIndexes = [
  "idx_tool_call_logs_server_created_at",
  "idx_tool_call_logs_user_created_at",
  "idx_tool_call_logs_trace_id",
  "idx_api_credentials_user_server",
  "idx_mcp_bundles_user_created_at",
  "idx_mcp_servers_user_hosted_endpoint",
  "idx_mcp_bundles_user_hosted_endpoint",
  "idx_mcp_bundle_servers_server",
  "idx_tool_approval_requests_user_status",
  "idx_tool_approval_requests_server",
  "api_credentials_connect_state_key",
  "api_credentials_server_end_user_idx",
  "idx_tool_call_logs_end_user",
  "idx_tool_call_logs_api_key",
  "idx_tool_call_logs_client",
  "tool_execution_dedup_key",
  "idx_tool_schema_versions_server_created_at",
  "billing_webhook_events_event_type_idx",
  "billing_subscriptions_user_id_idx",
  "billing_subscriptions_entitlement_idx",
  "billing_payment_events_user_created_at_idx",
  "billing_payment_events_payment_id_idx",
  "billing_usage_user_id_created_at_idx",
  "idx_webhook_endpoints_user_server",
  "idx_webhook_events_endpoint_received",
  "idx_webhook_events_user_received",
  "idx_webhook_events_queue",
  "idx_reliability_metrics_tenant_time",
  "idx_schema_versions_server_detected",
  "idx_integration_costs_user_created",
  "idx_integration_costs_server_created",
  "idx_mcp_servers_schema_watch",
  "idx_x402_domain_verifications_user",
  "idx_mcp_servers_id_user",
  "idx_x402_challenges_claim",
  "idx_x402_receipts_user_created",
  "idx_x402_receipts_spend_window",
  "idx_x402_receipts_network_fingerprint",
];

const expectedPolicies = [
  "tool call logs are owned by users",
  "bundles are owned by users",
  "bundle servers follow bundle ownership",
  "credentials are owned by users",
  "tool approvals are owned by users",
  "tool execution dedup is owned by users",
  "tool schema versions are owned by users",
  "Users can read own subscriptions",
  "Users can read own billing payment events",
  "Users can read own billing usage",
  "webhook endpoints are owned by users",
  "webhook events are owned by users",
  "webhook transitions owned",
  "organizations members read",
  "memberships visible",
  "oidc admins",
  "grant mappings admins",
  "reviews admins",
  "schema versions are owned by users",
  "integration costs are owned by users",
  "x402 domains are owned by users",
  "x402 challenges are owned by users",
  "x402 receipts are owned by users",
];

function loadEnvFile() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ||= value;
  }
}

async function main() {
  loadEnvFile();
  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url) {
    console.error("missing_env");
    console.error("Set NEON_DATABASE_URL or DATABASE_URL.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url, application_name: "astrail-schema-verifier" });
  await client.connect();

  const missingTables = [];
  const missingColumns = [];
  const schema = await client.query("select table_name,column_name from information_schema.columns where table_schema='public'");
  const byTable = new Map();
  for (const row of schema.rows) {
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, new Set());
    byTable.get(row.table_name).add(row.column_name);
  }
  for (const requirement of requirements) {
    const columns = byTable.get(requirement.table);
    if (!columns) { missingTables.push(requirement.table); continue; }
    for (const column of requirement.columns) if (!columns.has(column)) missingColumns.push({ table: requirement.table, column, error: "missing" });
  }
  const invalidIndexes = await client.query("select indexrelid::regclass::text name from pg_index where not indisvalid");
  const unvalidatedConstraints = await client.query("select conname from pg_constraint where not convalidated");
  await client.end();

  if (missingTables.length === 0 && missingColumns.length === 0 && invalidIndexes.rowCount === 0 && unvalidatedConstraints.rowCount === 0) {
    console.log("ready");
    console.log("Neon schema has required Astrail runtime tables and columns.");
    console.log("expected_indexes:");
    for (const index of expectedIndexes) console.log(`- ${index}`);
    console.log("expected_policies:");
    for (const policy of expectedPolicies) console.log(`- ${policy}`);
    console.log("catalog_ready: indexes and constraints are valid.");
    return;
  }

  console.log("not_ready");
  if (missingTables.length > 0) {
    console.log("missing_tables:");
    for (const table of missingTables) console.log(`- ${table}`);
  }
  if (missingColumns.length > 0) {
    console.log("missing_columns:");
    for (const item of missingColumns) console.log(`- ${item.table}.${item.column}: ${item.error}`);
  }
  console.log("next_action: Apply database/schema.sql and the required Neon migrations, then rerun npm run verify:schema.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
