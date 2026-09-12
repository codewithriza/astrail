import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cheaperMultiple,
  competitorBenchmarks,
  currentAstrailCostPlans,
  dodoAstrailCostPlans,
  formatCostPerThousand,
  formatMultiple,
} from "@/lib/competitive-cost";

export function CostProofPanel({ recordedCalls = 0 }: { recordedCalls?: number }) {
  const lowBenchmark = competitorBenchmarks[0];
  const scaleBenchmark = competitorBenchmarks[1];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost proof</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Recorded calls</span>
            <code>{recordedCalls.toLocaleString()}</code>
          </div>
          {currentAstrailCostPlans.map((plan) => (
            <div key={plan.name} className="flex items-center justify-between gap-4 border-b pb-2">
              <span>{plan.name}</span>
              <code>{formatCostPerThousand(plan)}</code>
            </div>
          ))}
        </div>

        <div className="border p-3">
          <p className="font-medium">Dodo-backed pricing</p>
          <div className="mt-3 space-y-2">
            {dodoAstrailCostPlans.map((plan, index) => {
              const benchmark = index === 0 ? lowBenchmark : scaleBenchmark;
              return (
                <div key={plan.name} className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
                  <span>{plan.name}</span>
                  <span className="text-right">
                    <code>{formatCostPerThousand(plan)}</code>
                    <span className="ml-2 text-muted-foreground">{formatMultiple(cheaperMultiple(plan, benchmark))}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-muted-foreground">
          Dodo checkout keeps payment operations simple while the plan math supports a truthful lower-cost claim for generated custom API endpoints.
        </p>
      </CardContent>
    </Card>
  );
}
