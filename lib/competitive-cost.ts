export type CostPlan = {
  name: string;
  price: number;
  includedCalls: number;
  label: string;
};

export const currentAstrailCostPlans: CostPlan[] = [
  { name: "Builder", price: 9, includedCalls: 100_000, label: "current" },
  { name: "Team", price: 39, includedCalls: 1_000_000, label: "current" },
];

export const dodoAstrailCostPlans: CostPlan[] = [
  { name: "Builder", price: 9, includedCalls: 100_000, label: "current" },
  { name: "Team", price: 39, includedCalls: 1_000_000, label: "current" },
];

export const competitorBenchmarks: CostPlan[] = [
  { name: "Composio $29 tier", price: 29, includedCalls: 200_000, label: "benchmark" },
  { name: "Composio $229 tier", price: 229, includedCalls: 2_000_000, label: "benchmark" },
];

export function costPerThousand(plan: CostPlan) {
  return plan.includedCalls > 0 ? (plan.price / plan.includedCalls) * 1000 : 0;
}

export function cheaperMultiple(candidate: CostPlan, benchmark: CostPlan) {
  const candidateCost = costPerThousand(candidate);
  if (candidateCost <= 0) return null;
  return costPerThousand(benchmark) / candidateCost;
}

export function formatCostPerThousand(plan: CostPlan) {
  return `$${costPerThousand(plan).toFixed(3)} / 1k calls`;
}

export function formatMultiple(value: number | null) {
  if (!value || !Number.isFinite(value)) return "n/a";
  if (value < 1) return `${(1 / value).toFixed(1)}x more expensive`;
  return `${value.toFixed(1)}x cheaper`;
}
