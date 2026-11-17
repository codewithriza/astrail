# Edge DDoS and WAF Setup

Astrail's app-level MCP limiter is an operational guardrail. It is not a replacement for provider or CDN DDoS protection. Public launch should place all production traffic behind a provider edge that can absorb volumetric traffic before it reaches the Next.js origin.

This repo currently has no deployment IaC for Cloudflare, AWS WAF, Vercel Firewall, or Terraform, so configure these controls in the hosting provider console and mirror the settings in runbooks.

## Required Zones

Protect these surfaces separately:

| Surface | Examples | Baseline control |
| --- | --- | --- |
| Hosted MCP | `/api/mcp/*` | Strictest unauth limits, bot protection, body-size cap, token spray limits |
| Auth | `/login`, `/signup`, `/api/auth/*` | Bot/flood protection, IP reputation, callback allowlist |
| Generation/import | `/api/generate`, `/api/spec-preview`, `/api/website-to-mcp` | Low unauth allowance, body cap, SSRF logging |
| Billing webhooks | `/api/billing/webhook/dodo` | Signature verification, provider IP/rate allowlist if Dodo publishes stable ranges |
| Dashboard/API | `/dashboard/*`, `/api/servers/*`, `/api/credentials`, `/api/apikeys` | Auth-required, low mutation limits |
| Static/public | `/`, `/docs`, `/blog/*`, assets | Cache aggressively; permissive read limits |

## Cloudflare Baseline

- Put `astrail.dev` behind proxied Cloudflare DNS.
- Enable DDoS protection, Bot Fight Mode or Bot Management, and WAF managed rules.
- Keep the Vercel origin behind Cloudflare where possible. Do not expose bypass domains in customer docs, SDK examples, or monitoring dashboards.
- Add rate-limit rules:
  - `/api/mcp/*`: 60 requests per minute per IP for unauthenticated requests, higher only for known customers.
  - `/api/mcp/*` with repeated 401/403/413/429: challenge or block for 10 minutes.
  - `/api/auth/*`, `/login`, `/signup`: challenge high-volume IPs and obvious automation.
  - `/api/generate`, `/api/spec-preview`, `/api/website-to-mcp`: low per-IP burst limits and body-size cap.
- Configure Cloudflare Turnstile for dashboard mutation and test flows:
  - Register production domains, `www`, and any protected preview domains in the Turnstile widget.
  - Set `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`, and `CLOUDFLARE_TURNSTILE_REQUIRED=true` on the app origin.
  - Keep Turnstile on dashboard create/test actions, not on raw `/api/mcp/*` protocol calls, so external MCP clients are not forced through a browser challenge.
- Add token-spray rules for `/api/mcp/*`:
  - challenge or block high-cardinality `Authorization` attempts from the same IP or ASN.
  - challenge requests with missing or suspicious user agents once error rates rise.
  - alert on repeated random `serverId` paths even when the app returns 401/404/429.
- Add body-size and method rules:
  - Block non-`GET`/`POST`/`OPTIONS` to `/api/mcp/*`.
  - Cap `/api/mcp/*` request bodies near `ASTRAIL_MCP_EDGE_MAX_BODY_BYTES`.
  - Cap import/generation routes according to product limits.
- Add alerts for WAF blocks, challenged traffic, 429 spikes, origin 5xx, and bandwidth anomalies.

## Vercel Baseline

- Use Vercel Firewall or project-level protection for `/api/mcp/*`, `/api/auth/*`, and generation routes.
- Configure trusted production domains only. Keep preview deployments protected.
- Use Vercel Observability or log drains to alert on MCP 401/403/413/429/5xx spikes.
- Add Firewall rules for the same route groups listed above if Vercel receives traffic directly or as the Cloudflare origin.
- Keep Vercel preview URLs password-protected or team-only. Do not treat preview deployments as protected by production Cloudflare rules unless the preview domain is actually routed through the same edge policy.
- Use Vercel request logs to confirm oversized MCP requests return `413` before reaching expensive runtime paths.
- Keep origin env set:
  - `ASTRAIL_CORS_ORIGINS=https://astrail.dev,https://www.astrail.dev`
  - `RATE_LIMIT_MODE=redis`
  - `ASTRAIL_RATE_LIMIT_REDIS_REST_URL`
  - `ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN`
  - `ASTRAIL_MCP_EDGE_RATE_LIMIT_DISABLED` unset or `false`
  - `ASTRAIL_MCP_EDGE_MAX_BODY_BYTES=256000`

## App Guardrails

Configure the app only after the provider controls above are active:

```bash
RATE_LIMIT_MODE=redis
ASTRAIL_RATE_LIMIT_REDIS_REST_URL=<upstash-or-redis-rest-url>
ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN=<secret>
ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS=60000
ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX=300
ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX=900
ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX=600
ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX=1800
ASTRAIL_MCP_EDGE_MAX_BODY_BYTES=256000
ASTRAIL_EDGE_PROVIDER=cloudflare_vercel
ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED=true
ASTRAIL_EDGE_WAF_CONFIRMED=true
ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED=true
ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED=true
NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY=<cloudflare-turnstile-site-key>
CLOUDFLARE_TURNSTILE_SECRET_KEY=<cloudflare-turnstile-secret-key>
CLOUDFLARE_TURNSTILE_REQUIRED=true
```

The `ASTRAIL_EDGE_*_CONFIRMED` values are operator attestations so `npm run verify:env` and `/api/health` can fail closed before launch. They are not automatic proof that Cloudflare, Vercel, or AWS WAF is configured correctly.

## AWS WAF Baseline

- Attach AWS WAF to CloudFront or ALB in front of the app.
- Enable AWS managed common, known-bad-input, IP reputation, and bot-control rule groups.
- Add path-specific rules for MCP, auth, generation/import, billing webhook, and static traffic.
- Add scope-down statements for `/api/mcp/*` with per-IP and per-token header rate rules.

## Origin Protection

Best option: make the app origin reachable only from the CDN or provider edge. If the platform supports it, restrict origin ingress to provider IP ranges or private networking.

If network-level origin locking is unavailable, add an origin shared secret at the provider edge:

- Edge adds `x-astrail-origin-guard: <secret>` to origin requests.
- Origin middleware rejects protected production routes when the header is missing or wrong.
- Rotate the secret like any other production credential.
- Do not expose the secret to browsers, generated SDKs, logs, or client-side code.

Do not enable this header check until the CDN/provider is configured to inject it, or direct production traffic will fail. Health checks should either pass through the same edge path or use a separate private provider health probe.

## Validation

- `npm run verify:env`
- `ASTRAIL_BASE_URL=https://<deployment> node scripts/smoke-mcp-endpoint-security.mjs`
- Confirm `/api/health` reports `mcp_edge_rate_limit.status: "distributed"` and `edge_protection.status: "ready"`.
- Confirm `/api/generate`, `/api/website-to-mcp`, and `/api/mcp-test-challenge` reject missing or invalid Turnstile tokens when `CLOUDFLARE_TURNSTILE_REQUIRED=true`.
- Confirm direct origin access is blocked or unavailable.
- Confirm provider logs show WAF events for simulated bad Origin, oversized body, bot/challenge traffic, and request flood tests.
- Confirm a real oversized MCP request is rejected at the provider edge or app middleware with `413`, not forwarded into runtime execution.

## Rollback

If a WAF rule blocks legitimate customers:

1. Prefer narrowing the rule scope over disabling all protection.
2. Keep the app Redis limiter enabled while relaxing provider challenges.
3. Lower app limits temporarily if the origin remains pressured.
4. Preserve provider event samples before deleting or editing rules.
