# Composable authorization and OAuth lifecycle

Run `neon-migration-composable-auth-lifecycle.sql` before enabling these features.

## Authorization boundaries

Actions are ordered as `read`, `draft`, `write`, `send`, and `destructive`. A trusted agent call is allowed only when server policy, the API-key-bound agent policy, the short-lived task authorization, and the provider grant all permit the endpoint. Add an action to `approval_actions` to allow it only after a human approves the exact encrypted request.

Example task authorization request:

```http
POST /api/task-authorizations
Content-Type: application/json

{
  "server_id": "SERVER_UUID",
  "agent_id": "support-agent",
  "purpose": "Reply to customer ticket 42",
  "issuer": "support-console",
  "ttl_seconds": 900,
  "allowed_tools": ["get_ticket", "draft_reply", "send_reply"],
  "allowed_actions": ["read", "draft", "send"],
  "approval_actions": ["send"],
  "allowed_resources": ["tickets"],
  "allowed_scopes": ["tickets:read", "tickets:write"]
}
```

The response displays `raw_token` once. Call MCP with both credentials:

```sh
curl -X POST https://YOUR_HOST/api/mcp/SERVER_ID \
  -H "Authorization: Bearer ${ASTRAIL_API_KEY}" \
  -H 'X-Astrail-Task-Authorization: atask_ONE_TIME_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"send_reply","arguments":{"ticket_id":"42","body":"Resolved."}}}'
```

For `send`, this example returns `human_approval_required`. Approve in `/dashboard/approvals`, then call `astrail/resume` with the same API key and task token. A different agent or task token is rejected. Omitting a required action, tool, resource, or provider scope returns `composable_authorization_denied` with a dimension-by-dimension decision.

Use separate grants to demonstrate other boundaries:

- `read`: permit lookup/list tools without approval.
- `draft`: permit preparation but not external delivery.
- `write`: permit internal record mutation, optionally approval-gated.
- `send`: approval-gate outward communication.
- `destructive`: use a narrow resource/tool list and require approval.

## Lifecycle demonstration

Set `ASTRAIL_OAUTH_REFRESH_FRACTION` between `0.8` and `0.9` (default `0.85`) and optional `ASTRAIL_OAUTH_REFRESH_JITTER` up to `0.05` (default `0.02`). Open `/dashboard/authorization` to inspect refresh generations, peer reuses, and task grants. Lifecycle records contain metadata only, never token values.

Run:

```sh
npm run smoke:composable-auth
```

The expected result is 20 workers, one provider refresh, 19 peer reuses, zero leaked tokens, and a five-dimension authorization decision requiring approval for `send`.
