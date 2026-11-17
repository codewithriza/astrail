# Runtime Permissions

Astrail hosted runtimes can carry an optional `runtime_policy` object on an MCP server record. The policy is evaluated before Astrail injects credentials or calls an upstream endpoint.

```json
{
  "business_context": "Support may inspect customer records, but refunds require finance approval.",
  "read_only": true,
  "allow_http_gets": true,
  "allowed_actions": ["read", "draft", "write"],
  "blocked_actions": ["send", "destructive"],
  "allowed_methods": [
    "client.store.getInventory",
    { "pattern": "^GET /store", "regex": true, "match": "method_path" }
  ],
  "blocked_methods": [
    "client.pet.deletePet",
    { "pattern": "delete.*", "regex": true, "match": "operation_id" }
  ],
  "allowed_resources": [
    { "pattern": "^(store|inventory)$", "regex": true, "match": "resource" }
  ],
  "blocked_resources": []
}
```

`business_context` is non-secret operating guidance appended to MCP initialization instructions. Keep it free of credentials and private customer data. Tool-specific business context, when-to-use boundaries, and API edge cases are stored on each tool and appear in its agent-facing description.

`allowed_methods` and `blocked_methods` match SDK method names such as `client.store.getInventory`, endpoint IDs, tool names, operation IDs, `METHOD /path`, HTTP methods, paths, resources, and tags. Pattern objects can set `match` to scope matching to one field and `regex: true` for regular expressions.

`read_only` blocks non-read operations. `allow_http_gets` treats `GET`, `HEAD`, and `OPTIONS` as readable when OpenAPI operation metadata is missing. `blocked_methods` and `blocked_resources` win before allow lists.

`allowed_actions` and `blocked_actions` operate on the agent-facing action classes `read`, `draft`, `write`, `send`, and `destructive`. Explicit endpoint/tool metadata wins; otherwise Astrail classifies the OpenAPI operation conservatively from its method, operation ID, path, and description. Blocked actions win before allow lists. Per-tool `allow`, `approval`, and `block` policy is evaluated as a second control, so a send action can be globally allowed while still requiring human approval for selected tools.

Each tool also has an `enabled` exposure flag. Disabled tools are removed from `tools/list`, excluded from the callable endpoint map, and rejected if a client tries to call the hidden name directly. The dashboard can apply conservative recommendations: reads and drafts are allowed, writes and sends require approval, and destructive operations remain hidden and blocked until reviewed.

When a call is denied, Astrail returns an MCP tool result with `status: "permission_denied"`, `error_code: "runtime_permission_denied"`, and a `trace_id`.

## Actor roles and action levels

Every tool is classified with a graduated action level: `read`, `draft`, `write`, `send`, or `destructive`. The level is derived from the HTTP method plus tool naming (`create_draft_*` → `draft`, `send_email`/`publish_*` → `send`), and can be overridden explicitly with an `action_level` value in the tool's metadata. The classification is surfaced to agents in `tools/list` under `_meta.astrail.action_level`.

A `roles` map on `runtime_policy` scopes what each caller may do. Create an Astrail API key with an `actor_role`; callers may echo that value in `x-astrail-actor-role`, but cannot override the key scope. `default` applies only when the authenticated key has no role. Unknown roles fail closed:

```json
{
  "roles": {
    "support": { "max_action_level": "draft" },
    "ops": { "max_action_level": "send", "blocked_tools": ["delete_contact"] },
    "default": { "max_action_level": "read" }
  }
}
```

`max_action_level` caps the action level a role may execute (a role capped at `draft` can read data and prepare drafts, but cannot mutate records, send messages, or delete). `allowed_tools` restricts a role to an explicit tool list; `blocked_tools` denies specific tools. Role denials return `permission_denied` before billing, credential injection, or upstream execution.

Like the rest of `runtime_policy`, roles are an operational guardrail rather than a substitute for provider scopes. Astrail authenticates the actor-role and end-user context by binding them to the one-time-displayed API key; request headers may only match that stored scope.

These permissions are operational guardrails, not a security boundary. Production servers must still use least-privilege provider credentials, upstream OAuth scopes, and provider-side authorization.
