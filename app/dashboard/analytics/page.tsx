import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoLogs, localDemoServers } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import { formatDate } from "@/lib/utils";
import type { McpServer, RuntimeLog } from "@/lib/types";

type ServerMetric = {
  id: string;
  name: string;
  status: string;
  calls: number;
  loggedCalls: number;
  success: number;
  errors: number;
  authRequired: number;
  mappingRequired: number;
  averageLatency: number | null;
};

const statusOrder = ["success", "auth_required", "oauth_required", "mapping_required", "browser_runtime_required", "error"];

export default async function AnalyticsPage() {
  if (!hasServerNeonEnv()) {
    return (
      <AnalyticsShell>
        <AnalyticsContent
          servers={localDemoServers().map((server) => ({
            id: server.id,
            name: server.name,
            status: server.status,
            call_count: server.call_count,
            hosted_endpoint: server.hosted_endpoint,
            created_at: server.created_at,
          }))}
          logs={localDemoLogs()}
        />
      </AnalyticsShell>
    );
  }

  const user = await getDashboardSessionUser();

  return (
    <AnalyticsShell>
      <Suspense fallback={<AnalyticsFallback />}>
        <UserAnalyticsContent userId={user.id} />
      </Suspense>
    </AnalyticsShell>
  );
}

async function UserAnalyticsContent({ userId }: { userId: string }) {
  const admin = createUserDataClient();
  const [serverResult, initialLogResult] = await Promise.all([
    admin
      .from("mcp_servers")
      .select("id,name,status,call_count,hosted_endpoint,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,end_user_id,actor_role,api_key_id,api_key_name,api_key_preview,client_name,credential_refs,bundle_id,arguments_redacted,summary,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const { data: serverRows, error: serverError } = serverResult;
  let logResult: { data: unknown[] | null; error: { message: string } | null } = initialLogResult;
  if (logResult.error?.message.includes("column")) {
    logResult = await admin.from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,end_user_id,actor_role,arguments_redacted,summary,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
  }
  if (logResult.error?.message.includes("column")) {
    logResult = await admin.from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
  }

  if (serverError) throw new Error(serverError.message);
  if (logResult.error) throw new Error(logResult.error.message);

  const servers = (serverRows ?? []) as Pick<McpServer, "id" | "name" | "status" | "call_count" | "hosted_endpoint" | "created_at">[];
  const logs = (logResult.data ?? []) as RuntimeLog[];
  return <AnalyticsContent servers={servers} logs={logs} />;
}

function AnalyticsShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader />
      {children}
    </div>
  );
}

function AnalyticsFallback() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {["Endpoint calls", "Success rate", "Average latency", "Action required"].map((label) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <div className="mt-3 h-8 w-20 rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Loading runtime activity</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Fetching recent logs and endpoint metrics...</CardContent>
      </Card>
    </div>
  );
}

function AnalyticsContent({
  servers,
  logs,
}: {
  servers: Pick<McpServer, "id" | "name" | "status" | "call_count" | "hosted_endpoint" | "created_at">[];
  logs: RuntimeLog[];
}) {
  const serverNameById = new Map(servers.map((server) => [server.id, server.name]));
  const totalEndpointCalls = servers.reduce((sum, server) => sum + (server.call_count ?? 0), 0);
  const loggedCalls = logs.length;
  const successCount = countBy(logs, "status", "success");
  const authRequiredCount = countBy(logs, "status", "auth_required") + countBy(logs, "status", "oauth_required");
  const mappingRequiredCount = countBy(logs, "status", "mapping_required");
  const browserRequiredCount = countBy(logs, "status", "browser_runtime_required");
  const errorCount = logs.filter((log) => log.status === "error" || Boolean(log.error_code && log.status !== "auth_required" && log.status !== "oauth_required" && log.status !== "mapping_required")).length;
  const latencies = logs.map((log) => log.latency_ms).filter((value): value is number => typeof value === "number" && value > 0);
  const averageLatency = average(latencies);
  const p95Latency = percentile(latencies, 0.95);
  const successRate = loggedCalls > 0 ? Math.round((successCount / loggedCalls) * 100) : 0;

  const topTools = topCounts(logs.map((log) => log.tool_name).filter((name): name is string => Boolean(name)), 8);
  const statusCounts = statusOrder.map((status) => ({ label: status, count: countBy(logs, "status", status) }));
  const executionModes = topCounts(logs.map((log) => log.execution_mode).filter((mode): mode is string => Boolean(mode)), 8);
  const upstreamStatuses = topCounts(logs.map((log) => typeof log.upstream_status === "number" ? String(log.upstream_status) : null).filter((status): status is string => Boolean(status)), 8);
  const daily = dailyBuckets(logs, 14);
  const serverMetrics = servers.map((server): ServerMetric => {
    const serverLogs = logs.filter((log) => log.server_id === server.id);
    const serverLatencies = serverLogs.map((log) => log.latency_ms).filter((value): value is number => typeof value === "number" && value > 0);
    return {
      id: server.id,
      name: server.name,
      status: server.status ?? "live",
      calls: server.call_count ?? 0,
      loggedCalls: serverLogs.length,
      success: countBy(serverLogs, "status", "success"),
      errors: serverLogs.filter((log) => log.status === "error").length,
      authRequired: countBy(serverLogs, "status", "auth_required") + countBy(serverLogs, "status", "oauth_required"),
      mappingRequired: countBy(serverLogs, "status", "mapping_required"),
      averageLatency: average(serverLatencies),
    };
  }).sort((a, b) => b.calls - a.calls);

  return (
    <>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Endpoint calls" value={totalEndpointCalls} detail={`${loggedCalls} persisted log rows`} />
        <MetricCard label="Success rate" value={`${successRate}%`} detail={`${successCount} successful calls`} />
        <MetricCard label="Average latency" value={averageLatency === null ? "n/a" : `${averageLatency}ms`} detail={p95Latency === null ? "p95 not recorded" : `p95 ${p95Latency}ms`} />
        <MetricCard label="Action required" value={authRequiredCount + mappingRequiredCount + browserRequiredCount} detail={`${errorCount} runtime errors recorded`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Calls by day</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.every((item) => item.count === 0) ? (
              <EmptyAnalyticsState />
            ) : (
              <div className="space-y-2">
                {daily.map((item) => (
                  <div key={item.date} className="grid grid-cols-[92px_1fr_48px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <div className="h-2 border bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${item.width}%` }}
                      />
                    </div>
                    <span className="text-right font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statuses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {statusCounts.map((item) => (
                <StatRow key={item.label} label={item.label} value={item.count} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <RankedList title="Top tools" items={topTools} empty="No tool calls recorded yet." />
        <RankedList title="Execution modes" items={executionModes} empty="No execution modes recorded yet." />
        <RankedList title="Upstream statuses" items={upstreamStatuses} empty="No upstream statuses recorded yet." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Servers</CardTitle>
        </CardHeader>
        <CardContent>
          {serverMetrics.length === 0 ? (
            <p className="text-sm text-muted-foreground">No generated servers yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Server</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Calls</th>
                    <th className="py-2 pr-3 font-medium">Logged</th>
                    <th className="py-2 pr-3 font-medium">Success</th>
                    <th className="py-2 pr-3 font-medium">Auth required</th>
                    <th className="py-2 pr-3 font-medium">Mapping required</th>
                    <th className="py-2 pr-3 font-medium">Avg latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {serverMetrics.map((server) => (
                    <tr key={server.id}>
                      <td className="py-2 pr-3">
                        <Link href={`/dashboard/servers/${server.id}`} className="font-medium text-primary">
                          {server.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3"><Badge>{server.status}</Badge></td>
                      <td className="py-2 pr-3">{server.calls}</td>
                      <td className="py-2 pr-3">{server.loggedCalls}</td>
                      <td className="py-2 pr-3">{server.success}</td>
                      <td className="py-2 pr-3">{server.authRequired}</td>
                      <td className="py-2 pr-3">{server.mappingRequired}</td>
                      <td className="py-2 pr-3">{server.averageLatency === null ? "n/a" : `${server.averageLatency}ms`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <EmptyAnalyticsState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-left text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Time</th>
                    <th className="py-2 pr-3 font-medium">Server</th>
                    <th className="py-2 pr-3 font-medium">Tool</th>
                    <th className="py-2 pr-3 font-medium">User / role</th>
                    <th className="py-2 pr-3 font-medium">Agent / key</th>
                    <th className="py-2 pr-3 font-medium">Provider grant</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Mode</th>
                    <th className="py-2 pr-3 font-medium">Upstream</th>
                    <th className="py-2 pr-3 font-medium">Latency</th>
                    <th className="py-2 pr-3 font-medium">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.slice(0, 25).map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 text-muted-foreground">{formatDate(log.created_at)}</td>
                      <td className="py-2 pr-3">{log.server_id ? serverNameById.get(log.server_id) ?? "Unknown server" : "Deleted integration"}</td>
                      <td className="py-2 pr-3"><code>{log.tool_name ?? "unknown_tool"}</code></td>
                      <td className="py-2 pr-3"><code>{log.end_user_id ?? "workspace"}</code><span className="block text-xs text-muted-foreground">{log.actor_role ?? "default"}</span></td>
                      <td className="py-2 pr-3"><code>{log.client_name ?? "unreported"}</code><span className="block text-xs text-muted-foreground">{log.api_key_name ?? "public"}</span></td>
                      <td className="py-2 pr-3">{log.credential_refs?.length ? log.credential_refs.map((ref) => ref.name).join(", ") : "none"}</td>
                      <td className="py-2 pr-3"><Badge>{log.status ?? "unknown"}</Badge></td>
                      <td className="py-2 pr-3"><code>{log.execution_mode ?? "unknown"}</code></td>
                      <td className="py-2 pr-3">{typeof log.upstream_status === "number" ? log.upstream_status : "n/a"}</td>
                      <td className="py-2 pr-3">{typeof log.latency_ms === "number" ? `${log.latency_ms}ms` : "n/a"}</td>
                      <td className="py-2 pr-3"><code>{log.trace_id ?? "no_trace"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PageHeader() {
  return (
    <div className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Runtime usage, latency, errors, and tool activity from hosted MCP calls.
        </p>
      </div>
      <Badge>runtime logs</Badge>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <code>{label}</code>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function RankedList({ title, items, empty }: { title: string; items: Array<{ name: string; count: number }>; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="divide-y border">
            {items.map((item) => (
              <div key={item.name} className="flex items-center justify-between gap-4 p-2 text-sm">
                <code className="break-all">{item.name}</code>
                <span className="font-medium">{item.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyAnalyticsState() {
  return (
    <p className="text-sm text-muted-foreground">
      No runtime logs yet. Test a hosted MCP endpoint to populate analytics.
    </p>
  );
}

function countBy<T extends Record<string, unknown>>(items: T[], key: keyof T, value: unknown) {
  return items.filter((item) => item[key] === value).length;
}

function average(values: number[]) {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function topCounts(values: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function dailyBuckets(logs: RuntimeLog[], days: number) {
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  const buckets = Array.from({ length: days }).map((_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (days - index - 1));
    const key = localDateKey(date);
    return {
      date: key,
      label: formatter.format(date),
      count: 0,
      width: 0,
    };
  });
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const log of logs) {
    const key = localDateKey(new Date(log.created_at));
    const bucket = bucketByDate.get(key);
    if (bucket) bucket.count += 1;
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return buckets.map((bucket) => ({
    ...bucket,
    width: Math.round((bucket.count / max) * 100),
  }));
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
