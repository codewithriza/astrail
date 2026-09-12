import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";

export type RuntimeStatusSummary = {
  lastStatus: string | null;
  lastExecutionMode: string | null;
  lastToolName: string | null;
  lastLatencyMs: number | null;
  lastUpstreamStatus: number | null;
  lastTraceId: string | null;
  lastErrorCode: string | null;
  lastTimestamp: string | null;
  observabilityStorage: "tool_call_logs" | "structured_log" | "unavailable";
};

export async function getRuntimeStatusSummary(serverId: string): Promise<RuntimeStatusSummary> {
  const fallback: RuntimeStatusSummary = {
    lastStatus: null,
    lastExecutionMode: null,
    lastToolName: null,
    lastLatencyMs: null,
    lastUpstreamStatus: null,
    lastTraceId: null,
    lastErrorCode: null,
    lastTimestamp: null,
    observabilityStorage: hasServiceRoleKey() ? "structured_log" : "unavailable",
  };

  if (!hasServiceRoleKey()) return fallback;

  try {
    const { data, error } = await createAdminClient()
      .from("tool_call_logs")
      .select("tool_name,status,execution_mode,latency_ms,upstream_status,trace_id,error_code,created_at")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return fallback;

    return {
      lastStatus: typeof data.status === "string" ? data.status : null,
      lastExecutionMode: typeof data.execution_mode === "string" ? data.execution_mode : null,
      lastToolName: typeof data.tool_name === "string" ? data.tool_name : null,
      lastLatencyMs: typeof data.latency_ms === "number" ? data.latency_ms : null,
      lastUpstreamStatus: typeof data.upstream_status === "number" ? data.upstream_status : null,
      lastTraceId: typeof data.trace_id === "string" ? data.trace_id : null,
      lastErrorCode: typeof data.error_code === "string" ? data.error_code : null,
      lastTimestamp: typeof data.created_at === "string" ? data.created_at : null,
      observabilityStorage: "tool_call_logs",
    };
  } catch {
    return fallback;
  }
}
