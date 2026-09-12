import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";
import { extractDodoEventFields, getDodoWebhookSecret } from "@/lib/billing/dodo";
import { processDodoBillingWebhook } from "@/lib/billing/webhook-processing";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = getDodoWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: "Webhook verification is not configured." }, { status: 503 });
  }

  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: "Webhook storage is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const webhookHeaders = getStandardWebhookHeaders(request.headers);
  let payload: unknown;

  try {
    payload = new Webhook(secret).verify(rawBody, webhookHeaders);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = extractDodoEventFields(payload);
  const webhookId = webhookHeaders["webhook-id"] ?? event.id;
  if (!webhookId) {
    return NextResponse.json({ error: "Missing webhook id." }, { status: 400 });
  }

  const db = createAdminClient();
  const sync = await processDodoBillingWebhook(db, event, {
    webhookId,
    eventAt: event.eventCreatedAt ?? eventCreatedAtFromHeader(webhookHeaders["webhook-timestamp"]) ?? new Date().toISOString(),
    payload,
  });
  if (!sync.ok) {
    console.error("astrail.billing.webhook.subscription_sync_failed", {
      event_type: event.type ?? "unknown",
      webhook_id: webhookId,
      reason: sync.error,
    });

    return NextResponse.json({ error: "Webhook could not be processed." }, { status: 500 });
  }

  return NextResponse.json({ received: true, processed: sync.processed });
}

function getStandardWebhookHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  for (const key of ["webhook-id", "webhook-signature", "webhook-timestamp"]) {
    const value = headers.get(key);
    if (value) result[key] = value;
  }

  return result;
}

function eventCreatedAtFromHeader(value?: string) {
  if (!value) return null;
  const timestamp = Number(value);
  const date = Number.isFinite(timestamp) ? new Date(timestamp * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
