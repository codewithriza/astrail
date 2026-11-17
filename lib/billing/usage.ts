import {
  billingMeters,
  billingPlans,
  generationMeterForSourceType,
  getBillingPlan,
  getHostedEndpointUsageSnapshot,
  getMeterCreditCost,
  hasHostedEndpointCapacity,
  type BillingMeterId,
  type BillingPlanId,
} from "@/lib/billing/plans";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import { createNeonSql, hasNeonDatabase } from "@/lib/db/neon";

export type BillingUsageSummary = {
  plan: BillingPlanId;
  planName: string;
  status: string;
  creditLimit: number | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  creditsPercentUsed: number | null;
  limit: number | null;
  used: number;
  remaining: number | null;
  percentUsed: number | null;
  generationLimit: number | null;
  generationsUsed: number;
  generationRemaining: number | null;
  generationPercentUsed: number | null;
  endpointLimit: number | null;
  endpointsUsed: number;
  endpointRemaining: number | null;
  endpointPercentUsed: number | null;
  endpointEnforcement: "active" | "preview" | "unavailable";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  storage: "tool_call_logs" | "mcp_servers_call_count" | "unavailable";
  enforcement: "active" | "best_effort" | "unavailable";
  meterCosts: Record<BillingMeterId, number>;
};

export async function getBillingUsageSummary(userId: string): Promise<BillingUsageSummary> {
  const defaultPeriod = getCurrentBillingPeriod();

  if (!hasServiceRoleKey()) {
    return buildSummary({
      plan: "free",
      status: "preview",
      used: 0,
      generationsUsed: 0,
      generationCreditsUsed: 0,
      additionalCreditsUsed: 0,
      endpointsUsed: 0,
      endpointEnforcement: "preview",
      period: defaultPeriod,
      storage: "unavailable",
      enforcement: "unavailable",
    });
  }

  const subscription = await loadActiveSubscription(userId);
  const basePeriod = applyGlobalBillingReset(getSubscriptionBillingPeriod(subscription) ?? defaultPeriod);
  const period = applyUserBillingReset(basePeriod, await getLatestBillingResetAt(userId, basePeriod.start));
  const plan = getBillingPlan(subscription?.plan).id;
  const [logUsage, generationUsage, endpointUsage, additionalCreditsUsed] = await Promise.all([
    getToolCallLogUsage(userId, period.start),
    getGenerationUsageDetails(userId, period.start),
    getHostedEndpointUsage(userId),
    getAdditionalUsageCredits(userId, period.start),
  ]);

  if (logUsage.ok) {
    return buildSummary({
      plan,
      status: subscription?.status ?? "free",
      used: logUsage.count,
      generationsUsed: generationUsage.count,
      generationCreditsUsed: generationUsage.credits,
      additionalCreditsUsed,
      endpointsUsed: endpointUsage.count,
      endpointEnforcement: endpointUsage.ok ? "active" : "unavailable",
      period,
      storage: "tool_call_logs",
      enforcement: "active",
    });
  }

  const fallbackUsage = await getServerCallCountUsage(userId);
  return buildSummary({
    plan,
    status: subscription?.status ?? "free",
    used: fallbackUsage,
    generationsUsed: generationUsage.count,
    generationCreditsUsed: generationUsage.credits,
    additionalCreditsUsed,
    endpointsUsed: endpointUsage.count,
    endpointEnforcement: endpointUsage.ok ? "active" : "unavailable",
    period,
    storage: "mcp_servers_call_count",
    enforcement: "best_effort",
  });
}

export async function checkBillingAllowance(userId: string, meter: BillingMeterId = "tool_call") {
  const summary = await getBillingUsageSummary(userId);
  const cost = getMeterCreditCost(meter);
  const enforceable = summary.enforcement !== "unavailable";
  const hasCredits = summary.creditLimit === null
    || summary.creditsUsed + cost <= summary.creditLimit;
  const hasToolCalls = meter !== "tool_call" || summary.limit === null || summary.used < summary.limit;

  return {
    allowed: !enforceable || (hasCredits && hasToolCalls),
    summary,
    meter,
    cost,
  };
}

export async function recordBillingUsage(params: {
  userId: string;
  meter: BillingMeterId;
  serverId?: string | null;
  toolName?: string | null;
  quantity?: number;
  dedupePerPeriod?: boolean;
}) {
  if (!hasServiceRoleKey()) return false;

  const quantity = Math.max(1, Math.floor(params.quantity ?? 1));
  const period = getCurrentBillingPeriod();

  try {
    const admin = createAdminClient();

    if (params.dedupePerPeriod && params.serverId) {
      const { count, error } = await admin
        .from("billing_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", params.userId)
        .eq("server_id", params.serverId)
        .eq("usage_type", params.meter)
        .gte("created_at", period.start);

      if (!error && typeof count === "number" && count > 0) return true;
    }

    const { error } = await admin
      .from("billing_usage")
      .insert({
        user_id: params.userId,
        server_id: params.serverId ?? null,
        tool_name: params.toolName ?? null,
        usage_type: params.meter,
        quantity,
      });

    return !error;
  } catch {
    return false;
  }
}

const BILLING_USAGE_RESET_TYPE = "admin_reset";

export function canResetBillingUsage(email: string | null | undefined) {
  if (!email) return false;
  const allowed = (process.env.ASTRAIL_BILLING_RESET_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function resetBillingUsage(userId: string) {
  if (!hasServiceRoleKey()) throw new Error("Workspace billing storage is unavailable.");
  const { error } = await createAdminClient().from("billing_usage").insert({
    user_id: userId,
    usage_type: BILLING_USAGE_RESET_TYPE,
    quantity: 1,
  });
  if (error) throw new Error("Could not reset billing usage.");
  return getBillingUsageSummary(userId);
}

export async function checkGenerationAllowance(userId: string, sourceType?: string | null) {
  const summary = await getBillingUsageSummary(userId);
  const meter = generationMeterForSourceType(sourceType);
  const cost = getMeterCreditCost(meter);
  const enforceable = summary.enforcement !== "unavailable";
  const hasCredits = summary.creditLimit === null
    || summary.creditsUsed + cost <= summary.creditLimit;
  const hasGenerationSlots = summary.generationLimit === null
    || summary.generationsUsed < summary.generationLimit;

  return {
    allowed: !enforceable || (hasCredits && hasGenerationSlots),
    summary,
    meter,
    cost,
  };
}

export async function checkHostedEndpointAllowance(userId: string) {
  let summary = await getBillingUsageSummary(userId);

  if (summary.endpointEnforcement === "unavailable") {
    const repaired = await reconcileHostedEndpointSlots(userId);
    if (repaired) summary = await getBillingUsageSummary(userId);
  }

  const available = summary.endpointEnforcement !== "unavailable";
  return {
    allowed: summary.endpointEnforcement === "preview"
      || (summary.endpointEnforcement === "active"
        && hasHostedEndpointCapacity(summary.endpointLimit, summary.endpointsUsed)),
    reason: available ? "limit" as const : "unavailable" as const,
    summary,
  };
}

const MAX_RECONCILED_ENDPOINTS = 500;

async function reconcileHostedEndpointSlots(userId: string) {
  if (!hasServiceRoleKey()) return false;

  try {
    const admin = createAdminClient();
    const [servers, bundles, slots] = await Promise.all([
      admin.from("mcp_servers").select("id").eq("user_id", userId).not("hosted_endpoint", "is", null).limit(MAX_RECONCILED_ENDPOINTS + 1),
      admin.from("mcp_bundles").select("id").eq("user_id", userId).not("hosted_endpoint", "is", null).limit(MAX_RECONCILED_ENDPOINTS + 1),
      admin.from("hosted_endpoint_slots").select("slot,resource_kind,resource_id").eq("user_id", userId).limit(MAX_RECONCILED_ENDPOINTS + 1),
    ]);

    if (servers.error || bundles.error || slots.error
      || !Array.isArray(servers.data) || !Array.isArray(bundles.data) || !Array.isArray(slots.data)) {
      return false;
    }

    const resources = [
      ...servers.data.map((row) => ({ resource_kind: "server", resource_id: row.id })),
      ...bundles.data.map((row) => ({ resource_kind: "bundle", resource_id: row.id })),
    ];
    if (resources.length > MAX_RECONCILED_ENDPOINTS || slots.data.length > MAX_RECONCILED_ENDPOINTS) return false;

    const activeKeys = new Set(resources.map((resource) => `${resource.resource_kind}:${resource.resource_id}`));
    const staleSlots = slots.data
      .filter((slot) => !activeKeys.has(`${slot.resource_kind}:${slot.resource_id}`))
      .map((slot) => slot.slot);

    if (staleSlots.length > 0) {
      const { error } = await admin
        .from("hosted_endpoint_slots")
        .delete()
        .eq("user_id", userId)
        .in("slot", staleSlots);
      if (error) return false;
    }

    const retainedSlots = slots.data.filter((slot) => !staleSlots.includes(slot.slot));
    const claimedKeys = new Set(retainedSlots.map((slot) => `${slot.resource_kind}:${slot.resource_id}`));
    const usedSlots = new Set(retainedSlots.map((slot) => slot.slot));
    const missingClaims = resources.filter((resource) => !claimedKeys.has(`${resource.resource_kind}:${resource.resource_id}`));
    const inserts: Array<{ user_id: string; slot: number; resource_kind: string; resource_id: string }> = [];
    let candidateSlot = 1;

    for (const resource of missingClaims) {
      while (usedSlots.has(candidateSlot) && candidateSlot <= MAX_RECONCILED_ENDPOINTS) candidateSlot += 1;
      if (candidateSlot > MAX_RECONCILED_ENDPOINTS) return false;
      inserts.push({ user_id: userId, slot: candidateSlot, ...resource });
      usedSlots.add(candidateSlot);
    }

    if (inserts.length > 0) {
      const { error } = await admin.from("hosted_endpoint_slots").insert(inserts);
      if (error) return false;
    }

    const { count, error } = await admin
      .from("hosted_endpoint_slots")
      .select("slot", { count: "exact", head: true })
      .eq("user_id", userId);
    return !error && count === resources.length;
  } catch {
    return false;
  }
}

export function isHostedEndpointLimitError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { message?: unknown; details?: unknown; code?: unknown };
  return (candidate.code === undefined || candidate.code === "P0001")
    && [candidate.message, candidate.details].some((value) => (
      typeof value === "string" && value.includes("hosted_endpoint_limit_reached")
  ));
}

export function hostedEndpointLimitPayload(summary: BillingUsageSummary) {
  return {
    error: "Hosted endpoint limit reached for this plan.",
    billing: summary,
    billingAction: { meter: "hosted_endpoint_slot" as const, creditCost: 0 },
  };
}

async function loadActiveSubscription(userId: string) {
  try {
    const { data, error } = await createAdminClient()
      .from("billing_subscriptions")
      .select("plan,status,current_period_start,current_period_end,entitlement_status,paid_confirmed_at,updated_at")
      .eq("user_id", userId)
      .eq("entitlement_status", "active")
      .not("paid_confirmed_at", "is", null)
      .in("status", ["active", "paid", "succeeded"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    const periodEnd = typeof data.current_period_end === "string" ? data.current_period_end : null;
    if (periodEnd) {
      const end = new Date(periodEnd);
      if (!Number.isNaN(end.getTime()) && end <= new Date()) return null;
    }

    return {
      plan: typeof data.plan === "string" ? data.plan : "free",
      status: typeof data.status === "string" ? data.status : "unknown",
      currentPeriodStart: typeof data.current_period_start === "string" ? data.current_period_start : null,
      currentPeriodEnd: periodEnd,
    };
  } catch {
    return null;
  }
}

function getSubscriptionBillingPeriod(subscription: Awaited<ReturnType<typeof loadActiveSubscription>>) {
  if (!subscription?.currentPeriodStart || !subscription.currentPeriodEnd) return null;
  const start = new Date(subscription.currentPeriodStart);
  const end = new Date(subscription.currentPeriodEnd);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

async function getToolCallLogUsage(userId: string, periodStart: string) {
  try {
    const { count, error } = await createAdminClient()
      .from("tool_call_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", periodStart)
      .or("and(status.eq.success,execution_mode.neq.oauth_revocation),and(status.eq.success,execution_mode.is.null),and(status.eq.error,attempt_count.gt.0,execution_mode.neq.oauth_revocation),and(status.eq.error,attempt_count.gt.0,execution_mode.is.null)");

    if (error || typeof count !== "number") {
      return { ok: false as const, count: 0 };
    }

    return { ok: true as const, count };
  } catch {
    return { ok: false as const, count: 0 };
  }
}

async function getServerCallCountUsage(userId: string) {
  try {
    const { data, error } = await createAdminClient()
      .from("mcp_servers")
      .select("call_count")
      .eq("user_id", userId);

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (typeof row.call_count === "number" ? row.call_count : 0), 0);
  } catch {
    return 0;
  }
}

async function getGenerationUsageDetails(userId: string, periodStart: string) {
  try {
    const { data, error } = await createAdminClient()
      .from("mcp_servers")
      .select("source_type,status,generation_status")
      .eq("user_id", userId)
      .gte("created_at", periodStart);

    if (error || !Array.isArray(data)) return { count: 0, credits: 0 };

    const successful = data.filter((row) => {
      const status = typeof row.status === "string" ? row.status : "";
      const generationStatus = typeof row.generation_status === "string" ? row.generation_status : "";
      return status !== "error" && generationStatus !== "failed";
    });

    return {
      count: successful.length,
      credits: successful.reduce((sum, row) => {
        const sourceType = typeof row.source_type === "string" ? row.source_type : null;
        return sum + getMeterCreditCost(generationMeterForSourceType(sourceType));
      }, 0),
    };
  } catch {
    return { count: 0, credits: 0 };
  }
}

async function getHostedEndpointUsage(userId: string) {
  try {
    // Capacity is an authorization decision, so count it through the server-only
    // Postgres connection. The Data API service identity is an ordinary Neon
    // Auth user and does not bypass RLS; using it here can see public servers but
    // not the owner's private slots, producing a false "unavailable" result.
    if (hasNeonDatabase()) {
      const sql = createNeonSql();
      const rows = await sql`
        select
          (select count(*)::int from public.mcp_servers
            where user_id = ${userId}::uuid and hosted_endpoint is not null) as server_count,
          (select count(*)::int from public.mcp_bundles
            where user_id = ${userId}::uuid and hosted_endpoint is not null) as bundle_count,
          (select count(*)::int from public.hosted_endpoint_slots
            where user_id = ${userId}::uuid) as slot_count
      `;
      const row = rows[0] as { server_count?: number; bundle_count?: number; slot_count?: number } | undefined;
      const serverCount = Number(row?.server_count);
      const bundleCount = Number(row?.bundle_count);
      const slotCount = Number(row?.slot_count);
      if ([serverCount, bundleCount, slotCount].every(Number.isSafeInteger)) {
        const endpointCount = serverCount + bundleCount;
        return { ok: slotCount === endpointCount, count: endpointCount };
      }
    }

    const admin = createAdminClient();
    const [servers, bundles, slots] = await Promise.all([
      admin.from("mcp_servers").select("id", { count: "exact", head: true }).eq("user_id", userId).not("hosted_endpoint", "is", null),
      admin.from("mcp_bundles").select("id", { count: "exact", head: true }).eq("user_id", userId).not("hosted_endpoint", "is", null),
      admin.from("hosted_endpoint_slots").select("slot", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    if (servers.error || bundles.error
      || typeof servers.count !== "number" || typeof bundles.count !== "number") {
      return { ok: false, count: 0 };
    }
    const endpointCount = servers.count + bundles.count;
    if (slots.error) {
      const migrationPending = slots.error.code === "PGRST205"
        || slots.error.message.includes("hosted_endpoint_slots");
      return migrationPending ? { ok: true, count: endpointCount } : { ok: false, count: endpointCount };
    }
    if (typeof slots.count !== "number") return { ok: false, count: endpointCount };
    if (slots.count !== endpointCount) return { ok: false, count: endpointCount };
    return { ok: true, count: endpointCount };
  } catch {
    return { ok: false, count: 0 };
  }
}

async function getAdditionalUsageCredits(userId: string, periodStart: string) {
  try {
    const { data, error } = await createAdminClient()
      .from("billing_usage")
      .select("usage_type,quantity")
      .eq("user_id", userId)
      .gte("created_at", periodStart);

    if (error || !Array.isArray(data)) return 0;

    return data.reduce((sum, row) => {
      const usageType = typeof row.usage_type === "string" ? row.usage_type : "";
      const quantity = typeof row.quantity === "number" ? row.quantity : 1;
      if (usageType !== "sdk_export") return sum;
      return sum + quantity * getMeterCreditCost("sdk_export");
    }, 0);
  } catch {
    return 0;
  }
}

function buildSummary(params: {
  plan: BillingPlanId;
  status: string;
  used: number;
  generationsUsed: number;
  generationCreditsUsed: number;
  additionalCreditsUsed: number;
  endpointsUsed: number;
  endpointEnforcement: BillingUsageSummary["endpointEnforcement"];
  period: { start: string; end: string };
  storage: BillingUsageSummary["storage"];
  enforcement: BillingUsageSummary["enforcement"];
}): BillingUsageSummary {
  const plan = billingPlans[params.plan];
  const remaining = plan.monthlyToolCalls === null
    ? null
    : Math.max(0, plan.monthlyToolCalls - params.used);
  const generationRemaining = plan.monthlyGenerations === null
    ? null
    : Math.max(0, plan.monthlyGenerations - params.generationsUsed);
  const endpointUsage = getHostedEndpointUsageSnapshot(plan.hostedEndpoints, params.endpointsUsed);
  const creditsUsed = params.used + params.generationCreditsUsed + params.additionalCreditsUsed;
  const creditsRemaining = plan.monthlyCredits === null
    ? null
    : Math.max(0, plan.monthlyCredits - creditsUsed);

  return {
    plan: plan.id,
    planName: plan.name,
    status: params.status,
    creditLimit: plan.monthlyCredits,
    creditsUsed,
    creditsRemaining,
    creditsPercentUsed: plan.monthlyCredits === null
      ? null
      : Math.min(100, Math.round((creditsUsed / plan.monthlyCredits) * 100)),
    limit: plan.monthlyToolCalls,
    used: params.used,
    remaining,
    percentUsed: plan.monthlyToolCalls === null
      ? null
      : Math.min(100, Math.round((params.used / plan.monthlyToolCalls) * 100)),
    generationLimit: plan.monthlyGenerations,
    generationsUsed: params.generationsUsed,
    generationRemaining,
    generationPercentUsed: plan.monthlyGenerations === null
      ? null
      : Math.min(100, Math.round((params.generationsUsed / plan.monthlyGenerations) * 100)),
    endpointLimit: plan.hostedEndpoints,
    endpointsUsed: params.endpointsUsed,
    endpointRemaining: endpointUsage.remaining,
    endpointPercentUsed: endpointUsage.percentUsed,
    endpointEnforcement: params.endpointEnforcement,
    currentPeriodStart: params.period.start,
    currentPeriodEnd: params.period.end,
    storage: params.storage,
    enforcement: params.enforcement,
    meterCosts: Object.fromEntries(
      Object.entries(billingMeters).map(([key, meter]) => [key, meter.creditCost]),
    ) as Record<BillingMeterId, number>,
  };
}

function getCurrentBillingPeriod() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function applyGlobalBillingReset(period: { start: string; end: string }) {
  const reset = getGlobalBillingResetAt();
  if (!reset) return period;

  const start = new Date(period.start);
  if (Number.isNaN(start.getTime()) || reset <= start) return period;

  return {
    start: reset.toISOString(),
    end: period.end,
  };
}

function applyUserBillingReset(period: { start: string; end: string }, reset: Date | null) {
  if (!reset) return period;
  const start = new Date(period.start);
  if (Number.isNaN(start.getTime()) || reset <= start) return period;
  return { start: reset.toISOString(), end: period.end };
}

async function getLatestBillingResetAt(userId: string, periodStart: string) {
  try {
    const { data, error } = await createAdminClient()
      .from("billing_usage")
      .select("created_at")
      .eq("user_id", userId)
      .eq("usage_type", BILLING_USAGE_RESET_TYPE)
      .gte("created_at", periodStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || typeof data?.created_at !== "string") return null;
    const reset = new Date(data.created_at);
    return Number.isNaN(reset.getTime()) ? null : reset;
  } catch {
    return null;
  }
}

function getGlobalBillingResetAt() {
  const raw = process.env.ASTRAIL_BILLING_RESET_AT?.trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed;
}
