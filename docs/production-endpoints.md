# Production MCP Endpoints

This checklist is for shipping Astrail MCP endpoints as real hosted URLs, not local demos.

## Required Environment

Set these in the hosting provider:

```text
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
NEXT_PUBLIC_RUNTIME_BASE_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
CREDENTIAL_ENCRYPTION_KEY=...
ASTRAIL_CORS_ORIGINS=https://your-domain.com,https://app.your-domain.com
RATE_LIMIT_MODE=redis
ASTRAIL_RATE_LIMIT_REDIS_REST_URL=...
ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN=...
ASTRAIL_MCP_EDGE_RATE_LIMIT_WINDOW_MS=60000
ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX=300
ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX=900
ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX=600
ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX=1800
ASTRAIL_MCP_EDGE_MAX_BODY_BYTES=256000
ASTRAIL_RUNTIME_RATE_LIMIT_MAX=120
ASTRAIL_RUNTIME_RATE_LIMIT_WINDOW_MS=60000
ASTRAIL_RUNTIME_RATE_LIMIT_BUCKETS=5000
ASTRAIL_SCHEMA_WATCH_SECRET=...
ASTRAIL_EDGE_PROVIDER=cloudflare_vercel
ASTRAIL_EDGE_DDOS_PROTECTION_CONFIRMED=true
ASTRAIL_EDGE_WAF_CONFIRMED=true
ASTRAIL_EDGE_BOT_PROTECTION_CONFIRMED=true
ASTRAIL_EDGE_BODY_SIZE_LIMIT_CONFIRMED=true
```

`ANTHROPIC_API_KEY` is optional. When it is absent or the provider is unavailable, Astrail uses deterministic MCP generation.

Use a 32-byte credential key:

```bash
openssl rand -hex 32
```

The `/api/mcp/*` abuse guard uses Redis REST rate limits when `RATE_LIMIT_MODE=redis` or `distributed` and `ASTRAIL_RATE_LIMIT_REDIS_REST_URL` plus `ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN` are set. `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are accepted aliases. `npm run verify:env` rejects missing tokens, disabled MCP edge limiting, and malformed Redis REST URLs so `/api/health` only reports `mcp_edge_rate_limit.status: "distributed"` for a production-shaped shared limiter. Without shared Redis, the guard falls back to per-instance memory buckets and should not be treated as production DDoS protection.

Provider or CDN-level controls are still required for public launch. Configure WAF/bot rules, volumetric DDoS protection, request body limits, and provider alerts outside the app before exposing public MCP endpoints broadly. Set the `ASTRAIL_EDGE_*_CONFIRMED` values only after those provider controls are active; they are operator attestations for `npm run verify:env` and `/api/health`, not automatic proof of Cloudflare, Vercel, or AWS WAF configuration.

## Runtime Surface

Every generated server is exposed at:

```text
https://your-domain.com/api/mcp/:serverId
```

Supported methods:

- `OPTIONS` for CORS preflight
- `GET` for server metadata and endpoint readiness
- `POST` for JSON-RPC MCP calls

Supported JSON-RPC methods:

- `initialize`
- `tools/list`
- `tools/call`
- `astrail/resume`

Production behavior:

- CORS headers are returned on `GET`, `POST`, and `OPTIONS`.
- JSON-RPC batch requests are supported up to 20 calls.
- Payloads over 256 KB are rejected.
- Public endpoints can be called without an Astrail API key.
- Private endpoints require `Authorization: Bearer ASTRAIL_API_KEY`.
- Hosted execution uses stored endpoint maps and does not eval generated TypeScript.
- Runtime calls return trace IDs through the tool result payload.

## SDK Factory

Every generated server can also export an SDK bundle from the dashboard or:

```text
GET /api/servers/:serverId/sdk
```

The bundle includes:

- `astrail.yaml` inferred from the endpoint map
- TypeScript SDK
- Python SDK
- Go, Java, Kotlin, Ruby, C#, and PHP SDK scaffolds
- CLI scaffold
- Terraform integration scaffold
- smoke tests
- `scripts/pull-astrail-sdk.mjs` for pulling fresh generated files
- GitHub Actions workflow that tests and opens an update PR
- GitHub Actions publish workflow template
- agent contract docs
- Stainless parity report
- MCP install manifests, including an MCP bundle-style manifest template
- `llms.txt` and a docs search index
- decorated OpenAPI with `x-codeSamples`
- generator diagnostics JSON
- conservative agent policy manifest
- eval tasks and an eval runner for reachability/docs/latency proof

The hosted MCP endpoint works first. The SDK bundle gives teams owned, reviewable client code around that endpoint.

Download and verify a bundle locally:

```bash
curl --fail --location \
  -H "Authorization: Bearer $ASTRAIL_API_KEY" \
  "https://your-domain.com/api/servers/SERVER_ID/sdk?format=tgz" \
  --output generated-sdk.tar.gz
mkdir -p generated-sdk
tar -xzf generated-sdk.tar.gz -C generated-sdk
cd generated-sdk
node scripts/verify-generated-sdk.mjs
```

Private exports require `ASTRAIL_API_KEY=agt_live_xxx`. Signed-in users can also download the archive from Dashboard → SDK Factory.

## Smoke Test

After deploying, run:

```bash
ASTRAIL_MCP_ENDPOINT=https://your-domain.com/api/mcp/petstore-code-mode npm run smoke:mcp
```

For private endpoints:

```bash
ASTRAIL_MCP_ENDPOINT=https://your-domain.com/api/mcp/SERVER_ID \
ASTRAIL_MCP_API_KEY=agt_live_xxx \
npm run smoke:mcp
```

Expected output:

```text
preflight: ok
metadata: ...
initialize: 2024-11-05
tools/list: ...
batch: ok
PASS: hosted MCP endpoint is reachable and production-shaped.
```

## Public Demo Endpoint

The runtime includes a public Code Mode demo endpoint:

```text
/api/mcp/petstore-code-mode
```

It exposes:

- `search_docs`
- `execute`

Use this endpoint for demos because it does not need Supabase-generated data.

## Ship Criteria

Before giving an endpoint to a developer:

- `npm run verify:env` passes in production env.
- `npm run build` passes.
- `npm run smoke:mcp` passes against the deployed URL.
- `node scripts/smoke-mcp-endpoint-security.mjs` passes against the deployed URL with `ASTRAIL_BASE_URL`.
- `npm run smoke:integration-operations` passes.
- `/api/health` reports `mcp_edge_rate_limit.status: "distributed"` and `edge_protection.status: "ready"`.
- Provider logs show WAF, bot, request-size, and volumetric DDoS controls acting on public `/api/mcp/*` traffic.
- `GET /api/mcp/:serverId` returns metadata.
- `OPTIONS /api/mcp/:serverId` returns a 204 with CORS headers.
- `tools/list` returns at least one tool.
- A safe read `tools/call` returns a trace ID.
- `GET /api/servers/:serverId/sdk` returns a bundle with SDKs, docs, policy, install assets, diagnostics, evals, and CI workflows.
- `node scripts/verify-generated-sdk.mjs` passes inside an unpacked SDK bundle.
- `ASTRAIL_MCP_ENDPOINT=https://your-domain.com/api/mcp/:serverId node scripts/run-astrail-evals.mjs` passes for generated eval tasks.
