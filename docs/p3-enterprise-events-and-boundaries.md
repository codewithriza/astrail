# P2.4 and P3 operations

Apply `database/migrations/p3-enterprise-events.sql` after the earlier migrations.

## Webhook operations

Endpoints support generic Astrail HMAC plus GitHub, Slack and Stripe signature formats. Slack and Stripe timestamps have a five-minute replay window. Stored events receive correlation IDs and explicit `received → processing → succeeded`, `processing → retry_scheduled`, and `processing → dead_letter` transitions. Processing leases last 30 seconds, attempts are bounded, retry delay is capped, and owner replay resets a completed or dead-letter event. `authorize_trigger` binds an event to an unexpired task authorization and records the same task purpose/correlation in tool-call audit; actual execution must still enter the normal MCP runtime.

## Enterprise identity

Organizations contain role-bound memberships (`owner`, `admin`, `auditor`, `member`), encrypted OIDC client configuration, opt-in SCIM credentials stored only as hashes, inbound issuer/subject to outbound end-user mappings, and administrative access-review snapshots/decisions. SCIM provisions only existing Astrail accounts and is isolated to its token's organization. Organization controls attach owned servers and configure argument/audit retention. RLS and server-side membership checks scope every enterprise record.

## Local memory boundary

`examples/local-memory-agent/adapter.mjs` keeps prompts, retrieved memory, histories and private notes in the local process. `/api/local-agent/tool-request` accepts only a server ID, tool name, at most 64 KB of bounded arguments, an Astrail API key and a one-time task authorization. Prompt, memory, message and history keys are rejected recursively. Astrail currently stores authorization/audit metadata and argument names only, never the local prompt, memory, or argument values. Per-server and organization retention choices are recorded but are not yet dynamically applied to audit serialization.

## Static skill demo

`examples/static-skill-github/SKILL.md` contains static instructions and a bounded JSON tool manifest. The parser accepts no executable code and rejects unmapped operation IDs. The reference setup maps three operations to the already-stable GitHub OAuth reference path, with reads allowed and comments approval-gated. Local evaluation context remains outside Astrail; only task-scoped tool calls cross the hosted authorization boundary.
