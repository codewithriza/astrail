import { createHash } from "crypto";
import type { McpTool, OpenApiEndpoint } from "@/lib/types";

export function stableSchemaValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSchemaValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableSchemaValue(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintOpenApiSpec(spec: unknown) {
  return createHash("sha256").update(stableSchemaValue(spec)).digest("hex");
}

export function fingerprintEndpointMap(endpoints: OpenApiEndpoint[]) {
  const canonical = endpoints.map((endpoint) => ({
    operation: endpoint.operation_id ?? `${endpoint.method.toUpperCase()} ${endpoint.path}`,
    method: endpoint.method.toUpperCase(),
    path: endpoint.path,
    parameters: endpoint.parameters,
    request_body_schema: endpoint.request_body_schema,
    responses: endpoint.responses,
    security: endpoint.security_requirements ?? endpoint.security,
  })).sort((a, b) => a.operation.localeCompare(b.operation));
  return fingerprintOpenApiSpec(canonical);
}

function endpointKey(endpoint: OpenApiEndpoint) {
  return endpoint.operation_id || endpoint.tool_name || `${endpoint.method.toUpperCase()} ${endpoint.path}`;
}

function endpointSignature(endpoint: OpenApiEndpoint) {
  return stableSchemaValue({
    method: endpoint.method.toUpperCase(),
    path: endpoint.path,
    parameters: endpoint.parameters,
    request_body_schema: endpoint.request_body_schema,
    responses: endpoint.responses,
    security: endpoint.security_requirements ?? endpoint.security,
  });
}

export function summarizeSchemaChanges(previous: OpenApiEndpoint[], current: OpenApiEndpoint[]) {
  const before = new Map(previous.map((endpoint) => [endpointKey(endpoint), endpointSignature(endpoint)]));
  const after = new Map(current.map((endpoint) => [endpointKey(endpoint), endpointSignature(endpoint)]));
  return {
    added: Array.from(after.keys()).filter((key) => !before.has(key)),
    removed: Array.from(before.keys()).filter((key) => !after.has(key)),
    changed: Array.from(after.keys()).filter((key) => before.has(key) && before.get(key) !== after.get(key)),
  };
}

export function schemaSummaryHasChanges(summary: ReturnType<typeof summarizeSchemaChanges>) {
  return summary.added.length > 0 || summary.removed.length > 0 || summary.changed.length > 0;
}

export function preserveGeneratedToolPolicy(previous: McpTool[], generated: McpTool[]) {
  const previousByName = new Map(previous.map((tool) => [tool.name, tool]));
  return generated.map((tool) => {
    const existing = previousByName.get(tool.name);
    return existing ? { ...tool, policy: existing.policy, description: existing.description || tool.description } : tool;
  });
}
