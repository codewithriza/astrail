import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RuntimeAnalytics } from "@/lib/runtime/analytics";

export function AnalyticsLitePanel({
  totalCalls,
  analytics,
}: {
  totalCalls: number;
  analytics: RuntimeAnalytics;
}) {
  const values = [
    ["Total endpoint calls", totalCalls],
    ["Logged calls", analytics.totalLoggedCalls],
    ["Success", analytics.successCount],
    ["Auth required", analytics.authRequiredCount],
    ["Mapping required", analytics.mappingRequiredCount],
    ["Errors", analytics.errorCount],
    ["Average latency", analytics.averageLatencyMs === null ? "not recorded" : `${analytics.averageLatencyMs}ms`],
    ["Storage", analytics.storage],
  ];

  return (
    <Card>
      <CardHeader><CardTitle>Runtime analytics</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-2">
          {values.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[140px_1fr] border p-2 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{value}</span>
            </div>
          ))}
        </div>
        {analytics.topTools.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Top tools</p>
            <div className="divide-y border">
              {analytics.topTools.map((tool) => (
                <div key={tool.name} className="flex justify-between gap-3 p-2 text-sm">
                  <code>{tool.name}</code>
                  <span className="text-muted-foreground">{tool.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {analytics.recent.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Recent activity</p>
            <div className="overflow-x-auto border">
              {analytics.recent.map((log) => (
                <div
                  key={log.id}
                  className="grid min-w-[720px] grid-cols-[minmax(260px,1fr)_150px_90px_180px] items-center gap-3 border-b p-2 text-sm last:border-b-0"
                >
                  <code className="truncate" title={log.tool_name ?? "unknown_tool"}>
                    {log.tool_name ?? "unknown_tool"}
                  </code>
                  <span className="truncate">{log.status ?? "unknown"}</span>
                  <span className="text-muted-foreground">{log.latency_ms ?? 0}ms</span>
                  <code className="truncate text-muted-foreground" title={log.trace_id ?? "no_trace"}>
                    {log.trace_id ?? "no_trace"}
                  </code>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
