# Astrail Billing and Credits Setup

Use this checklist before taking real customers through checkout.

## Product Rules

Astrail sells monthly workspace plans. Each plan includes monthly credits plus plan limits for hosted endpoints, MCP generations, and runtime tool calls.

| Plan | Price | Monthly credits | Tool calls | Generations | Hosted endpoints |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | $0/mo | 500 | 50 | 1 | 3 |
| Launch | $19/mo | 25,000 | 20,000 | 25 | 10 |
| Scale | $99/mo | 250,000 | 200,000 | 150 | 100 |

Hosted endpoint limits apply when creating servers and bundles. If a workspace downgrades while above its new limit, existing endpoints keep serving to avoid breaking deployed agents, but no new endpoint can be created until usage drops below the new plan limit.

Credit costs:

| Action | Credits | Charged when |
| --- | ---: | --- |
| Runtime tool call | 1 | A hosted MCP endpoint accepts a valid `tools/call` request. |
| OpenAPI MCP generation | 250 | A successful OpenAPI/docs-to-MCP endpoint is saved. |
| Website to MCP inspection | 500 | A successful Website-to-MCP endpoint is saved. |
| SDK export | 100 | A downloadable SDK/docs bundle is built for a generated server. |
| Hosted endpoint slot | 0 | Enforced as a plan limit, not a credit charge. |

Not charged:

- failed OpenAPI discovery
- failed validation
- invalid JSON-RPC
- auth failures
- rate-limit failures
- `initialize`
- `tools/list`
- duplicate SDK re-downloads for the same server inside the current billing period

## Required Neon Tables

Apply `neon-schema.sql` to Neon. If you already ran the older runtime schema, also run:

```bash
neon-migration-billing.sql
neon-migration-hosted-endpoint-limits.sql
```

Then verify:

```bash
npm run verify:schema
```

The verifier checks:

- `billing_webhook_events`
- `billing_subscriptions`
- `billing_payment_events`
- `billing_usage`
- `hosted_endpoint_slots`
- protected RLS for subscriptions and usage
- runtime observability tables used for credit metering

## Dodo Payments Environment

Set these in Vercel for Production:

```txt
DODO_PAYMENTS_API_KEY=<live API key>
DODO_PAYMENTS_ENVIRONMENT=live_mode
DODO_PRODUCT_LAUNCH=<Launch $19/mo subscription product id>
DODO_PRODUCT_SCALE=<Scale $99/mo subscription product id>
DODO_PAYMENTS_WEBHOOK_KEY=<webhook signing secret>
NEXT_PUBLIC_APP_URL=https://astrail.dev
NEXT_PUBLIC_SITE_URL=https://astrail.dev
NEXT_PUBLIC_RUNTIME_BASE_URL=https://astrail.dev
```

For test mode:

```txt
DODO_PAYMENTS_ENVIRONMENT=test_mode
DODO_PAYMENTS_API_KEY=<test API key>
DODO_PRODUCT_LAUNCH=<test Launch subscription product id>
DODO_PRODUCT_SCALE=<test Scale subscription product id>
DODO_PAYMENTS_WEBHOOK_KEY=<test webhook signing secret>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_RUNTIME_BASE_URL=http://localhost:3000
```

Do not create a `NEXT_PUBLIC_DODO_PAYMENTS_API_KEY`; Dodo API and webhook secrets must stay server-side.

`DODO_PRODUCT_BUILDER`, `DODO_PRODUCT_STARTER`, `DODO_PRODUCT_PRO`, `DODO_PAYMENTS_PRODUCT_LAUNCH`, `DODO_PAYMENTS_PRODUCT_BUILDER`, `DODO_PAYMENTS_PRODUCT_STARTER`, and `DODO_PAYMENTS_PRODUCT_PRO` are accepted as Launch aliases for older deployments, but new Vercel projects should use `DODO_PRODUCT_LAUNCH`.

`DODO_PRODUCT_TEAM` and `DODO_PAYMENTS_PRODUCT_TEAM` are accepted as Scale aliases for older deployments, but new Vercel projects should use `DODO_PRODUCT_SCALE`.

The checkout API sends metadata with:

- `source=astrail`
- `plan`
- `plan_name`
- `monthly_credits`
- `monthly_tool_calls`
- `monthly_generations`
- `hosted_endpoints`
- `user_id`
- `email`

The webhook stores the raw event in `billing_webhook_events`, stores payment events in `billing_payment_events`, and upserts workspace entitlement state in `billing_subscriptions`.

## Webhook URL

Configure this endpoint in Dodo:

```txt
https://astrail.dev/api/billing/webhook/dodo
```

For Vercel preview or local tunnel testing, use the matching deployment URL with the same path.

Subscribe the Dodo endpoint to these events:

- `subscription.active`
- `subscription.updated`
- `subscription.renewed`
- `subscription.plan_changed`
- `subscription.on_hold`
- `subscription.cancelled`
- `subscription.failed`
- `subscription.expired`
- `payment.succeeded`
- `payment.failed`

The webhook verifies Dodo's Standard Webhooks signature headers and stores the Dodo `webhook-id` in `billing_webhook_events`. Payment events are stored in `billing_payment_events`.

Paid plan access is granted only when Astrail has a payment-confirmed entitlement:

- `payment.succeeded` records `paid_confirmed_at` and can activate the paid plan.
- `subscription.active`, `subscription.updated`, and `subscription.renewed` update the subscription period and status, but remain `pending_payment` until a successful payment is recorded.
- `subscription.on_hold`, `subscription.cancelled`, `subscription.failed`, and `subscription.expired` set the entitlement inactive and move `profiles.plan` back to `free`.
- Older subscription webhooks are ignored when a newer `dodo_last_event_at` already exists, so out-of-order delivery cannot rewind a workspace to stale billing state.

## Checkout Flow

1. Visitor picks a plan on `/payment`.
2. Free routes to `/signup`.
3. Launch and Scale route to `/signup?plan=starter` or `/signup?plan=team`. The public plan id remains `starter` for backwards compatibility, but users see Launch.
4. Signup creates/signs in the user first.
5. After auth, paid plans redirect to `/dashboard/billing?plan=<plan>`.
6. The user clicks the plan CTA and `/api/billing/checkout` creates a Dodo checkout.
7. Dodo redirects back to `/dashboard/billing?checkout=complete&plan=<plan>`.
8. Dodo webhook records the successful payment and updates `billing_subscriptions.entitlement_status`.
9. `/api/billing/status` returns the active plan and usage summary.
10. Paid users can open Dodo Customer Portal through `/api/billing/portal` after the webhook stores their `dodo_customer_id`.

## Production Smoke Test

After env vars and webhook are configured:

```bash
npm run verify:env
npm run verify:schema
npm run lint
npm run build
```

Manual test:

1. Open `/payment`.
2. Choose Launch.
3. Create an account with Google or magic link.
4. Confirm you land on `/dashboard/billing?plan=starter`.
5. Click Upgrade.
6. Complete a test checkout.
7. Confirm `billing_payment_events` has a `payment.succeeded` row and `/api/billing/status` returns `plan: "starter"` with an active entitlement.
8. Generate endpoints until a limit is reached and confirm the API returns HTTP `402` with `billing` and `billingAction`.
9. Call a hosted MCP tool past the credit/tool-call limit and confirm the MCP response includes `billing_required`.

## Edge Cases

- If Dodo env vars are missing, checkout returns HTTP `503` and the UI shows a temporary billing message.
- If the Neon admin service identity is missing, usage returns `enforcement: "unavailable"` and production should not launch.
- If `tool_call_logs` is unavailable but `mcp_servers.call_count` exists, enforcement uses `best_effort`.
- Failed generations are saved for diagnostics but excluded from successful generation credit usage.
- SDK exports write to `billing_usage` and are deduplicated per server per billing period.
- Paid checkout requires an authenticated workspace user so subscriptions map to a real `user_id`.
- Paid entitlements require `entitlement_status='active'`, a non-null `paid_confirmed_at`, and a non-expired billing period.
- Dodo one-time credit packs should wait until a dedicated credit ledger/top-up table is connected, so webhook retries cannot double-apply credits.
