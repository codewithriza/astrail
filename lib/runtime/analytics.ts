import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { RuntimeLog } from "@/lib/types";

export type RuntimeAnalytics = {
  storage: "tool_call_logs" | "structured_log" | "unavailable";
  totalLoggedCalls: number;
  successCount: number;
  errorCount: number;
  authRequiredCount: number;
  mappingRequiredCount: number;
  averageLatencyMs: number | null;
  topTools: Array<{ name: string; count: number }>;
  dailyCalls: Array<{ date: string; count: number }>;
  recent: RuntimeLog[];
};

const ANALYTICS_WINDOW_DAYS = 365;
const ANALYTICS_LOG_LIMIT = 1000;

export async function getRuntimeAnalytics(userId: string): Promise<RuntimeAnalytics> {
  const fallback: RuntimeAnalytics = {
    storage: hasServiceRoleKey() ? "structured_log" : "unavailable",
    totalLoggedCalls: 0,
    successCount: 0,
    errorCount: 0,
    authRequiredCount: 0,
    mappingRequiredCount: 0,
    averageLatencyMs: null,
    topTools: [],
    dailyCalls: buildDailyCalls([]),
    recent: [],
  };

  if (!hasServiceRoleKey()) return fallback;

  try {
    const { data, error } = await createAdminClient()
      .from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(ANALYTICS_LOG_LIMIT);

    if (error || !data) return fallback;

    const logs = data as RuntimeLog[];
    const latencies = logs.map((log) => log.latency_ms).filter((value): value is number => typeof value === "number");
    const toolCounts = new Map<string, number>();
    for (const log of logs) {
      if (!log.tool_name) continue;
      toolCounts.set(log.tool_name, (toolCounts.get(log.tool_name) ?? 0) + 1);
    }

    return {
      storage: "tool_call_logs",
      totalLoggedCalls: logs.length,
      successCount: logs.filter((log) => log.status === "success").length,
      errorCount: logs.filter((log) => log.status === "error").length,
      authRequiredCount: logs.filter((log) => log.status === "auth_required" || log.status === "oauth_required").length,
      mappingRequiredCount: logs.filter((log) => log.status === "mapping_required").length,
      averageLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
        : null,
      topTools: Array.from(toolCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count })),
      dailyCalls: buildDailyCalls(logs),
      recent: logs.slice(0, 8),
    };
  } catch {
    return fallback;
  }
}

function buildDailyCalls(logs: RuntimeLog[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const buckets = Array.from({ length: ANALYTICS_WINDOW_DAYS }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (ANALYTICS_WINDOW_DAYS - index - 1));
    return {
      date: localDateKey(date),
      count: 0,
    };
  });
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));

  for (const log of logs) {
    const createdAt = new Date(log.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const bucket = bucketByDate.get(localDateKey(createdAt));
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
