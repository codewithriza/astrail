import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RuntimeBehavior({
  hasEndpointMap,
  hasAuthRequiredEndpoints = false,
  hasExecutableEndpoints = false,
  hasBrowserRuntimeEndpoints = false,
  lastStatus = null,
  lastExecutionMode = null,
  lastToolName = null,
  lastLatencyMs = null,
  lastUpstreamStatus = null,
  lastTraceId = null,
  lastErrorCode = null,
  observabilityStorage = "structured_log",
  rateLimitMode = "in_memory",
}: {
  hasEndpointMap: boolean;
  hasAuthRequiredEndpoints?: boolean;
  hasExecutableEndpoints?: boolean;
  hasBrowserRuntimeEndpoints?: boolean;
  lastStatus?: string | null;
  lastExecutionMode?: string | null;
  lastToolName?: string | null;
  lastLatencyMs?: number | null;
  lastUpstreamStatus?: number | null;
  lastTraceId?: string | null;
  lastErrorCode?: string | null;
  observabilityStorage?: "tool_call_logs" | "structured_log" | "unavailable";
  rateLimitMode?: string;
}) {
  const executionMode = !hasEndpointMap
    ? "mapping_required"
    : hasBrowserRuntimeEndpoints
      ? "website_browser_runtime"
    : hasExecutableEndpoints
      ? "safe_rest_execution"
      : hasAuthRequiredEndpoints
        ? "auth_required"
        : "mapping_required";
  const runtimeHealth = !hasEndpointMap
    ? "needs_mapping"
    : lastStatus === "error"
      ? "degraded"
      : "healthy";
  const endpointHealth = typeof lastUpstreamStatus !== "number"
    ? "not_checked"
    : lastUpstreamStatus >= 200 && lastUpstreamStatus < 400
      ? "healthy"
      : "upstream_error";
  const observabilityLabel = formatObservabilityStorage(observabilityStorage);
  const rateLimitLabel = formatRateLimitMode(rateLimitMode);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Runtime behavior</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Runtime health</span>
            <code>{runtimeHealth}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Endpoint health</span>
            <code>{endpointHealth}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Execution mode</span>
            <code>{executionMode}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Deterministic execution</span>
            <span>{hasExecutableEndpoints ? "Supported" : "Not yet executable"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Generated source</span>
            <span>Export only</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Endpoint map</span>
            <span>{hasEndpointMap ? "Available" : "Required"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Endpoint mapped</span>
            <span>{hasEndpointMap ? "Yes" : "No"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Auth-required endpoints</span>
            <span>{hasAuthRequiredEndpoints ? "Present" : "None detected"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Browser runtime endpoints</span>
            <span>{hasBrowserRuntimeEndpoints ? "Present" : "None detected"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Last status</span>
            <code>{lastStatus ?? "not recorded"}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Last execution mode</span>
            <code>{lastExecutionMode ?? "not recorded"}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Last tool</span>
            <span>{lastToolName ?? "not recorded"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Last latency</span>
            <span>{typeof lastLatencyMs === "number" ? `${lastLatencyMs}ms` : "not recorded"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Upstream status</span>
            <span>{typeof lastUpstreamStatus === "number" ? lastUpstreamStatus : "not recorded"}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Trace ID</span>
            <code>{lastTraceId ?? "not recorded"}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Error code</span>
            <code>{lastErrorCode ?? "none"}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Observability</span>
            <code>{observabilityLabel}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Rate limit mode</span>
            <code>{rateLimitLabel}</code>
          </div>
          <div className="flex items-center justify-between gap-4 border-b pb-2">
            <span className="text-muted-foreground">Missing auth</span>
            <code>auth_required / oauth_required</code>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Missing mapping</span>
            <code>mapping_required</code>
          </div>
        </div>
        <p className="text-muted-foreground">
          Astrail does not evaluate generated TypeScript inside Next.js. Hosted calls are routed through stored
          tool metadata and endpoint maps.
        </p>
      </CardContent>
    </Card>
  );
}

function formatObservabilityStorage(storage: "tool_call_logs" | "structured_log" | "unavailable") {
  if (storage === "tool_call_logs") return "database logs";
  if (storage === "structured_log") return "structured fallback";
  return "not enabled";
}

function formatRateLimitMode(mode: string) {
  if (mode === "in_memory") return "standard";
  if (mode === "upstash" || mode === "redis") return "distributed";
  return mode.replaceAll("_", " ");
}
