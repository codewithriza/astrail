# Repository layout cleanup

- Move the base schema and 19 unchanged migrations into `database/`.
- Move smoke-test compiler configurations into `config/typescript/` and update script paths.
- Replace two obsolete smoke compiler configurations with the existing tsx runner; add their checks to CI.
- Add a repository-layout guide and a check preventing SQL/test configuration clutter in the root.

# 0.5.2 — Repository quality and CLI reliability

- Fix CLI notification IDs, preserved upstream errors, empty HTTP failures, SSE parsing, and session headers.
- Make TypeScript/Python SDK tool failures explicit, reject mismatched replies, and prevent credential forwarding through redirects.
- Validate CLI options and call arguments; add unit and process-level regressions.
- Align package and VERSION files to semantic version 0.5.2.
- Add repository consistency, secret scanning, Linux/Windows unit, and container startup checks.
- Run Docker on Node 22 as non-root, exclude development dependencies, and document build-time configuration.
- Pin CI actions to verified revisions and document CLI transport limitations.

# Open-source edition — 2026-09-12

- Consolidated the application into the root source tree; removed the excluded legacy app copy.
- Added an MIT license, contributor and security policies, architecture guide, and focused roadmap.
- Added a credential-free OpenAPI example with generation-policy assertions.
- Updated vulnerable dependencies; production audit reports zero findings at preparation time.
- Corrected hosted pricing, implemented real clipboard behavior and distinct connection examples, and labeled the landing preview honestly.
- Replaced the stale landing smoke test with desktop/mobile behavioral checks.
- Made schema watch opt-in and scoped it to an operator-configured URL.
- Started a fresh public history from the source revision recorded in NOTICE.

---

# Changelog

All notable changes to Astrail are documented here.

## [0.5.1.0] - 2026-07-16

### Added

- Check live platform readiness from the public status page, including configuration, database schema, edge protection, and distributed rate-limit signals.
- Read clear privacy and terms pages before connecting provider accounts or purchasing a plan.

### Changed

- Run the dashboard and hosted MCP runtime on Next.js 16 and React 19 with type and lint failures enforced during release builds.
- Explain Astrail as the production auth and runtime layer for secure multi-user agent integrations, with setup examples that match the real HTTP MCP endpoint.
- Rate-limit authenticated spec previews and cache/coalesce public health probes to protect parsing and database capacity.

### Fixed

- Repair retired `api.astrail.dev` server and bundle URLs across dashboards, runtime metadata, SDKs, workers, and limit responses.
- Allow exact same-origin MCP browser requests while rejecting untrusted origins, and recognize both apex and `www` Astrail origins.
- Pin every upstream call to validated public DNS answers, reject redirects, require HTTPS before sending credentials or payment proofs, and close pinned connections on every retry path.
- Fail closed when production schema columns are missing instead of creating incomplete MCP endpoints, and return readable client errors for empty or malformed responses.
- Remove misleading demo metrics and status claims, fix public documentation and navigation, and expand release CI across OAuth, billing, x402, Code Mode, schema, SDK, and runtime security checks.

## [0.5.0.0] - 2026-07-16

### Added

- Let each end user pay x402-protected API calls from their own Base or Solana wallet while Astrail forwards the caller-signed proof without holding funds, wallet keys, or seed phrases.
- Configure exact asset allowlists, required per-call and daily limits, optional human-approval thresholds, verified upstream domains, and settlement receipts from the server dashboard.
- Bind every payment to a short-lived upstream challenge, end-user-scoped API key, exact resource, network, asset, amount, payee, and one-time canonical proof fingerprint.

### Changed

- Keep paid requests to one pinned-DNS, non-redirecting upstream attempt and require one SDK call per x402-enabled Code Mode execution.
- Add caller-signed x402 setup and retry guidance to the landing page, docs, endpoint tester, client snippets, and generated SDK exports.

### Fixed

- Prevent proof reserialization and cross-server replay, payment-header redirect leakage, query-credential exposure, cached 402 idempotency responses, and spend reservations behind an open circuit.
- Keep ambiguous settlements counted as in doubt and persist only validated transaction metadata instead of arbitrary upstream payment responses.

## [0.4.2.1] - 2026-07-15

### Fixed

- Infer Dodo live checkout mode on production Vercel deployments when the mode variable is omitted, and reject mistyped Dodo environment values instead of silently falling back to test mode.
- Update Dodo example env files to show the Launch and Scale product ID variables used by checkout.

## [0.4.2.0] - 2026-07-15

### Changed

- Let Free workspaces host three MCP endpoints, with Launch and Scale endpoint allowances aligned across checkout, dashboard, landing-page, and billing documentation.

### Fixed

- Enforce endpoint capacity for generated servers, website imports, marketplace clones, and bundles with atomic database slot claims, safe cleanup, and retryable metering failures.
- Prevent incomplete server and bundle records from being served as hosted MCP endpoints.

## [0.4.1.0] - 2026-07-15

### Added

- Copy distinct OpenAI Agents SDK, Claude MCP, and Cursor setup examples directly from the landing page.
- Verify the displayed OpenAI example against the current SDK and a live Astrail MCP tool, with browser coverage for every copy path and client tab.

### Changed

- Teach agents to inspect tool documentation, prefer read-only calls, confirm writes, and treat tool output as untrusted data in the landing example.

### Fixed

- Make the OpenAI Agents SDK example compile in a default TypeScript project, connect before listing tools, use Astrail's real hosted endpoint format, and always close its transport.
- Copy the selected tab's exact code, report real clipboard failures, preserve keyboard focus, announce results accessibly, and prevent delayed copies from reporting the wrong client.

## [0.4.0.0] - 2026-07-15

### Added

- Curate generated MCP tools before production with explicit expose/hide controls, action-aware risk recommendations, and safe defaults for reads, writes, sends, and destructive operations.
- Give agents shared and per-tool business context, when-to-use boundaries, and API edge-case guidance through hosted MCP initialization and tool descriptions.
- Export reviewed governance manifests, production checklists, and a self-hostable Cloudflare Worker that can run fixed public REST endpoints behind explicit origin and policy controls.

### Changed

- Remove hidden tools from hosted, bundled, and exported catalogs and reject direct calls to their mapped endpoints.
- Require private Worker exports to authenticate callers, keep standalone execution opt-in, preserve runtime action policy, and fail closed for provider auth or identity-dependent policies.

### Fixed

- Prevent endpoint-catalog calls from bypassing per-tool policy, caller headers from carrying credentials upstream, and oversized or redirecting requests from crossing the exported runtime boundary.
- Stream bounded request and response bodies, apply capped retry backoff, preserve sibling runtime policy while editing business context, and validate exposure metadata at the API boundary.

## [0.3.2.1] - 2026-07-15

### Changed

- Match the sign-in page to the responsive light auth-card design used by signup, preserve every auth flow, and keep both forms from auto-zooming on iPhone.

## [0.3.2.0] - 2026-07-15

### Added

- Revoke Google, GitHub, Slack, HubSpot, Salesforce, and contract-declared OAuth grants at the provider before Astrail removes local encrypted tokens.
- Audit every agent tool call by end user, role, verified API key, reported client, provider credential, bundle, tool, timestamp, and trace from the new Agent access audit dashboard.
- Search the complete audit view and export the same redacted attribution fields as CSV or JSON.
- Bring the signup page from the Astrail Dashboard project into the main app as a responsive light auth card without changing the existing login theme.

### Changed

- Keep local OAuth ciphertext when provider revocation fails, expose revocation progress and recovery status in Connections, and safely resume stale or interrupted attempts.
- Persist blocked, approval-storage, and rate-limited tool attempts with the same identity context as successful calls.

### Fixed

- Prevent concurrent revoke requests from double-running provider calls and let already-revoked grants finish local cleanup without contacting the provider again.
- Preserve exact credential attribution across direct MCP calls, bundles, endpoint catalog invocation, idempotent replay, and static Code Mode execution without logging secrets.

## [0.3.1.0] - 2026-07-15

### Changed

- Refocus the landing page on turning API contracts, documentation, websites, and workflows into hosted MCP endpoints, with clearer runtime, architecture, and comparison copy.

### Removed

- Remove the SDK Factory promotion and navigation link from the marketing homepage while keeping SDK generation available in the dashboard and documentation.

## [0.3.0.0] - 2026-07-15

### Added

- Connect agents to third-party SaaS through per-user OAuth grants bound to the exact provider endpoints, security scheme, and API origin imported from the contract.
- Review provider identities, granted scopes, connection health, and end-user ownership in the dashboard, with explicit origin confirmation for custom OAuth providers.
- Learn the third-party SaaS OAuth workflow through a dedicated guide and clearer landing, comparison, setup, and API documentation.

### Changed

- Make hosted consent the only production OAuth-token entry path, enforce verified hosts for known providers, and require API re-import plus reconnect for legacy unbound grants.
- Scope idempotent results to the caller, role, current permissions, endpoint/provider fingerprint, and credential identity while safely blocking ambiguous pre-upgrade records.
- Preserve precise OAuth scope and credential-backend failures across direct MCP, bundle, meta-tool, and static Code Mode execution.

### Fixed

- Prevent cross-user replay, cross-provider token injection, absolute-path origin escape, bearer fallback for ambiguous legacy auth, malformed-scope fail-open behavior, and token decryption before peer-refresh scope validation.
- Select a valid grant across multiple OAuth alternatives, filter identities before bounded credential queries, and surface permanent refresh rejection as reauthorization instead of a transient retry.

## [0.2.0.0] - 2026-07-14

### Added

- Connect customers through hosted OAuth consent with PKCE, encrypted per-user credentials, provider presets, automatic refresh, and re-authentication recovery.
- Configure customer-specific request and response field mappings, bounded retry policies, idempotency, action-level permissions, and scoped consumer API keys from the dashboard.
- Create signed replay-safe webhook endpoints, monitor OpenAPI schema drift, migrate generated tools without losing policies, export audit history, and track integration setup and support costs.

### Changed

- Bind end-user identity and actor roles to API keys so callers cannot self-assign another customer or privilege level.
- Make OAuth refresh, callback state claiming, write idempotency, schema migration, health probes, audit pagination, cost aggregation, and circuit recovery safe under concurrent production traffic.
- Expand the integration operations UI and documentation with concrete setup guidance for OAuth, mappings, retries, webhooks, schema changes, audit exports, and cost measurement.

### Fixed

- Prevent prototype-property field mappings, webhook replay/header abuse, cross-tenant RLS references, double-applied argument mappings, oversized provider responses, and credential fallback across incompatible authentication schemes.
- Isolate failed JSON-RPC batch items, preserve legacy credential compatibility, rotate schema-watch work fairly, and return consistent validation errors from new APIs.
