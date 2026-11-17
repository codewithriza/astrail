"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { billingLaunchFreeMode, billingMeters, billingPlanOrder, billingPlans, type BillingPlanId } from "@/lib/billing/plans";
import { readJsonResponse } from "@/lib/client-json";

type CheckoutPlanId = Exclude<BillingPlanId, "free">;

type BillingUsage = {
  plan: BillingPlanId;
  planName: string;
  status: string;
  creditLimit: number | null;
  creditsUsed: number;
  creditsRemaining: number | null;
  creditsPercentUsed: number | null;
  used: number;
  limit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  currentPeriodEnd: string;
  storage: string;
  enforcement: string;
  generationLimit: number | null;
  generationsUsed: number;
  generationPercentUsed: number | null;
  endpointLimit: number | null;
  endpointsUsed: number;
  endpointPercentUsed: number | null;
};

const fallbackUsage: BillingUsage = {
  plan: "free",
  planName: "Free",
  status: "active",
  creditLimit: billingPlans.free.monthlyCredits,
  creditsUsed: 0,
  creditsRemaining: billingPlans.free.monthlyCredits,
  creditsPercentUsed: 0,
  used: 0,
  limit: billingPlans.free.monthlyToolCalls,
  remaining: billingPlans.free.monthlyToolCalls,
  percentUsed: 0,
  currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18).toISOString(),
  storage: "local-demo",
  enforcement: "preview",
  generationLimit: billingPlans.free.monthlyGenerations,
  generationsUsed: 0,
  generationPercentUsed: 0,
  endpointLimit: billingPlans.free.hostedEndpoints,
  endpointsUsed: 0,
  endpointPercentUsed: 0,
};

function BillingContent() {
  const searchParams = useSearchParams();
  const [loadingPlan, setLoadingPlan] = useState<CheckoutPlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [canResetUsage, setCanResetUsage] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<BillingUsage>(fallbackUsage);
  const requestedPlan = searchParams?.get("plan") ?? null;
  const requestedCheckoutPlan: CheckoutPlanId | null = requestedPlan === "starter" || requestedPlan === "team" ? requestedPlan : null;

  useEffect(() => {
    let cancelled = false;

    fetch("/api/billing/status")
      .then((response) => readJsonResponse<{ usage?: BillingUsage; error?: string; canResetUsage?: boolean }>(response))
      .then((payload) => {
        if (cancelled) return;
        setCanResetUsage(Boolean(payload.canResetUsage));
        if (payload.usage) {
          setUsage(payload.usage);
          return;
        }
        if (payload.error) setMessage("Billing provider is not configured locally, so this page is showing demo usage.");
      })
      .catch(() => {
        if (!cancelled) setMessage("Billing provider is not configured locally, so this page is showing demo usage.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const currentPlanId = useMemo(() => {
    if (usage.plan === "team" || usage.plan === "starter") return usage.plan;
    return "free";
  }, [usage.plan]);

  async function startCheckout(plan: CheckoutPlanId) {
    setLoadingPlan(plan);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const payload = await readJsonResponse<{ checkoutUrl?: string; error?: string }>(response);

      if (!response.ok || !payload.checkoutUrl) {
        setMessage(payload.error ?? "Checkout is not configured in this local workspace yet.");
        return;
      }

      window.location.href = payload.checkoutUrl;
    } catch {
      setMessage("Checkout is not configured in this local workspace yet.");
    } finally {
      setLoadingPlan(null);
    }
  }

  async function openCustomerPortal() {
    setPortalLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = await readJsonResponse<{ portalUrl?: string; error?: string }>(response);

      if (!response.ok || !payload.portalUrl) {
        setMessage(payload.error ?? "Billing management is not available for this workspace yet.");
        return;
      }

      window.location.href = payload.portalUrl;
    } catch {
      setMessage("Billing management is not available for this workspace yet.");
    } finally {
      setPortalLoading(false);
    }
  }

  async function resetTestUsage() {
    setResetLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/status", {
        method: "POST",
        headers: { "x-astrail-reset-confirm": "reset-monthly-usage" },
      });
      const payload = await readJsonResponse<{ usage?: BillingUsage; error?: string; canResetUsage?: boolean }>(response);
      if (!response.ok || !payload.usage) {
        setMessage(payload.error ?? "Usage could not be reset.");
        return;
      }
      setUsage(payload.usage);
      setCanResetUsage(Boolean(payload.canResetUsage));
      setMessage("Monthly test usage reset. Active hosted endpoints were kept.");
    } catch {
      setMessage("Usage could not be reset.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section className="space-y-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          {requestedCheckoutPlan ? (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
              {billingPlans[requestedCheckoutPlan].name} selected. {billingLaunchFreeMode ? "Checkout is paused because launch access is free right now." : "Review the included credits below, then start secure checkout."}
            </div>
          ) : null}
          {message ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {billingPlanOrder.map((planId) => {
          const plan = billingPlans[planId];
          const isCurrent = currentPlanId === plan.id;
          const checkoutPlan: CheckoutPlanId | null = plan.id === "free" ? null : plan.id;
          return (
            <div
              key={plan.id}
              className={[
                "console-card flex min-h-[460px] flex-col p-6 transition-colors hover:border-orange-300",
                isCurrent || requestedCheckoutPlan === plan.id ? "ring-2 ring-orange-500/40" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <span className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">{plan.highlight}</span>
              </div>
              <p className="mt-4 text-4xl font-semibold tracking-tight">{billingLaunchFreeMode ? "$0" : plan.priceLabel.replace("/mo", "")}<span className="text-base font-normal text-neutral-400">/mo</span></p>
              <p className="mt-4 min-h-[84px] text-sm leading-6 text-neutral-600">{plan.description}</p>
              <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <PlanStat label="Credits" value={plan.monthlyCredits === null ? "Fair use" : plan.monthlyCredits.toLocaleString()} />
                <PlanStat label="Calls" value={plan.monthlyToolCalls === null ? "Fair use" : plan.monthlyToolCalls.toLocaleString()} />
                <PlanStat label="Endpoints" value={plan.hostedEndpoints === null ? "Fair use" : plan.hostedEndpoints.toLocaleString()} />
              </div>

              <ul className="mt-6 space-y-3 text-sm text-neutral-700">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-8">
                {isCurrent ? (
                  <Button disabled variant="secondary" className="w-full">
                    Current plan
                  </Button>
                ) : billingLaunchFreeMode ? (
                  <Button disabled variant="secondary" className="w-full">
                    Included during launch
                  </Button>
                ) : checkoutPlan ? (
                  <Button className="w-full" disabled={loadingPlan !== null} onClick={() => startCheckout(checkoutPlan)}>
                    <CreditCard className="h-4 w-4" />
                    {loadingPlan === checkoutPlan ? "Opening checkout..." : plan.ctaLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </section>

      <section className="console-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Usage</h2>
            <p className="mt-1 text-sm text-neutral-500">Current billing period</p>
          </div>
          <div className="flex items-center gap-3">
            {canResetUsage ? (
              <Button variant="outline" disabled={resetLoading} onClick={resetTestUsage}>
                <RotateCcw className="h-4 w-4" />
                {resetLoading ? "Resetting..." : "Reset test usage"}
              </Button>
            ) : null}
            {currentPlanId !== "free" ? (
              <Button variant="secondary" disabled={portalLoading} onClick={openCustomerPortal}>
                <ExternalLink className="h-4 w-4" />
                {portalLoading ? "Opening..." : "Manage subscription"}
              </Button>
            ) : null}
            <span className="rounded-md border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-500">{formatEnforcementLabel(usage.enforcement)}</span>
          </div>
        </div>

        <div className="grid gap-4 pt-4 md:grid-cols-2">
          <MeterRow label="Credits" used={usage.creditsUsed} limit={usage.creditLimit} percent={usage.creditsPercentUsed} />
          <MeterRow label="Tool calls" used={usage.used} limit={usage.limit} percent={usage.percentUsed} />
          <MeterRow label="MCP generations" used={usage.generationsUsed} limit={usage.generationLimit} percent={usage.generationPercentUsed} />
          <MeterRow label="Hosted endpoints" used={usage.endpointsUsed} limit={usage.endpointLimit} percent={usage.endpointPercentUsed} />
        </div>
      </section>

      <section className="console-card p-5 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-neutral-200 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">What counts toward usage</h2>
          </div>
          <span className="text-xs text-neutral-400">Invalid requests, auth failures, and tools/list are free.</span>
        </div>
        <div className="grid gap-3 pt-4 md:grid-cols-2 xl:grid-cols-4">
          <UsageRuleCard
            title="Agent tool calls"
            value={`${billingMeters.tool_call.creditCost} credit`}
            detail="Spent when an agent successfully calls a hosted MCP tool."
          />
          <UsageRuleCard
            title="OpenAPI endpoint"
            value={`${billingMeters.mcp_generation.creditCost} credits`}
            detail="Spent when Astrail saves a working OpenAPI/docs-to-MCP endpoint."
          />
          <UsageRuleCard
            title="Website endpoint"
            value={`${billingMeters.website_mcp_generation.creditCost} credits`}
            detail="Spent when Astrail saves a generated Website-to-MCP endpoint."
          />
          <UsageRuleCard
            title="SDK export"
            value={`${billingMeters.sdk_export.creditCost} credits`}
            detail="Spent when Astrail builds a downloadable SDK and docs bundle."
          />
        </div>
      </section>

      <section className="console-card flex flex-col gap-4 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{billingLaunchFreeMode ? "Launch access is free" : "Need more credits?"}</h2>
        </div>
        <a className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition hover:bg-neutral-800 md:h-10" href="mailto:hi@astrail.dev">
          Contact sales
        </a>
      </section>
    </div>
  );
}

function PlanStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-neutral-200 p-3 last:border-r-0">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 truncate font-mono text-sm font-semibold text-neutral-950">{value}</div>
    </div>
  );
}

function UsageRuleCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-sm font-medium text-neutral-950">{title}</div>
      <div className="mt-2 font-mono text-lg font-semibold text-neutral-950">{value}</div>
      <p className="mt-3 text-sm leading-5 text-neutral-500">{detail}</p>
    </div>
  );
}

function formatEnforcementLabel(value: string) {
  if (value === "preview") return "Usage preview";
  if (value === "active") return "Active";
  return value.replace(/[_-]+/g, " ");
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-7xl text-sm text-neutral-500">Loading billing...</div>}>
      <BillingContent />
    </Suspense>
  );
}

function MeterRow({
  label,
  used,
  limit,
  percent,
}: {
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
}) {
  const width = Math.min(Math.max(percent ?? 0, 3), 100);
  const overLimit = limit !== null && used > limit ? used - limit : 0;
  const displayUsage = limit === null
    ? `${used.toLocaleString()} used`
    : `${used.toLocaleString()} used · ${limit.toLocaleString()} included`;
  const barColor = overLimit > 0 ? "bg-orange-600" : width >= 100 ? "bg-neutral-950" : "bg-emerald-500";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3 text-sm">
        <span className="font-medium text-neutral-950">{label}</span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-right font-mono text-xs">
          <span className={overLimit > 0 ? "text-orange-700" : "text-neutral-500"}>{displayUsage}</span>
          {overLimit > 0 ? (
            <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 font-sans text-[11px] font-medium text-orange-700">
              Upgrade needed
            </span>
          ) : null}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm bg-neutral-100">
        <div className={`h-full rounded-sm ${barColor}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
