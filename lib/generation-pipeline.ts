import { buildEndpointInputSchema, generateMcpFromSpec, generateMcpLocally } from "./generate-mcp";
import { defaultToolPolicy, enrichToolsForAgents } from "./agent-tool-profile";
import { endpointDocsCorpus } from "./codeModeDocs";
import { emptyDiagnostics } from "./diagnostics";
import {
  endpointOperations,
  endpointGroups,
  endpointResources,
  filterEndpointMap,
  filterEndpointsByGroup,
  limitEndpointMap,
  coerceToOpenApiSpec,
  normalizeEndpointMap,
  subsetSpecByEndpointMap,
} from "./openapi";
import { loadSpecInput } from "./spec-input";
import type {
  GeneratedMcpServer,
  GenerationDiagnostics,
  McpClientPreset,
  McpEndpointFilters,
  McpGenerationMode,
  OpenApiEndpoint,
  RuntimePermissionPolicy,
  SourceType,
  SpecPreview,
} from "./types";
import { applyOpenApiOverlay } from "./openapi-overlay";

export const DEFAULT_STATIC_ENDPOINT_LIMIT = 30;
export const DEFAULT_DYNAMIC_ENDPOINT_LIMIT = 250;
export const DEFAULT_CODE_ENDPOINT_LIMIT = 500;
export const DEFAULT_ENDPOINT_LIMIT = DEFAULT_STATIC_ENDPOINT_LIMIT;
export const LARGE_SPEC_ENDPOINT_THRESHOLD = 30;
export const LARGE_SPEC_SIZE_BYTES = 250_000;
const CLAUDE_TIMEOUT_MS = 60_000;
const CLAUDE_ENDPOINT_LIMIT = 12;

export type GenerationPipelineInput = {
  sourceType: SourceType;
  sourceUrl?: string;
  rawJson?: string;
  selectedGroup?: string;
  endpointLimit?: number;
  generationMode?: McpGenerationMode;
  clientPreset?: McpClientPreset;
  filters?: McpEndpointFilters;
  runtimePolicy?: RuntimePermissionPolicy;
  overlay?: unknown;
  curatedOperationIds?: string[];
};

export type GenerationPipelineResult = {
  generated: GeneratedMcpServer;
  sourceUrl: string | null;
  endpointMap: OpenApiEndpoint[];
  diagnostics: GenerationDiagnostics;
  validationStatus: "passed";
  generationStatus: "completed";
  specSizeBytes: number;
  selectedGroup: string;
  endpointsFound: number;
  endpointsSent: number;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => {
        const error = new Error(message);
        error.name = "GenerationTimeoutError";
        reject(error);
      }, timeoutMs);
    }),
  ]);
}

function snakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function stableEndpointToolNames(serverName: string, endpoints: OpenApiEndpoint[]) {
  const prefix = snakeCase(serverName).replace(/_api$/, "") || "api";
  const seen = new Set<string>();

  return endpoints.map((endpoint, index) => {
    const raw = endpoint.operation_id || endpoint.summary || `${endpoint.method}_${endpoint.path}` || `endpoint_${index + 1}`;
    const base = `${prefix}_${snakeCase(raw)}`.slice(0, 64) || `endpoint_${index + 1}`;
    let next = base;
    let suffix = 2;
    while (seen.has(next)) {
      const marker = `_${suffix}`;
      next = `${base.slice(0, 64 - marker.length)}${marker}`;
      suffix += 1;
    }
    seen.add(next);
    return {
      ...endpoint,
      tool_name: endpoint.tool_name ?? next,
    };
  });
}

function attachEndpointMetadata(
  generated: GeneratedMcpServer,
  endpoints: OpenApiEndpoint[],
  generationMode: Exclude<McpGenerationMode, "auto">
) {
  if (generationMode === "dynamic" || generationMode === "code") {
    return {
      generated: {
        ...generated,
        tools: generated.tools,
      },
      endpointMap: stableEndpointToolNames(generated.name, endpoints),
    };
  }

  const toolsWithEndpointMetadata = generated.tools.map((tool, index) => ({
    ...tool,
    method: tool.method ?? endpoints[index]?.method,
    path: tool.path ?? endpoints[index]?.path,
    enabled: tool.enabled ?? endpoints[index]?.enabled,
    policy: tool.policy ?? endpoints[index]?.policy,
  }));

  const endpointMap = endpoints.map((endpoint, index) => ({
    ...endpoint,
    tool_name: toolsWithEndpointMetadata[index]?.name ?? endpoint.tool_name ?? null,
  }));

  const tools = enrichToolsForAgents(toolsWithEndpointMetadata, endpointMap);

  return {
    generated: {
      ...generated,
      tools,
    },
    endpointMap,
  };
}

export async function previewSpec(input: GenerationPipelineInput): Promise<SpecPreview> {
  const loaded = await loadSpecInput(input);
  const spec = coerceToOpenApiSpec(input.overlay ? applyOpenApiOverlay(loaded.parsedSpec,input.overlay) : loaded.parsedSpec);
  const endpointMap = normalizeEndpointMap(spec);
  const filteredEndpointMap = filterEndpointMap(endpointMap, input.filters);
  const groups = endpointGroups(endpointMap);
  const isLarge = filteredEndpointMap.length > LARGE_SPEC_ENDPOINT_THRESHOLD || loaded.specSizeBytes > LARGE_SPEC_SIZE_BYTES;
  const recommendedMode = isLarge ? "code" : "static";

  return {
    source_url: loaded.sourceUrl,
    spec_size_bytes: loaded.specSizeBytes,
    endpoint_count: filteredEndpointMap.length,
    endpoint_limit: recommendedMode === "code" ? DEFAULT_CODE_ENDPOINT_LIMIT : DEFAULT_STATIC_ENDPOINT_LIMIT,
    groups,
    resources: endpointResources(endpointMap),
    operations: endpointOperations(endpointMap),
    recommended_mode: recommendedMode,
    client_presets: ["default", "claude", "claude-code", "cursor", "openai"],
    is_large: isLarge,
    warning: isLarge
      ? `Large spec detected: ${filteredEndpointMap.length} matching endpoints found. Code Mode will expose search_docs and execute instead of flooding the client context.`
      : null,
    diagnostics: [
      ...loaded.diagnostics,
      `Spec size: ${loaded.specSizeBytes} bytes.`,
      `Endpoints found: ${endpointMap.length}.`,
      `Endpoints after filters: ${filteredEndpointMap.length}.`,
      `Endpoint groups found: ${groups.map((group) => group.name).join(", ")}.`,
    ],
  };
}

export async function runGenerationPipeline(input: GenerationPipelineInput): Promise<GenerationPipelineResult> {
  const loaded = await loadSpecInput(input);
  const rawDiagnostics: string[] = [...loaded.diagnostics];
  const diagnostics = emptyDiagnostics(loaded.inputUrl);
  diagnostics.discovered_url = loaded.sourceUrl;
  diagnostics.discovery_method = loaded.discoveryMethod;
  diagnostics.spec_size_bytes = loaded.specSizeBytes;
  diagnostics.raw = rawDiagnostics;

  const spec = coerceToOpenApiSpec(input.overlay ? applyOpenApiOverlay(loaded.parsedSpec,input.overlay) : loaded.parsedSpec);
  rawDiagnostics.push("Validation status: passed.");

  const endpointMap = normalizeEndpointMap(spec);
  const selectedGroup = input.selectedGroup || "All";
  const filteredByGroup = filterEndpointsByGroup(endpointMap, selectedGroup).filter((endpoint)=>!input.curatedOperationIds?.length||input.curatedOperationIds.includes(endpoint.operation_id??""));
  const filteredEndpointMap = filterEndpointMap(filteredByGroup, input.filters);
  const clientPreset = input.clientPreset ?? "default";
  const requestedMode = input.generationMode ?? "auto";
  const largeSpec = filteredEndpointMap.length > LARGE_SPEC_ENDPOINT_THRESHOLD || loaded.specSizeBytes > LARGE_SPEC_SIZE_BYTES;
  const generationMode: Exclude<McpGenerationMode, "auto"> = requestedMode === "auto"
    ? (largeSpec ? "code" : "static")
    : requestedMode;
  const maxEndpointLimit = generationMode === "code"
    ? DEFAULT_CODE_ENDPOINT_LIMIT
    : generationMode === "dynamic"
      ? DEFAULT_DYNAMIC_ENDPOINT_LIMIT
      : DEFAULT_STATIC_ENDPOINT_LIMIT;
  const endpointLimit = Math.max(1, Math.min(input.endpointLimit ?? maxEndpointLimit, maxEndpointLimit));
  const limitedEndpointMap = limitEndpointMap(filteredEndpointMap, endpointLimit);
  const specForGeneration = subsetSpecByEndpointMap(spec, limitedEndpointMap);

  diagnostics.endpoint_count = endpointMap.length;
  diagnostics.selected_group = selectedGroup;
  diagnostics.trace.push(
    {
      label: "Spec discovered",
      status: "passed",
      detail: loaded.sourceUrl ?? "Raw OpenAPI JSON paste",
    },
    {
      label: `${endpointMap.length} endpoints extracted`,
      status: "passed",
      detail: selectedGroup === "All" ? undefined : `Selected group: ${selectedGroup}`,
    }
  );

  rawDiagnostics.push(`Spec size: ${loaded.specSizeBytes} bytes.`);
  rawDiagnostics.push(`Endpoints found: ${endpointMap.length}.`);
  rawDiagnostics.push(`Endpoints after selected group and filters: ${filteredEndpointMap.length}.`);
  rawDiagnostics.push(`Selected group: ${selectedGroup}.`);
  rawDiagnostics.push(`Generation mode: ${generationMode}.`);
  rawDiagnostics.push(`Client preset: ${clientPreset}.`);
  const useClaude = generationMode === "static" && clientPreset === "default" && limitedEndpointMap.length <= CLAUDE_ENDPOINT_LIMIT && loaded.specSizeBytes <= LARGE_SPEC_SIZE_BYTES;
  rawDiagnostics.push(`Endpoints sent to Claude: ${useClaude ? limitedEndpointMap.length : 0}.`);
  if (!useClaude && generationMode === "static") {
    const warning = `Claude skipped: selected endpoint set is above ${CLAUDE_ENDPOINT_LIMIT} endpoints or spec is above ${LARGE_SPEC_SIZE_BYTES} bytes.`;
    diagnostics.warnings.push(warning);
    rawDiagnostics.push(warning);
  } else if (!useClaude) {
    rawDiagnostics.push(`${generationMode} mode uses deterministic MCP generation.`);
  }
  if (largeSpec) {
    const warning = generationMode === "code"
      ? `Large spec detected: ${filteredEndpointMap.length} matching endpoints found. Generated Code Mode tools over ${limitedEndpointMap.length} mapped endpoints.`
      : generationMode === "dynamic"
        ? `Large spec detected: ${filteredEndpointMap.length} matching endpoints found. Generated dynamic catalog tools over ${limitedEndpointMap.length} mapped endpoints.`
      : `Large spec detected: ${filteredEndpointMap.length} matching endpoints found. Generated first ${limitedEndpointMap.length} static endpoints.`;
    diagnostics.warnings.push(warning);
    diagnostics.trace.push({
      label: "Large spec limited",
      status: "warning",
      detail: warning,
    });
    rawDiagnostics.push(warning);
  }

  let generated: GeneratedMcpServer;
  if (useClaude) {
    try {
      generated = await withTimeout(
        generateMcpFromSpec(specForGeneration, { clientPreset, generationMode }),
        CLAUDE_TIMEOUT_MS,
        "Claude generation timed out. This API spec is large. Generating a full MCP server may take longer. Try selecting specific endpoint groups."
      );
    } catch (error) {
      const warning = error instanceof Error && error.name === "GenerationTimeoutError"
        ? "Claude generation timed out. Deterministic MCP generation was used so the request could complete."
        : "AI-assisted generation was temporarily unavailable. Deterministic MCP generation was used so the request could complete.";
      diagnostics.warnings.push(warning);
      diagnostics.trace.push({
        label: "Deterministic generation fallback",
        status: "warning",
        detail: warning,
      });
      rawDiagnostics.push(warning);
      generated = generateMcpLocally(specForGeneration, { clientPreset, generationMode });
    }
  } else {
    generated = generateMcpLocally(specForGeneration, { clientPreset, generationMode });
  }
  const enriched = attachEndpointMetadata(generated, limitedEndpointMap, generationMode);
  if (generationMode === "dynamic" || generationMode === "code") {
    enriched.endpointMap = enriched.endpointMap.map((endpoint) => ({
      ...endpoint,
      input_schema: buildEndpointInputSchema(endpoint, specForGeneration, {
        clientPreset,
        generationMode: "static",
      }),
    }));
  }
  enriched.endpointMap = enriched.endpointMap.map((endpoint) => ({
    ...endpoint,
    policy: endpoint.policy ?? defaultToolPolicy({ method: endpoint.method }, endpoint),
    docs_corpus: endpointDocsCorpus(endpoint),
  }));
  diagnostics.tools_generated = enriched.generated.tools.length;
  diagnostics.timestamps.completed_at = new Date().toISOString();
  diagnostics.raw = rawDiagnostics;
  diagnostics.trace.push({
    label: `${enriched.generated.tools.length} tools generated`,
    status: "passed",
  });
  rawDiagnostics.push(`Docs corpus: ${enriched.endpointMap.length} endpoint document(s) with SDK methods, arguments, auth, pagination, response hints, and examples.`);
  rawDiagnostics.push(`Generation status: completed with ${enriched.generated.tools.length} MCP tool(s).`);

  return {
    generated: enriched.generated,
    sourceUrl: loaded.sourceUrl,
    endpointMap: enriched.endpointMap,
    diagnostics,
    validationStatus: "passed",
    generationStatus: "completed",
    specSizeBytes: loaded.specSizeBytes,
    selectedGroup,
    endpointsFound: endpointMap.length,
    endpointsSent: limitedEndpointMap.length,
  };
}
