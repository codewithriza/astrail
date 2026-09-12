export type BillingPlanId = "free" | "starter" | "team";

export type BillingMeterId =
  | "tool_call"
  | "mcp_generation"
  | "website_mcp_generation"
  | "sdk_export"
  | "hosted_endpoint_slot";

export type BillingMeter = {
  id: BillingMeterId;
  label: string;
  creditCost: number;
  unit: string;
  chargedWhen: string;
  notes: string;
};

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  description: string;
  highlight: string;
  monthlyToolCalls: number | null;
  monthlyGenerations: number | null;
  hostedEndpoints: number | null;
  monthlyCredits: number | null;
  priceLabel: string;
  ctaLabel: string;
  features: string[];
};

export const billingLaunchFreeMode = false;

export const billingMeters: Record<BillingMeterId, BillingMeter> = {
  tool_call: {
    id: "tool_call",
    label: "Runtime tool call",
    creditCost: 1,
    unit: "tools/call",
    chargedWhen: "When a hosted MCP endpoint accepts a valid tools/call request.",
    notes: "Invalid JSON-RPC, auth failures, rate-limit failures, and tools/list do not spend credits.",
  },
  mcp_generation: {
    id: "mcp_generation",
    label: "API or MCP generation",
    creditCost: 250,
    unit: "generated server",
    chargedWhen: "When Astrail saves a successful API/docs-to-MCP endpoint or imported MCP proxy.",
    notes: "Failed discovery, failed validation, and rejected endpoint selections do not spend credits.",
  },
  website_mcp_generation: {
    id: "website_mcp_generation",
    label: "Website MCP endpoint",
    creditCost: 500,
    unit: "generated server",
    chargedWhen: "When Astrail saves a successful Website-to-MCP endpoint.",
    notes: "This covers crawl, extraction, tool planning, and the hosted MCP endpoint.",
  },
  sdk_export: {
    id: "sdk_export",
    label: "SDK export",
    creditCost: 100,
    unit: "download",
    chargedWhen: "When Astrail builds a downloadable SDK/docs bundle for a generated server.",
    notes: "Re-downloading the same generated artifact should be free once the credit ledger is attached.",
  },
  hosted_endpoint_slot: {
    id: "hosted_endpoint_slot",
    label: "Hosted endpoint slot",
    creditCost: 0,
    unit: "active endpoint",
    chargedWhen: "No per-credit charge. Each plan includes a fixed number of hosted endpoint slots.",
    notes: "Creation stops at the slot limit. Existing endpoints keep serving after a downgrade until they are deleted.",
  },
};

export const billingPlans: Record<BillingPlanId, BillingPlan> = {
  free: {
    id: "free",
    name: "Free",
    description: "For testing Astrail with a small workspace before upgrading to hosted production usage.",
    highlight: "Start free",
    monthlyToolCalls: 50,
    monthlyGenerations: 1,
    hostedEndpoints: 3,
    monthlyCredits: 500,
    priceLabel: "$0/mo",
    ctaLabel: "Start free",
    features: [
      "500 monthly credits",
      "50 runtime tool calls",
      "1 API, MCP, or Website generation",
      "3 hosted MCP endpoints",
      "SDK and docs export included",
    ],
  },
  starter: {
    id: "starter",
    name: "Launch",
    description: "For solo builders and small teams shipping their first production MCP endpoints.",
    highlight: "$19 Launch plan",
    monthlyToolCalls: 20_000,
    monthlyGenerations: 25,
    hostedEndpoints: 10,
    monthlyCredits: 25_000,
    priceLabel: "$19/mo",
    ctaLabel: "Upgrade to Launch",
    features: [
      "25,000 monthly credits",
      "20,000 runtime tool calls",
      "25 API, MCP, or Website generations",
      "10 hosted MCP endpoints",
      "SDK + docs exports from generated servers",
      "Runtime logs and API keys",
    ],
  },
  team: {
    id: "team",
    name: "Scale",
    description: "For teams running customer-facing agent infrastructure with higher volume and support.",
    highlight: "Best for production",
    monthlyToolCalls: 200_000,
    monthlyGenerations: 150,
    hostedEndpoints: 100,
    monthlyCredits: 250_000,
    priceLabel: "$99/mo",
    ctaLabel: "Upgrade to Scale",
    features: [
      "250,000 monthly credits",
      "200,000 runtime tool calls",
      "150 API, MCP, or Website generations",
      "100 hosted MCP endpoints",
      "SDK + docs exports for customer-facing APIs",
      "Workflow mapping review and production support",
    ],
  },
};

export const billingPlanOrder: BillingPlanId[] = ["free", "starter", "team"];

export function normalizeBillingPlanId(value: string | null | undefined): BillingPlanId {
  if (value === "starter" || value === "pro" || value === "builder" || value === "launch") return "starter";
  if (value === "team" || value === "scale") return "team";
  return "free";
}

export function getBillingPlan(value: string | null | undefined) {
  return billingPlans[normalizeBillingPlanId(value)];
}

export function getMeterCreditCost(meter: BillingMeterId) {
  return billingMeters[meter].creditCost;
}

export function hasHostedEndpointCapacity(endpointLimit: number | null, endpointsUsed: number) {
  return endpointLimit === null || endpointsUsed < endpointLimit;
}

export function getHostedEndpointUsageSnapshot(endpointLimit: number | null, endpointsUsed: number) {
  if (endpointLimit === null) return { remaining: null, percentUsed: null };
  return {
    remaining: Math.max(0, endpointLimit - endpointsUsed),
    percentUsed: Math.min(100, Math.round((endpointsUsed / endpointLimit) * 100)),
  };
}

export function generationMeterForSourceType(sourceType: string | null | undefined): BillingMeterId {
  return sourceType === "website" ? "website_mcp_generation" : "mcp_generation";
}

export function formatPlanLimit(value: number | null, suffix: string) {
  return value === null ? `Fair use ${suffix}` : `${value.toLocaleString()} ${suffix}`;
}
