# Astrail Research-to-Product Feature Roadmap

Audit date: 18 July 2026  
Sources: `research.txt`, `astrailoutreachfeedback.txt`, and the full repository  
Purpose: establish what Astrail already implements, what is partial, and what should be built next. This is a planning document; no feature implementation is included.

## 1. Product goal

Astrail should be the hosted authorization and execution boundary for AI agents calling third-party SaaS APIs. OpenAPI-to-MCP generation is the onboarding path, not the primary moat. The product should remove the recurring integration work around per-user OAuth, token rotation, revocation, composable permissions, approvals, retries, idempotency, audit evidence, field variance, and upstream schema changes while leaving agent memory and private context in the customer's environment.

The strongest validated wedge is third-party SaaS OAuth (GitHub, Slack, Google, Stripe, and similar providers), where there is no universal cross-domain on-behalf-of exchange. Internal single-tenant OBO and generic connector generation are lower-priority positioning.

## 2. Pain points validated by outreach

1. Token storage alone is insufficient; teams need consent, refresh rotation, revocation, and audit as one lifecycle.
2. OAuth setup screens are easy. Scope enforcement, token failure handling, expected-use controls, and proving what an agent did are hard.
3. Permissions must compose per user, per agent, and per requested task/scope, rather than only per deployment.
4. Refresh-token rotation must be concurrency-safe so simultaneous workers cannot revoke a user's grant accidentally.
5. Retries, partial failures, rate limits, field mappings, webhook deduplication, and schema migrations create most of the integration maintenance cost.
6. A hosted auth/runtime boundary is useful only if customer memory and prompt context can remain local.
7. Prospects need a credible real-API demo, not only generated tools or architecture claims.

## 3. Status definitions

- **Implemented**: production code and a runtime/API path exist in the canonical root application.
- **Partial**: useful foundations exist, but the research requirement or customer promise is not complete.
- **Missing**: no substantive implementation was found.
- **Operational**: a sales/demo/documentation deliverable rather than a platform primitive.

## 4. Existing feature inventory

### 4.1 Implemented

| Capability | What exists | Primary evidence |
|---|---|---|
| OpenAPI/GraphQL/Google Discovery to MCP | Parsing, endpoint maps, tool generation, dynamic catalog mode, Code Mode, SDK export, website inspection, and presets | `lib/openapi.ts`, `lib/generate-mcp.ts`, `lib/generation-pipeline.ts`, `lib/runtime/sdk-code-mode.ts` |
| Context-efficient tool exposure | Large APIs use catalog/Code Mode; request bodies over 10 nested properties collapse to a compact object | `lib/generate-mcp.ts`, `lib/agent-tool-profile.ts` |
| Per-user outbound OAuth | Authorization-code consent with state and S256 PKCE; credentials bind to server, end user, provider, and imported security scheme | `app/api/oauth/connect/route.ts`, `app/api/oauth/callback/route.ts`, `lib/oauth-connect.ts`, `neon-migration-oauth-provider-binding.sql` |
| Encrypted credential vault | AES-GCM credential encryption; provider access, refresh, and client-secret material remains server-side | `lib/credentials.ts`, `app/api/credentials/*` |
| Provider scope enforcement | Imported endpoint OAuth requirements are matched against the bound credential and granted scopes; missing scopes fail before provider execution | `lib/runtime/oauth-security.ts`, `lib/runtime/credential-loader.ts` |
| Per-user credential isolation | End-user OAuth cannot fall back to a workspace OAuth identity; database ownership/RLS is present | `lib/runtime/credential-loader.ts`, credential migrations |
| Refresh rotation persistence | Rotated access and refresh tokens are encrypted and stored together; permanent refresh errors mark reconnect required | `lib/credentials.ts`, `lib/runtime/credential-loader.ts` |
| Cross-instance refresh coordination | Database refresh leases allow one worker to refresh while peers wait and reread the credential; process-local single-flight also exists | `lib/runtime/credential-loader.ts`, `neon-migration-integration-operations.sql` |
| Provider-side revocation | Trusted HTTPS revocation paths, provider-specific handling, revocation state, retryable UI/API flow, and cleanup after failed storage | `lib/oauth-revocation.ts`, `app/api/credentials/[id]/route.ts`, `neon-migration-oauth-revocation-audit.sql` |
| Inbound Astrail API-key identity | Hashed, one-time-display keys can bind an end-user ID and actor role; caller headers cannot override a bound identity | `lib/api-keys.ts`, `app/api/apikeys/route.ts`, `app/api/mcp/[serverId]/route.ts` |
| Runtime permission policies | Read-only, allowed/blocked methods, resources, tools and action classes; role policies with read/draft/write/send/destructive ceilings | `lib/runtime/permissions.ts`, `app/api/policies/route.ts`, dashboard policies UI |
| Human-in-the-loop approvals | Allow/approval/block tool policy; encrypted resumable arguments; expiring, one-time claimed decisions before upstream execution | `lib/runtime/tool-approvals.ts`, `app/api/approvals/*`, `neon-migration-executor-parity.sql` |
| Write idempotency | Durable per-server/tool/key claims, duplicate replay, in-progress and in-doubt states, identity/policy fingerprinting | `lib/runtime/idempotency.ts`, `neon-migration-integration-operations.sql` |
| Webhook verification and deduplication | Bounded bodies, HMAC verification, redacted stored headers, and unique endpoint/event IDs | `lib/webhook-security.ts`, `app/api/webhooks/*`, `neon-migration-integration-operations.sql` |
| Reliability controls | Bounded retries, Retry-After handling, timeouts, rate limits, batch isolation, response cache, and a per-instance circuit breaker | `lib/runtime/execution-policy.ts`, `lib/runtime/execute-tool.ts`, `lib/runtime/rate-limit.ts`, `lib/runtime/circuit-breaker.ts`, `lib/runtime/batch.ts` |
| Customer-specific field mapping | Declarative argument rename/default/drop/value maps and response rename/drop rules, without eval | `lib/runtime/field-mapping.ts`, server APIs and dashboard |
| Audit attribution and export | Human-readable summaries, redacted arguments, user/role/API-key/client/credential attribution, traces, attempts, latency, status, search and CSV/JSON export | `app/api/mcp/[serverId]/route.ts`, `app/api/audit/export/route.ts`, audit dashboard, audit migrations |
| Schema drift detection | Spec and endpoint fingerprints, scheduled checks, version history, change summaries, and re-import preserving tool policy | `lib/schema-drift.ts`, `lib/runtime/schema-diff.ts`, `app/api/cron/schema-watch/route.ts`, `app/api/servers/[id]/reimport/route.ts` |
| Security boundary | Public/private tool filtering, provider-token non-forwarding, SSRF/DNS defenses, bounded payloads, redaction, CORS/origin controls, and credential ownership checks | `app/api/mcp/[serverId]/route.ts`, `lib/runtime/network-policy.ts`, `lib/runtime/permissions.ts`, `lib/origin-policy.ts` |
| Memory separation | Runtime requests contain tool arguments and identity metadata; no centralized agent-memory subsystem exists | Architecture and runtime codebase |
| Integration-cost tracking | Setup, maintenance, support, and custom-exception events and totals | `app/api/integration-costs/route.ts`, `neon-migration-integration-operations.sql` |

### 4.2 Partial capabilities

| Capability | What is already useful | What remains |
|---|---|---|
| Proactive token refresh | Refresh begins 60 seconds before expiry and uses a database lease | Store issued-at/TTL and refresh at a configurable 80–90% lifetime threshold; refresh in the background where safe; add a 20-concurrent-request proof test |
| User × agent × task permission intersection | End-user identity, actor role, tool/action policy, provider grant, and endpoint scopes are checked | Create first-class `agent_id` and task/request scope grants; calculate and record the explicit intersection; prevent a caller from self-asserting either dimension |
| OAuth expected-use enforcement | Tool/action policies, approvals, role limits, and redacted argument logs exist | Add intent/purpose constraints, optional resource/record constraints, and policy decisions tied to a short-lived task authorization |
| Human-readable audit evidence | Strong execution attribution and summaries exist | Persist agent ID, task authorization, requested purpose/intent, policy decision chain, approval actor/time/reason, and hashes linking evidence; define tamper-evident or append-only guarantees |
| Audit immutability | Browser users have select-only RLS and integration deletion preserves logs | Service-role paths and retention can mutate/delete evidence; add append-only controls, retention policy semantics, and optional hash chaining/WORM export before claiming “immutable” |
| Retry/backoff behavior | Bounded exponential backoff and Retry-After are implemented | Add full jitter, provider-aware retry budgets, distributed coordination/queuing for bursts, and retry telemetry; the circuit breaker is currently per instance |
| Schema migrations | Drift is detected and users can re-import while preserving policy | Add compatibility classification, safe automatic reconciliation, approval for breaking changes, rollback/version selection, and notification workflow |
| OpenAPI semantic compression | Dictionary mode, catalog mode, Code Mode, descriptions, filters, and client normalization exist | Strip internal/auth/tracing headers from agent schemas, prune read-only input fields consistently, support OpenAPI Overlay 1.0, and measure token reduction/tool-selection quality against a baseline |
| Field mapping | Deterministic shallow mappings cover common renames/defaults/enums | Add nested paths, validation transforms, mapping suggestions from drift/errors, test/preview UI, mapping versioning, and tenant templates |
| Webhooks | Inbound verification and event dedup exist | Add event processing coordination/status transitions, replay/dead-letter workflow, outbound delivery idempotency if offered, and provider adapters |
| Multi-tenant enterprise identity | Workspace auth, RLS, per-user grants, and bound API keys exist | Enterprise SSO/SCIM/organization model and a formal inbound identity-to-outbound-grant mapping are not a complete product surface |
| Provider catalog | Generic imported OAuth plus provider-specific revocation behavior exists | Ship supported GitHub/Slack/Google/Stripe connection templates, verified metadata, defaults, health checks, and reconnect guidance |
| Stateless/local-context promise | No memory product is present and logs redact secrets | Define a strict data contract and configurable argument/audit retention; prove no prompt/memory capture; provide an Engram/local-agent example |

### 4.3 Missing capabilities

1. **MCP OAuth 2.1 protected-resource support**: no RFC 9728 protected-resource metadata endpoint, standards-compliant `WWW-Authenticate` challenge, authorization-server metadata, resource/audience binding, or inbound MCP bearer-token validation was found.
2. **Dynamic Client Registration / CIMD**: no RFC 7591 registration endpoint or Client ID Metadata Document onboarding flow was found.
3. **First-class task-scoped authorization**: no signed/short-lived task grant carrying an explicit intent scope exists.
4. **Automatic schema reconciliation**: detection and manual re-import exist, but the runtime does not automatically reconcile safe upstream changes.
5. **Distributed rate-limit queue and circuit state**: controls are bounded but primarily per-process; there is no shared provider/tenant scheduler.
6. **OpenAPI Overlay 1.0 support**: no overlay parser/application pipeline was found.
7. **Formal integration SLO/health product**: logs and status summaries exist, but provider connection health, refresh success SLOs, retry saturation, and drift alerts are not unified into an operations surface.

## 5. Build goals in priority order

### P0 — Make the validated OAuth wedge demonstrably complete

#### Goal P0.1: Proactive, concurrency-safe token lifecycle

**Status: implemented on 18 July 2026.** See `neon-migration-composable-auth-lifecycle.sql`, `lib/runtime/token-lifecycle.ts`, the refresh engine in `lib/runtime/credential-loader.ts`, `/dashboard/authorization`, and `npm run smoke:composable-auth`.

Deliver a provider-neutral lifecycle engine that can be demonstrated under concurrency.

Acceptance criteria:

- Store `issued_at`, `expires_at`, original TTL, refresh generation/version, and last refresh outcome.
- Refresh at a configurable 80–90% TTL threshold with bounded jitter to avoid request storms.
- Use a database-atomic lease/version compare-and-swap so stale workers cannot overwrite rotated tokens.
- Peers wait, reread, and use the newly stored token; they never submit the old refresh token.
- Preserve a newly rotated refresh token when a provider omits it on later refresh responses.
- Permanent errors transition to `reauth_required`; transient errors keep the grant and expose a safe retry state.
- Add an automated 20-worker concurrency test and a demo view showing one provider refresh, nineteen peer reuses, and no leaked tokens.
- Record lifecycle audit events without token values.

#### Goal P0.2: Explicit composable authorization

**Status: implemented on 18 July 2026.** See `lib/runtime/composable-authorization.ts`, `/api/task-authorizations`, API-key agent bindings, MCP runtime enforcement/audit integration, `docs/composable-authorization.md`, and `npm run smoke:composable-auth`.

Turn the current identity + role + tool + provider-scope checks into a first-class user × agent × task intersection.

Acceptance criteria:

- Add trusted `agent_id` bindings to API keys/clients; agents cannot self-assert identity.
- Add short-lived task authorizations containing requested tools/actions/resources/scopes, purpose, issuer, expiry, and nonce.
- Calculate effective authority as the intersection of user/provider grant, agent policy, task grant, server policy, and endpoint-required scopes.
- Fail closed with a machine-readable decision showing each dimension and the exact missing constraint.
- Require approval when the intersection permits a call only after human elevation.
- Store the decision chain in the audit event.
- Provide examples for read, draft, write, send, and destructive boundaries.

#### Goal P0.3: Intent-linked, tamper-evident audit

**Status: implemented on 18 July 2026.** See `neon-migration-audit-evidence-github-reference.sql`, `lib/audit-integrity.ts`, enriched MCP evidence logging, legal-hold/retention APIs, signed audit exports and verification, the audit dashboard, and `npm run smoke:audit-github`.

Answer the prospect’s central question: “What did the agent do with access, and why was it allowed?”

Acceptance criteria:

- Capture agent ID, task ID, declared purpose, tool, redacted normalized arguments, affected resource identifiers, effective scopes, policy result, credential reference, attempts, provider result, and trace.
- Link approval actor, decision, timestamp, optional reason, and one-time execution claim.
- Add append-only database enforcement for normal service paths.
- Add hash chaining or signed export manifests so alteration/removal is detectable.
- Define retention/legal-hold behavior and show gaps explicitly when storage is unavailable.
- Never store raw tokens, authorization headers, cookies, or unbounded prompt/memory content.

#### Goal P0.4: Ship one polished real-SaaS reference integration

**Status: implemented on 18 July 2026.** See `/dashboard/reference-integrations/github`, `/api/reference-integrations/github`, `lib/launch-demos/github-issues.ts`, the deterministic GitHub provider simulator, `docs/github-reference-integration.md`, `npm run smoke:launch-demo`, and `npm run smoke:audit-github`.

Use GitHub first unless an active design partner requires another provider.

Acceptance criteria:

- One-click consent with least-privilege read/write scopes and clear reconnect/revoke states.
- Per-user connection mapped to a trusted agent and task authorization.
- A read action, approval-gated write action, revocation, expired-token recovery, rate-limit retry, and audit inspection in a five-minute script.
- A deterministic local/demo provider supports the same failure scenarios in CI.
- The demo never requires sharing provider secrets with the model or local client.

### P1 — Standards compatibility and operational hardening

#### Goal P1.1: MCP OAuth 2.1 resource-server profile

**Status: implemented on 18 July 2026.** See `lib/mcp-oauth-resource.ts`, `/.well-known/oauth-protected-resource`, MCP bearer enforcement, `docs/p1-standards-and-operations.md`, and `npm run smoke:p1`. Astrail operates only as the resource server and integrates an established authorization server; CIMD/DCR remain deliberately disabled while clients are pre-registered.

- Implement RFC 9728 protected-resource metadata and correct bearer challenges.
- Support authorization-server discovery and exact issuer/resource/audience validation.
- Require authorization-code + S256 PKCE for public clients.
- Evaluate whether to operate an authorization server or integrate an established one; do not hand-roll token signing without a threat model and key-rotation design.
- Add pre-registered clients first, then CIMD and DCR only where needed.
- Add conformance, redirect-URI, state, replay, audience-confusion, and metadata-host validation tests.

#### Goal P1.2: Distributed reliability control plane

**Status: implemented on 18 July 2026.** See `neon-migration-p1-control-plane.sql`, `lib/runtime/reliability-control-plane.ts`, full-jitter execution policy, `/dashboard/reliability`, and `npm run smoke:p1`.

- Add full-jitter retry policies and per-provider retry budgets.
- Coordinate rate limits and circuit state across instances by tenant, provider, and credential.
- Queue bounded bursts with deadlines and cancellation; never create unbounded worker loops.
- Expose retry, throttle, queue, circuit, and provider-error metrics.
- Maintain the rule that writes retry only with proven idempotency.

#### Goal P1.3: Provider lifecycle operations

**Status: implemented on 18 July 2026.** See `lib/provider-templates.ts`, connection health/lifecycle APIs, refresh alerts, administrator revoke, `/dashboard/connections`, and `npm run smoke:p1`.

- Add verified templates for GitHub, Slack, Google, and Stripe.
- Add connection health, scope drift, revoked-grant detection, refresh history, and actionable reconnect UI.
- Add administrator revoke and user self-revoke with provider confirmation.
- Alert on repeated transient refresh failures before the integration breaks.

### P2 — Reduce customer-specific integration work

#### Goal P2.1: Safe schema reconciliation

**Status: implemented on 18 July 2026.** See the reconciliation classifier/preview in `lib/runtime/schema-diff.ts`, versioned apply/rollback and decision audit in `/api/servers/[id]/reimport`, `neon-migration-p2-integration-reduction.sql`, and `npm run smoke:p2`.

- Classify drift as additive, compatible, conditionally compatible, or breaking.
- Auto-apply only proven-safe additive changes.
- Preview generated-tool, mapping, permission, and scope changes before approval.
- Preserve policy/mappings by stable operation identity; flag ambiguous renames.
- Support rollback to a prior endpoint-map version.
- Notify owners and record every reconciliation decision.

#### Goal P2.2: Advanced field mapping

**Status: implemented on 18 July 2026.** See `lib/runtime/field-mapping.ts`, `/api/servers/[id]/field-mappings`, the integration operations mapping preview, mapping versions/templates, and `npm run smoke:p2`.

- Support nested source/target paths, type coercion, enum translation, conditional defaults, and validation rules without arbitrary code execution.
- Provide sample-payload preview and deterministic tests before activation.
- Suggest mappings from schema diffs and recurring provider validation errors, but require confirmation.
- Version mappings and make them portable as tenant/provider templates.

#### Goal P2.3: OpenAPI Overlay and measurable semantic compression

**Status: implemented on 18 July 2026.** See `lib/openapi-overlay.ts`, model-visible schema pruning in `lib/generate-mcp.ts`, curated operation IDs in the generation pipeline, `/api/servers/[id]/compression-benchmark`, and `npm run smoke:p2`. The 70–75% saving remains explicitly a measured target rather than a claim.

- Apply OpenAPI Overlay 1.0 without modifying the source contract.
- Remove auth, tracing, transport, and known system parameters from model-visible schemas while preserving runtime injection.
- Exclude read-only fields from request input schemas and preserve write-only semantics.
- Improve intent-oriented descriptions and allow curated operation groups.
- Benchmark raw 1:1 tools vs direct tools vs catalog/Code Mode on schema tokens, tool choice, argument validity, latency, and task success.
- Treat “70–75% savings” as a target to measure, not a product claim until verified.

#### Goal P2.4: Webhook/event operations

**Status: partial on 18 July 2026.** Provider adapters, leased transitions, bounded retry/DLQ/replay controls, correlation, task binding, and audit are implemented. A deployed background worker/cron that automatically drains ready retries and a complete event-operations dashboard are still required for a fully operational queue.

- Add processing leases, explicit state transitions, retry/dead-letter queues, replay controls, and event correlation.
- Provide provider-specific signature adapters while keeping the generic verified endpoint.
- Tie webhook-triggered tool calls to the same task authorization and audit model.

### P3 — Enterprise packaging and ecosystem demos

#### Goal P3.1: Enterprise organization identity

**Status: partial on 18 July 2026.** Organization records, roles, encrypted OIDC configuration, scoped SCIM, access reviews, grant mappings, RLS, and administrator APIs exist. Organization OIDC still needs to be connected to the production login/callback flow, organization retention needs enforced purge/export jobs, and the dashboard is currently an operator guide rather than a full administration console.

- Add organizations, membership roles, SSO/OIDC configuration, SCIM where demanded, and administrative access reviews.
- Formalize the mapping from inbound enterprise identity to per-user outbound grants.
- Add tenant isolation tests and organization-level audit/retention controls.

#### Goal P3.2: Local-memory boundary integration

**Status: partial on 18 July 2026.** The bounded adapter, prompt/memory rejection contract, reference implementation, and non-persistence tests exist. Runtime audit currently stores argument names only; organization/server `argument_retention` configuration still needs to be applied dynamically before configurable retention is complete.

- Publish a reference local agent/Engram-style adapter in which memory and prompts remain local and Astrail receives only a bounded tool request plus task grant.
- Document exactly what Astrail stores and offer configurable argument retention/redaction.
- Add tests proving prompt/memory fields are neither required nor persisted.

#### Goal P3.3: Static skill-to-live-tool demo

**Status: implemented on 18 July 2026.** See `examples/static-skill-github/SKILL.md`, `lib/static-skill-tools.ts`, `/api/reference-integrations/static-skill`, `/dashboard/reference-integrations/static-skill`, and `npm run smoke:p3`.

- Convert a small `SKILL.md`-style knowledge package into safe tool definitions connected to a real API.
- Show the boundary between static instructions, local context, hosted authorization, and provider execution.
- Use this for Wonsuk’s evaluation only after the OAuth reference path is stable.

## 6. Design-partner deliverables

| Lead | Deliverable | Depends on |
|---|---|---|
| Arnaud / Kuberna | Technical call and gateway demo replacing per-deployment auth with user × agent × task permissions | P0.2 |
| Josh | Promised token-lifecycle demo: 20 concurrent calls, one refresh, revocation, and intent-linked audit | P0.1 + P0.3 |
| Drake / Aric / Engram | Architecture note and demo proving local memory with hosted auth only | P3.2, can prototype earlier |
| Wonsuk | Concrete live integration from a static skill package | P0.4 + P3.3 |
| Vivek | Five-minute product walkthrough for the scheduled meeting | P0.4; use existing features while clearly labeling roadmap items |
| Iury | Structured tester checklist for consent, connection, tool execution, revocation, and confusing UX | P0.4 |

Do not contact Umputun again. Keep Sean Yao in “not now.” Personalize every follow-up to the recipient’s project and do not claim roadmap items as shipped.

## 7. Cross-cutting engineering requirements

Every feature above must preserve these invariants:

1. The caller’s Astrail credential is never forwarded as the provider credential.
2. Provider grants are encrypted, tenant-bound, end-user-bound where applicable, and never logged.
3. Provider scopes and runtime policies fail closed before upstream execution.
4. Writes are not retried without a durable idempotency guarantee.
5. All network destinations pass public-network/HTTPS validation with bounded redirects and responses.
6. Approvals are expiring, one-time, identity-bound, and claimed before decryption/execution.
7. Request bodies, batches, retries, queues, browser sessions, and logs remain bounded.
8. Memory/prompt context is not required by the hosted gateway; any purpose field is concise, explicit, and retention-controlled.
9. New migrations use RLS, least-privilege service access, and safe rollout/fallback behavior.
10. Claims in UI/docs must distinguish implemented, preview, and planned behavior.

## 8. Repository prerequisite

The root Next.js application (`app/`, `lib/`) is the canonical source tree. The divergent legacy copy was removed for the open-source edition.

## 9. Recommended next feature

Start with **P0.1: Proactive, concurrency-safe token lifecycle**. It is the clearest overlap between the research, the strongest outreach feedback, the existing code foundation, and the promised Josh demo. It can be completed without first redesigning the entire authorization model and will generate reusable schema, audit events, tests, and UI states for the later permission and MCP OAuth work.

## 10. Definition of roadmap completion

This roadmap is complete when Astrail can truthfully demonstrate the following end to end:

> A known user authorizes a third-party SaaS account once. A trusted agent receives a short-lived task scope. Astrail intersects user, agent, task, server, and provider permissions; obtains or safely refreshes the correct encrypted grant under concurrency; pauses risky work for one-time approval; executes with bounded retries and idempotency; and produces tamper-evident evidence of who did what, why it was allowed, and what the provider returned—without exposing tokens or centralizing agent memory.
