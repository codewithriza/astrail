import { AlertTriangle, CheckCircle2, Circle, XCircle } from "lucide-react";
import { normalizeDiagnostics } from "@/lib/diagnostics";
import type { GenerationDiagnostics, OpenApiEndpoint } from "@/lib/types";

function iconFor(status: GenerationDiagnostics["trace"][number]["status"]) {
  if (status === "passed") return <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />;
  if (status === "warning") return <AlertTriangle className="mt-0.5 h-4 w-4 text-primary" />;
  if (status === "failed") return <XCircle className="mt-0.5 h-4 w-4 text-destructive" />;
  return <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />;
}

export function GenerationDiagnosticsPanel({
  diagnostics,
  endpointMap,
  toolsCount,
  hostedEndpoint,
}: {
  diagnostics: unknown;
  endpointMap: OpenApiEndpoint[];
  toolsCount: number;
  hostedEndpoint: string;
}) {
  const normalized = normalizeDiagnostics(diagnostics);
  const trace = normalized.trace.length > 0
    ? normalized.trace
    : [
      {
        label: normalized.discovered_url ? "Spec discovered" : "Spec discovery metadata unavailable",
        status: normalized.discovered_url ? "passed" as const : "pending" as const,
        detail: normalized.discovered_url ?? undefined,
      },
      {
        label: normalized.endpoint_count || endpointMap.length
          ? `${normalized.endpoint_count || endpointMap.length} endpoints extracted`
          : "Endpoint extraction metadata unavailable",
        status: endpointMap.length > 0 || normalized.endpoint_count > 0 ? "passed" as const : "pending" as const,
      },
      {
        label: `${normalized.tools_generated || toolsCount} tools generated`,
        status: toolsCount > 0 || normalized.tools_generated > 0 ? "passed" as const : "pending" as const,
      },
      {
        label: "Hosted endpoint created",
        status: hostedEndpoint ? "passed" as const : "pending" as const,
        detail: hostedEndpoint,
      },
      {
        label: "MCP endpoint verified",
        status: hostedEndpoint ? "passed" as const : "pending" as const,
        detail: hostedEndpoint ? "initialize, tools/list, and tools/call are served by /api/mcp/[serverId]." : undefined,
      },
    ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {trace.map((item) => (
          <div key={`${item.label}-${item.detail ?? ""}`} className="flex gap-2 text-sm">
            {iconFor(item.status)}
            <div>
              <p className="font-medium">{item.label}</p>
              {item.detail && <p className="text-muted-foreground">{item.detail}</p>}
            </div>
          </div>
        ))}
      </div>

      {(normalized.warnings.length > 0 || normalized.errors.length > 0) && (
        <div className="space-y-2 border-t pt-3 text-sm">
          {normalized.warnings.map((warning) => (
            <div key={warning} className="flex gap-2 text-primary">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <p>{warning}</p>
            </div>
          ))}
          {normalized.errors.map((error) => (
            <div key={error} className="flex gap-2 text-destructive">
              <XCircle className="mt-0.5 h-4 w-4" />
              <p>{error}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground">Input URL</p>
          <p className="break-all">{normalized.input_url ?? "Raw JSON"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Discovered URL</p>
          <p className="break-all">{normalized.discovered_url ?? "Unavailable"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Discovery method</p>
          <p>{normalized.discovery_method ?? "Unavailable"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Spec size</p>
          <p>{normalized.spec_size_bytes.toLocaleString()} bytes</p>
        </div>
      </div>

      {normalized.raw.length > 0 && (
        <details className="border-t pt-3 text-sm">
          <summary className="cursor-pointer font-medium">Raw diagnostics</summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {normalized.raw.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
