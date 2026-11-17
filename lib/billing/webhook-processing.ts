import type { DodoEventFields } from "@/lib/billing/dodo";

type BillingAdminClient = ReturnType<typeof import("@/lib/neon/server").createAdminClient>;

type ExistingSubscription = {
  plan?: string | null;
  status?: string | null;
  dodo_customer_id?: string | null;
  dodo_subscription_id?: string | null;
  dodo_payment_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  entitlement_status?: string | null;
  paid_confirmed_at?: string | null;
  last_payment_status?: string | null;
  last_payment_at?: string | null;
  dodo_last_event_at?: string | null;
};

type ProcessParams = {
  webhookId: string;
  eventAt: string;
  payload: unknown;
};

type ProcessResult =
  | { ok: true; processed: boolean }
  | { ok: false; processed: boolean; error: string };

export async function processDodoBillingWebhook(
  db: BillingAdminClient,
  event: DodoEventFields,
  params: ProcessParams,
) {
  const stored = await storeWebhookEvent(db, event, params);
  if (!stored.ok) return stored;

  let result: ProcessResult;
  if (isPaymentEvent(event.type)) {
    result = await processPaymentEvent(db, event, params);
  } else if (isSubscriptionEvent(event.type)) {
    result = await processSubscriptionEvent(db, event, params);
  } else {
    result = { ok: true as const, processed: false };
  }

  await updateWebhookProcessingResult(
    db,
    params.webhookId,
    result.ok ? (result.processed ? "processed" : "ignored") : "error",
  );
  return result;
}

async function storeWebhookEvent(db: BillingAdminClient, event: DodoEventFields, params: ProcessParams) {
  const row = {
    dodo_event_id: params.webhookId,
    event_type: event.type ?? "unknown",
    user_id: event.userId,
    event_created_at: params.eventAt,
    processing_result: "received",
    payload: params.payload,
    processed_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("billing_webhook_events")
    .upsert(row, { onConflict: "dodo_event_id" });

  if (!error) return { ok: true as const, processed: false };
  return { ok: false as const, processed: false, error: error.message };
}

async function processPaymentEvent(db: BillingAdminClient, event: DodoEventFields, params: ProcessParams) {
  const existing = event.userId ? await loadExistingSubscription(db, event.userId) : null;
  const paymentStatus = normalizePaymentStatus(event);
  const paymentSucceeded = isSuccessfulPayment(event.type, paymentStatus);
  const stalePayment = isAfter(existing?.last_payment_at, params.eventAt);

  const paymentStore = await storePaymentEvent(db, event, params, paymentStatus);
  if (!paymentStore.ok) return paymentStore;

  if (!event.userId || !event.plan || stalePayment) {
    return { ok: true as const, processed: false };
  }

  const previousActive = existing?.entitlement_status === "active";
  const entitlementStatus = paymentSucceeded ? "active" : previousActive ? "active" : "inactive";
  const status = paymentSucceeded ? "paid" : previousActive ? existing?.status ?? "active" : paymentStatus;
  const paidConfirmedAt = paymentSucceeded ? params.eventAt : existing?.paid_confirmed_at ?? null;
  const profilePlan = entitlementStatus === "active" ? event.plan : "free";

  const profile = await upsertProfilePlan(db, event, profilePlan);
  if (!profile.ok) return profile;

  const { error } = await db
    .from("billing_subscriptions")
    .upsert(
      {
        user_id: event.userId,
        plan: event.plan,
        status,
        entitlement_status: entitlementStatus,
        paid_confirmed_at: paidConfirmedAt,
        dodo_customer_id: event.customerId ?? existing?.dodo_customer_id ?? null,
        dodo_subscription_id: event.subscriptionId ?? existing?.dodo_subscription_id ?? null,
        dodo_payment_id: event.paymentId ?? existing?.dodo_payment_id ?? null,
        current_period_start: normalizeDate(event.currentPeriodStart) ?? existing?.current_period_start ?? null,
        current_period_end: normalizeDate(event.currentPeriodEnd) ?? existing?.current_period_end ?? null,
        cancel_at_period_end: event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false,
        last_payment_status: paymentStatus,
        last_payment_at: params.eventAt,
        dodo_last_event_id: params.webhookId,
        dodo_last_event_type: event.type ?? "unknown",
        dodo_last_event_at: params.eventAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) return { ok: false as const, processed: false, error: error.message };
  return { ok: true as const, processed: true };
}

async function processSubscriptionEvent(db: BillingAdminClient, event: DodoEventFields, params: ProcessParams) {
  if (!event.userId || !event.plan) {
    return { ok: true as const, processed: false };
  }

  const existing = await loadExistingSubscription(db, event.userId);
  if (isAfter(existing?.dodo_last_event_at, params.eventAt)) {
    return { ok: true as const, processed: false };
  }

  const normalizedStatus = normalizeBillingStatus(event.status);
  const paidConfirmedAt = existing?.paid_confirmed_at ?? null;
  const entitlementStatus = isActiveBillingStatus(normalizedStatus)
    ? paidConfirmedAt ? "active" : "pending_payment"
    : "inactive";
  const profilePlan = entitlementStatus === "active" ? event.plan : "free";

  const profile = await upsertProfilePlan(db, event, profilePlan);
  if (!profile.ok) return profile;

  const { error } = await db
    .from("billing_subscriptions")
    .upsert(
      {
        user_id: event.userId,
        plan: event.plan,
        status: normalizedStatus,
        entitlement_status: entitlementStatus,
        paid_confirmed_at: paidConfirmedAt,
        dodo_customer_id: event.customerId ?? existing?.dodo_customer_id ?? null,
        dodo_subscription_id: event.subscriptionId ?? existing?.dodo_subscription_id ?? null,
        dodo_payment_id: event.paymentId ?? existing?.dodo_payment_id ?? null,
        current_period_start: normalizeDate(event.currentPeriodStart) ?? existing?.current_period_start ?? null,
        current_period_end: normalizeDate(event.currentPeriodEnd) ?? existing?.current_period_end ?? null,
        cancel_at_period_end: event.cancelAtPeriodEnd ?? existing?.cancel_at_period_end ?? false,
        last_payment_status: existing?.last_payment_status ?? null,
        last_payment_at: existing?.last_payment_at ?? null,
        dodo_last_event_id: params.webhookId,
        dodo_last_event_type: event.type ?? "unknown",
        dodo_last_event_at: params.eventAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) return { ok: false as const, processed: false, error: error.message };
  return { ok: true as const, processed: true };
}

async function updateWebhookProcessingResult(
  db: BillingAdminClient,
  webhookId: string,
  processingResult: "processed" | "ignored" | "error",
) {
  await db
    .from("billing_webhook_events")
    .update({
      processing_result: processingResult,
      processed_at: new Date().toISOString(),
    })
    .eq("dodo_event_id", webhookId);
}

async function storePaymentEvent(
  db: BillingAdminClient,
  event: DodoEventFields,
  params: ProcessParams,
  paymentStatus: string,
) {
  const { error } = await db
    .from("billing_payment_events")
    .upsert(
      {
        dodo_event_id: params.webhookId,
        dodo_payment_id: event.paymentId,
        user_id: event.userId,
        dodo_customer_id: event.customerId,
        dodo_subscription_id: event.subscriptionId,
        plan: event.plan,
        status: paymentStatus,
        amount: event.amount,
        currency: event.currency,
        event_created_at: params.eventAt,
        payload: params.payload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "dodo_event_id" },
    );

  if (error) return { ok: false as const, processed: false, error: error.message };
  return { ok: true as const, processed: false };
}

async function loadExistingSubscription(db: BillingAdminClient, userId: string): Promise<ExistingSubscription | null> {
  const { data, error } = await db
    .from("billing_subscriptions")
    .select("plan,status,dodo_customer_id,dodo_subscription_id,dodo_payment_id,current_period_start,current_period_end,cancel_at_period_end,entitlement_status,paid_confirmed_at,last_payment_status,last_payment_at,dodo_last_event_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as ExistingSubscription;
}

async function upsertProfilePlan(db: BillingAdminClient, event: DodoEventFields, plan: string) {
  if (!event.userId) return { ok: true as const, processed: false };

  const profileValues: { id: string; plan: string; email?: string } = {
    id: event.userId,
    plan,
  };
  if (event.email) profileValues.email = event.email;

  const { error } = await db
    .from("profiles")
    .upsert(profileValues, { onConflict: "id" });

  if (error) return { ok: false as const, processed: false, error: error.message };
  return { ok: true as const, processed: false };
}

function isPaymentEvent(eventType: string | null) {
  return Boolean(eventType?.startsWith("payment."));
}

function isSubscriptionEvent(eventType: string | null) {
  return Boolean(eventType?.startsWith("subscription."));
}

function isSuccessfulPayment(eventType: string | null, status: string) {
  return eventType === "payment.succeeded" || eventType === "payment.success" || status === "paid" || status === "succeeded" || status === "success";
}

function normalizePaymentStatus(event: DodoEventFields) {
  const status = normalizeBillingStatus(event.status);
  if (event.type === "payment.succeeded" || event.type === "payment.success") return "succeeded";
  if (event.type === "payment.failed") return "failed";
  return status;
}

function normalizeDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isAfter(left: string | null | undefined, right: string) {
  if (!left) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return false;
  return leftDate.getTime() > rightDate.getTime();
}

function isActiveBillingStatus(value: string | null) {
  return value === "active" || value === "paid" || value === "succeeded";
}

function normalizeBillingStatus(value: string | null) {
  const status = value?.toLowerCase() ?? "";
  if (status.includes("active")) return "active";
  if (status.includes("renewed")) return "active";
  if (status.includes("paid")) return "paid";
  if (status.includes("succeeded") || status.includes("success")) return "succeeded";
  if (status.includes("trial")) return "trialing";
  if (status.includes("on_hold")) return "on_hold";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("fail")) return "failed";
  if (status.includes("expired")) return "expired";
  if (status.includes("pending")) return "pending";
  if (status.includes("past_due")) return "past_due";
  return status || "unknown";
}
