import type { GenerationDiagnostics } from "./types";

export function emptyDiagnostics(inputUrl: string | null): GenerationDiagnostics {
  const now = new Date().toISOString();

  return {
    input_url: inputUrl,
    discovered_url: null,
    discovery_method: null,
    spec_size_bytes: 0,
    endpoint_count: 0,
    selected_group: "All",
    tools_generated: 0,
    hosted_endpoint: null,
    warnings: [],
    errors: [],
    timestamps: {
      started_at: now,
    },
    trace: [],
    raw: [],
  };
}

export function normalizeDiagnostics(value: unknown): GenerationDiagnostics {
  if (Array.isArray(value)) {
    return {
      ...emptyDiagnostics(null),
      raw: value.filter((item): item is string => typeof item === "string"),
    };
  }

  if (!value || typeof value !== "object") {
    return emptyDiagnostics(null);
  }

  const record = value as Partial<GenerationDiagnostics>;

  return {
    input_url: record.input_url ?? null,
    discovered_url: record.discovered_url ?? null,
    discovery_method: record.discovery_method ?? null,
    spec_size_bytes: typeof record.spec_size_bytes === "number" ? record.spec_size_bytes : 0,
    endpoint_count: typeof record.endpoint_count === "number" ? record.endpoint_count : 0,
    selected_group: record.selected_group ?? "All",
    tools_generated: typeof record.tools_generated === "number" ? record.tools_generated : 0,
    hosted_endpoint: record.hosted_endpoint ?? null,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === "string") : [],
    errors: Array.isArray(record.errors) ? record.errors.filter((item): item is string => typeof item === "string") : [],
    timestamps: {
      started_at: record.timestamps?.started_at,
      completed_at: record.timestamps?.completed_at,
      failed_at: record.timestamps?.failed_at,
    },
    trace: Array.isArray(record.trace)
      ? record.trace.filter((item) => item && typeof item === "object" && "label" in item) as GenerationDiagnostics["trace"]
      : [],
    raw: Array.isArray(record.raw) ? record.raw.filter((item): item is string => typeof item === "string") : [],
  };
}

export function withHostedEndpoint(diagnostics: GenerationDiagnostics, hostedEndpoint: string): GenerationDiagnostics {
  return {
    ...diagnostics,
    hosted_endpoint: hostedEndpoint,
    timestamps: {
      ...diagnostics.timestamps,
      completed_at: diagnostics.timestamps.completed_at ?? new Date().toISOString(),
    },
    trace: [
      ...diagnostics.trace.filter((item) => item.label !== "Hosted endpoint created" && item.label !== "MCP endpoint verified"),
      {
        label: "Hosted endpoint created",
        status: "passed",
        detail: hostedEndpoint,
      },
      {
        label: "MCP endpoint verified",
        status: "passed",
        detail: "initialize, tools/list, and tools/call are served by /api/mcp/[serverId].",
      },
    ],
  };
}
