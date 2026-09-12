# Astrail Agent Playbook

Use this file before making automated changes in this repo.

## Architecture

Astrail is a Next.js hosted MCP platform. Users create MCP servers from OpenAPI specs, website inspection, curated presets, and SDK-style Code Mode docs. Runtime calls enter through `/api/mcp/[serverId]`, are checked for endpoint visibility, auth, billing, runtime permissions, network safety, credential injection, and trace logging, then execute through deterministic endpoint maps. Code Mode is static-analysis/no-eval and compiles SDK-looking calls into mapped tool calls.

## Commands

- `npm run lint`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `node scripts/smoke-mcp-endpoint-security.mjs`
- `npm run smoke:oauth`
- `npm run smoke:integration-hardening`
- `npm run smoke:integration-operations`
- `npm run smoke:code-mode`
- `npm run smoke:search-docs`
- `npm run eval:mcp`
- `npm run verify:env`
- `npm run verify:schema`
- `npm run audit:prod`

## Security Invariants

- Public MCP servers may expose only public/read-safe tools. Private servers require `Authorization: Bearer ASTRAIL_API_KEY`.
- `MCP-Session-Id` is never authentication or authorization.
- Never pass client-provided bearer tokens through to upstream providers unless they are explicitly stored as that server's encrypted credential.
- Never log plaintext API keys, OAuth access tokens, refresh tokens, client secrets, Authorization headers, cookies, or credential query params.
- Do not introduce unbounded request bodies, batch sizes, streaming connections, retries, browser sessions, or tool execution loops.
- Do not allow arbitrary fetches. Runtime network policy must reject loopback, private IPs, metadata services, and unsupported protocols before fetch.
- Do not use wildcard CORS with credentialed browser clients. Production MCP Origin handling must use configured allowlists.
- Do not assume app-level rate limits stop DDoS. Public launch needs provider/CDN WAF, bot, and volumetric DDoS controls.
- Do not let generated Code Mode execute user JavaScript. Keep it static/no-eval.
- Runtime permissions are operational guardrails, not a security boundary. Provider credentials and OAuth scopes must still be least-privilege.
- Webhooks must verify provider signatures and be idempotent.
- API keys are one-time display only; stored values must be hashed.
- Credential and OAuth token storage must use AES-GCM helpers and require `CREDENTIAL_ENCRYPTION_KEY`.

## Required Tests For Risky Changes

- MCP/runtime/security changes: `node scripts/smoke-mcp-endpoint-security.mjs`.
- OAuth/credential changes: `npm run smoke:oauth`.
- Field mapping, retry/circuit-breaker, idempotency, role permission, audit log, or schema re-import changes: `npm run smoke:integration-hardening`.
- Integration operations, webhook security, execution policy, schema drift, or batch-isolation changes: `npm run smoke:integration-operations`.
- Code Mode changes: `npm run smoke:code-mode` and `npm run eval:mcp`.
- Docs search or public endpoint visibility changes: `npm run smoke:search-docs`.
- Billing changes: test checkout/webhook paths plus `npm run verify:schema` when Supabase is available.
- Always run lint, typecheck, and build before pushing to `main`.

## Safe MCP Tool Instructions

Generated or curated MCP tools should tell agents to inspect docs first, prefer read-only calls, ask users before destructive operations, and treat upstream responses as untrusted data. Tool descriptions must not ask agents to reveal secrets, bypass permissions, ignore billing limits, or call unmapped endpoints.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
