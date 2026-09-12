# Integration Hardening

The expensive part of agent integrations is rarely the connector — it is the glue around it: auth edge cases, weird customer schemas, retries, duplicate actions, permissioning, audit trails, and contract churn. Astrail standardizes that glue in the hosted runtime so it is configuration, not per-customer engineering.

## 1. OAuth refresh edge cases

- Token refresh is **single-flight per credential**: concurrent tool calls that both see an expired token share one refresh exchange, so providers that rotate refresh tokens cannot be raced into a dead grant.
- A refresh rejected with a permanent OAuth error (`invalid_grant`, `invalid_client`, 400/401/403) marks the credential `connect_status = reauth_required`. Subsequent calls skip pointless refresh attempts and return `error_code: "oauth_reauth_required"` with a reconnect instruction, so "grant revoked" is distinguishable from "no credential attached."
- Transient refresh failures return `refresh_failed` without touching the stored grant; the next call retries.
- A successful reconnect through `POST /api/oauth/connect` flips the credential back to `active` automatically.
- Operation-level OAuth scope requirements are compared with the scopes recorded on the selected end-user grant. Missing consent returns `oauth_insufficient_scope` with the required and missing scopes before any provider request runs.
- Every OAuth grant binds to the exact OpenAPI `security_scheme`; a multi-provider server never reuses one provider's token for another. Existing OAuth-backed servers must be re-imported after the provider-binding migration, then legacy grants must reconnect.
- Caller bearer tokens are not provider credentials. Astrail validates the caller at the MCP boundary, then selects and decrypts only the matching server-owned provider grant.

## 2. Per-customer field mapping

`mcp_servers.field_mappings` (set via `PATCH /api/servers/:id`) declaratively reconciles a customer's quirky schema without regenerating tools or forking connector code:

```json
{
  "arguments": [
    { "argument": "customer_email", "upstream_name": "email" },
    { "argument": "stage", "value_map": { "qualified": "05_QUALIFIED" } },
    { "argument": "region", "default": "emea" },
    { "argument": "internal_note", "drop": true }
  ],
  "response": [
    { "tool": "list_contacts", "field": "contacts.cust_id", "rename": "id" },
    { "field": "internal_score", "drop": true }
  ]
}
```

Argument rules rename fields, translate enum values, inject constant defaults, and drop fields before the upstream request is built. Response rules rename or prune fields (dot paths descend through objects and arrays) before the agent sees the payload. Rules can be scoped to one tool with `tool`, are applied deterministically, and never evaluate code.

## 3. Retries, rate limits, and failure isolation

- Read-only upstream calls retry 408/425/429/500/502/503/504 responses by default with exponential backoff honoring `Retry-After`; policies can select other 5xx statuses.
- **Write retries are opt-in** and require both `retry_writes: true` and an idempotency key. Enable them only for providers with native idempotency support.
- A **per-upstream-host circuit breaker** opens after `ASTRAIL_CIRCUIT_FAILURE_THRESHOLD` consecutive 5xx/network failures (default 5) and fails fast with `error_code: "upstream_circuit_open"` and a `retry_at` timestamp for `ASTRAIL_CIRCUIT_OPEN_MS` (default 30s), then closes through a half-open probe. 429s do not count toward the breaker.

## 4. Idempotent tool calls

Pass an `idempotency_key` argument on any write tool call:

- Successful executions are recorded per `(server, tool, idempotency_key)` in `tool_execution_dedup` (in-memory fallback when Neon is not configured).
- A duplicate call replays the recorded result with `replayed: true` and the original trace id instead of re-executing the upstream action — one event cannot create two actions.
- The key is forwarded upstream as an `idempotency-key` header for providers with native support.
- Replay happens before the approval gate, so an agent retry after an ambiguous failure never asks a human to approve the same action twice.

## 5. Graduated permissions: read / draft / write / send

Tools are classified with an `action_level` (`read`, `draft`, `write`, `send`, `destructive`), and `runtime_policy.roles` caps what each API-key-scoped actor role may execute. Unknown or mismatched role headers are denied. See `docs/runtime-permissions.md`.

## 6. Audit logs a human can understand

`tool_call_logs` now records, per call:

- `end_user_id` and `actor_role` — who acted, not just which workspace.
- `arguments_redacted` — what was sent, secrets stripped and size-capped.
- `summary` — one plain-English sentence, e.g. `End user "u_42" acting as "support" called create_contact (POST /contacts) — succeeded in 321ms after 2 attempts.`

## 7. Spec re-import and schema migration

`POST /api/servers/:id/reimport` regenerates an existing server from its updated source contract — same server id, same hosted endpoint:

- Returns a structured diff (added / removed / changed tools, argument-level changes, `breaking` flag) and supports `dry_run: true` to preview without writing.
- Owner-configured per-tool policies, visibility, and metadata carry over for tools that still exist, so a re-import never silently loosens approval requirements.
- The previous tool set is snapshotted into `tool_schema_versions` (`GET /api/servers/:id/reimport` lists history) before anything changes.
- Pasted-spec servers re-import by sending the updated contract as `spec_raw`.

## Migration

Run `neon-migration-integration-hardening.sql` (idempotent). New log columns fall back to the legacy column set. Preview deployments without Neon use in-memory deduplication, while configured production storage fails closed if a durable idempotency claim is unavailable.

## Tests

`npm run smoke:integration-hardening` covers field mapping, the circuit breaker, idempotent replay and write retries, schema diff/carry-over, action-level role enforcement, OAuth reauth signaling, and audit summaries.

`npm run smoke:integration-operations` covers execution-policy bounds, webhook signatures, batch isolation, schema fingerprints, OAuth PKCE, and durable idempotency claim behavior.
