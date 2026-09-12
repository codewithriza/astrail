# Astrail Security Threat Model

This document covers Astrail as a hosted MCP platform: users generate MCP servers from OpenAPI specs, website inspections, and SDK-style Code Mode docs; Astrail hosts JSON-RPC MCP endpoints under `/api/mcp/*`; credentials and OAuth tokens are stored server-side and injected only during runtime execution.

## Security Goals

- Keep public and private MCP endpoint behavior distinct and testable.
- Fail closed when auth, billing, credentials, schema, or rate-limit dependencies are missing.
- Prevent arbitrary network fetches, SSRF, token passthrough, and secrets in logs.
- Bound request size, runtime execution, Code Mode compilation, and expensive tool execution.
- Keep operational controls clear: app-level limits are guardrails, not volumetric DDoS protection.

## Primary Threats

| Threat | Current controls | Remaining work |
| --- | --- | --- |
| Volumetric DDoS | App-level MCP edge limits, payload caps, health/readiness checks | Put Cloudflare/Vercel/AWS WAF and DDoS controls in front of origin; hide origin where possible |
| Layer-7 MCP abuse | Per-IP, per-token, per-route, and global MCP limits; 429 with `Retry-After`; MCP security smoke | Tune production limits from traffic data; add provider dashboards and alerts |
| SSE or stream exhaustion | Hosted JSON-RPC endpoints are request/response today; no unbounded SSE transport in production path | If streaming is added, require connection caps, idle timeouts, and per-workspace concurrency limits first |
| Expensive tool abuse | Billing allowance checks, runtime rate limits, endpoint maps, permission policies | Add per-tool cost classes and emergency disable flags for high-cost connectors |
| Unauthenticated abuse | Private servers require Astrail API keys; public tools are filtered; dashboard auth fails closed in production | Require WAF unauth limits for `/api/mcp/*`, `/api/generate`, `/api/website-to-mcp`, login/signup |
| Auth bypass or token misuse | API keys are hashed; credential secrets are encrypted; OAuth refresh persistence requires service role | Add key rotation UI and anomaly alerts for bearer-token spray |
| `MCP-Session-Id` hijacking | Session IDs are not used as auth; Authorization bearer is the private endpoint authority | Keep this invariant in tests if sessionful MCP is added |
| SSRF | Runtime network policy rejects private/loopback/metadata targets before fetch | Keep URL validation centralized; add allowlists for high-risk enterprise connectors |
| Prompt or tool injection | Hosted execution uses endpoint maps and no-eval Code Mode compiler; generated tool instructions are advisory | Add model-output trust-boundary review for any future autonomous agent actions |
| Secrets in logs | Runtime redaction for credentials and sensitive fields; credential APIs never return plaintext | Extend redaction fixtures for OAuth provider-specific response shapes |
| CORS/header issues | MCP Origin rejection for disallowed origins; security headers in middleware; CORS allowlist env | Do not ship wildcard CORS with credentialed browser clients |
| Supply chain | Lockfile, Cloud QA, generated publish workflows are manual and confirm-gated | Run `npm audit --omit=dev --audit-level=critical` in release checks |
| Cloud bill shock | Billing limits and runtime limits cap workspace usage | Add provider-level budget alerts and kill switches |

## Route Inventory

| Route family | Auth | Rate/resource limit | Security notes |
| --- | --- | --- | --- |
| `/api/mcp/:serverId` | Public servers allow no key; private servers require `Authorization: Bearer ASTRAIL_API_KEY` | MCP edge IP/token/global limits, body cap, runtime billing and policy checks | Highest-risk public surface; must sit behind WAF/CDN controls |
| `/api/servers/*`, `/api/bundles`, `/api/apikeys`, `/api/credentials` | Neon Auth session and/or dedicated admin identity server-side | Standard Next route limits; credential writes require encryption key | Never return plaintext secrets; API keys are one-time display only |
| `/api/generate`, `/api/spec-preview`, `/api/website-to-mcp` | Dashboard session for saved generation paths | Generation and inspection should be bounded by payload/time limits | Treat remote spec/website fetches as SSRF-sensitive |
| `/api/auth/oauth`, `/api/auth/otp`, `/api/auth/demo` | Neon Auth; demo disabled in production | Edge/WAF unauth flood limits needed | Callback redirects must stay same-origin or configured app origin |
| `/api/billing/*` | Auth for checkout/status/portal; Dodo webhook signature for webhook | Provider retry limits plus webhook idempotency table | Webhook secrets server-side only |
| `/api/health`, `/status`, static pages | Public | Provider cache/rate controls | Health must be safe and not expose secrets |

## Priority Checklist

### Critical

- Put public `/api/mcp/*` behind provider WAF/DDoS controls before broad launch.
- Configure `ASTRAIL_RATE_LIMIT_REDIS_REST_URL` and `ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN` or Upstash aliases so MCP limits are distributed.
- Keep `ASTRAIL_REQUIRE_AUTH=true` and demo auth disabled in production.
- Run `npm run verify:env`, `npm run verify:schema`, `node scripts/smoke-mcp-endpoint-security.mjs`, and deployed smoke tests before launch.

### High

- Configure strict `ASTRAIL_CORS_ORIGINS` for production domains.
- Add provider alerts for 401/403/413/429 spikes, `permission_denied`, `billing_required`, and upstream timeout spikes.
- Add budget alerts for hosting, Redis, Neon, Anthropic, and payment-webhook retries.
- Exercise Dodo webhook replay/idempotency and OAuth token refresh failure paths.

### Medium

- Add per-tool cost classes and emergency deny/disable toggles for expensive integrations.
- Add API key rotation and last-used anomaly review in the dashboard.
- Expand redaction tests for provider-specific OAuth and REST errors.

### Low

- Add formal quarterly dependency and generated-SDK workflow reviews.
- Add tabletop DDoS and leaked-token exercises.
