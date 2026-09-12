import type { AgentReadinessReport } from "@/lib/agent-readiness";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function statusClass(status: AgentReadinessReport["checks"][number]["status"]) {
  if (status === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-neutral-200 bg-neutral-50 text-neutral-500";
}

export function AgentReadinessPanel({ report }: { report: AgentReadinessReport }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Agent readiness</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Runtime-grade checks for hosted MCP, safe execution, auth boundaries, and agent metadata.
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-3xl font-semibold text-neutral-950">{report.score}</p>
            <Badge>{report.grade}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-2">
          {report.checks.map((item) => (
            <div key={item.label} className={`rounded-md border p-3 ${statusClass(item.status)}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-sm font-semibold">{item.label}</p>
                <span className="font-mono text-[11px] uppercase">{item.status}</span>
              </div>
              <p className="mt-1 text-xs leading-5 opacity-80">{item.detail}</p>
            </div>
          ))}
        </div>

        <div className="rounded-md border bg-neutral-950 p-4 text-white">
          <p className="font-mono text-xs uppercase text-white/45">Why this is harder to replace</p>
          <div className="mt-3 grid gap-2">
            {report.advantages.map((item) => (
              <p key={item} className="text-sm leading-6 text-white/78">{item}</p>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">Next actions</p>
          <div className="mt-2 space-y-2">
            {report.nextActions.map((item) => (
              <p key={item} className="rounded-md border bg-background p-3 text-sm text-muted-foreground">{item}</p>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
