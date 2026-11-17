# DDoS and MCP Abuse Incident Response

Use this runbook when Astrail sees traffic floods, high MCP error rates, origin saturation, runaway tool calls, or provider cost spikes.

## Detect

Signals:

- CDN/WAF traffic or challenge spike.
- Origin CPU, memory, bandwidth, request queue, or 5xx spike.
- `/api/mcp/*` 401, 403, 413, 429, or timeout spike.
- `permission_denied`, `billing_required`, or upstream timeout spike in tool logs.
- Redis rate-limit command volume spike.
- Anthropic, Supabase, or hosting cost anomaly.

## Classify

| Incident type | Indicators | First control |
| --- | --- | --- |
| Edge/network DDoS | Huge request volume before app, many IPs, bandwidth spike | CDN DDoS/WAF emergency mode |
| Layer-7 API abuse | Concentrated paths, realistic HTTP, 401/403/429 growth | Tighten path rate limits and bot challenges |
| Expensive MCP abuse | Valid traffic causing tool calls, upstream/API costs, billing limits hit | Lower app limits, disable high-cost tools, enforce billing |
| Auth/token attack | Bearer token spray, many 401s, unusual valid-key geography | Block sources, rotate affected keys, audit key usage |
| Webhook or callback abuse | Repeated billing/auth callback hits | Provider allowlist, signature checks, route-specific rate limits |

## First 5 Actions

1. Turn on provider emergency DDoS or WAF managed challenge mode for public traffic.
2. Tighten `/api/mcp/*` WAF limits and block obvious abusive IPs, ASNs, countries, or user agents.
3. Confirm the app is in distributed Redis mode before trusting app counters across instances:
   - `/api/health` should show `mcp_edge_rate_limit.status: "distributed"`.
   - `RATE_LIMIT_MODE` should be `redis` or `distributed`.
   - `ASTRAIL_RATE_LIMIT_REDIS_REST_URL` and `ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN` or their Upstash aliases must both be set.
4. Lower app env limits if origin is still pressured:
   - `ASTRAIL_MCP_EDGE_RATE_LIMIT_MAX`
   - `ASTRAIL_MCP_EDGE_GLOBAL_RATE_LIMIT_MAX`
   - `ASTRAIL_MCP_EDGE_BEARER_RATE_LIMIT_MAX`
   - `ASTRAIL_MCP_EDGE_GLOBAL_BEARER_RATE_LIMIT_MAX`
   - `ASTRAIL_MCP_EDGE_MAX_BODY_BYTES`
   - `ASTRAIL_RUNTIME_RATE_LIMIT_MAX`
5. Disable or hide expensive generated tools/connectors for affected workspaces if cost is the risk.
6. Preserve evidence before broad cleanup: WAF events, app logs, trace IDs, API key previews, route rates, provider billing snapshots, Redis command volume, and representative request headers with secrets redacted.

## Degraded Mode

- Keep static marketing/docs online through CDN cache if possible.
- Keep `/api/health` safe and minimal.
- Temporarily pause generation/import routes if upstream costs or SSRF risk are elevated.
- Keep billing webhooks available if provider retries would otherwise accumulate.
- Return clear `429`, `billing_required`, or `permission_denied` responses instead of generic 500s.
- Prefer WAF challenge or route-specific block rules over disabling the whole application when only `/api/mcp/*` is under attack.
- If request bodies are part of the attack, lower `ASTRAIL_MCP_EDGE_MAX_BODY_BYTES` and mirror the lower cap in Cloudflare/Vercel before redeploying.

## Block and Rotate

- Revoke or rotate leaked Astrail API keys.
- Rotate OAuth/provider credentials if traces show credential misuse.
- Rotate `ASTRAIL_RATE_LIMIT_REDIS_REST_TOKEN` if Redis credentials are exposed.
- Rotate origin guard secret if direct-origin bypass is suspected.

## Communications

Internal update template:

```text
Status: investigating / mitigating / monitoring / resolved
Impact: affected routes, customers, and timeframe
Control applied: WAF/rate-limit/key rotation/degraded mode
Evidence: dashboard links, trace IDs, sample request IDs
Next update: time
```

Customer update template:

```text
Astrail is mitigating elevated traffic against hosted MCP endpoints. Some MCP requests may see temporary 429 responses while protections are tuned. Stored credentials remain encrypted, and we will post a follow-up when traffic normalizes.
```

## Recovery

- Gradually relax WAF rules and app limits after traffic normalizes.
- Confirm `npm run verify:env`, `/api/health`, and deployed MCP security smoke pass.
- Confirm `/api/health` reports both `mcp_edge_rate_limit.status: "distributed"` and `edge_protection.status: "ready"` before calling the incident resolved.
- Confirm provider logs still show WAF, bot, request-size, and volumetric protections active after rules are relaxed.
- Review cost impact and credit adjustments.
- File a postmortem with root cause, timeline, affected controls, missed alerts, and follow-up owners.

## Postmortem Checklist

- Did traffic reach the origin before provider WAF/DDoS controls acted?
- Were app limits distributed through Redis, or did any instance fall back to memory counters?
- Did body-size rules reject oversized JSON-RPC requests before runtime execution?
- Did bot/challenge rules affect legitimate customers?
- Were auth/token spray attempts visible in WAF logs and app trace logs?
- Are `ASTRAIL_EDGE_*_CONFIRMED` env attestations still accurate after any provider-rule rollback?
