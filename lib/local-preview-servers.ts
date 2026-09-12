import { deflateRawSync, inflateRawSync } from "node:zlib";
import { withHostedEndpoint } from "@/lib/diagnostics";
import { type GenerationPipelineInput, type GenerationPipelineResult, runGenerationPipeline } from "@/lib/generation-pipeline";
import { findLocalGeneratedServer, localDemoUserId, saveLocalGeneratedServer } from "@/lib/local-demo";
import { buildMcpEndpoint } from "@/lib/urls";
import { assertPublicWebsiteUrl } from "@/lib/runtime/playwright-website";
import type { McpServer } from "@/lib/types";
import { inspectWebsiteForMcp } from "@/lib/website-inspector";

const WEBSITE_PREFIX = "website-preview-";
const OPENAPI_PREFIX = "openapi-preview-";
const MAX_SELF_DESCRIBING_ID_LENGTH = 3800;

function encodePayload(prefix: string, payload: unknown) {
  const compressed = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${prefix}${compressed.toString("base64url")}`;
}

function decodePayload<T>(prefix: string, id: string): T | null {
  if (!id.startsWith(prefix)) return null;
  try {
    const raw = Buffer.from(id.slice(prefix.length), "base64url");
    return JSON.parse(inflateRawSync(raw).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function safePreviewId(prefix: string, payload: unknown) {
  const id = encodePayload(prefix, payload);
  return id.length <= MAX_SELF_DESCRIBING_ID_LENGTH ? id : null;
}

export function websitePreviewServerId(inputUrl: string) {
  const url = assertPublicWebsiteUrl(inputUrl);
  return safePreviewId(WEBSITE_PREFIX, { url: url.toString() });
}

export function openApiPreviewServerId(input: GenerationPipelineInput) {
  return safePreviewId(OPENAPI_PREFIX, {
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    rawJson: input.rawJson,
    selectedGroup: input.selectedGroup,
    endpointLimit: input.endpointLimit,
    generationMode: input.generationMode,
    clientPreset: input.clientPreset,
    filters: input.filters,
    runtimePolicy: input.runtimePolicy,
  });
}

export async function buildLocalWebsitePreviewServer(inputUrl: string, requestUrl?: string | URL) {
  const inspected = await inspectWebsiteForMcp(inputUrl);
  const id = websitePreviewServerId(inspected.sourceUrl) ?? "local-website-preview";
  const hostedEndpoint = buildMcpEndpoint(id, requestUrl);
  const diagnostics = withHostedEndpoint(inspected.diagnostics, hostedEndpoint);
  const server: McpServer = {
    id,
    user_id: localDemoUserId,
    name: inspected.generated.name,
    description: inspected.generated.description,
    source_url: inspected.sourceUrl,
    source_type: "website",
    category: "Website",
    generated_code: inspected.generated.generated_code,
    tools_json: inspected.generated.tools,
    endpoint_map: inspected.endpointMap,
    diagnostics,
    status: "live",
    validation_status: "passed",
    generation_status: "completed",
    hosted_endpoint: hostedEndpoint,
    is_public: true,
    call_count: 0,
    generation_version: 1,
    protocol_version: "2024-11-05",
    created_at: new Date().toISOString(),
  };

  saveLocalGeneratedServer(server);
  return { server, generated: inspected.generated, diagnostics };
}

export async function loadLocalWebsitePreviewServer(serverId: string, requestUrl?: string | URL) {
  const cached = findLocalGeneratedServer(serverId);
  if (cached) return cached;

  const payload = decodePayload<{ url?: string }>(WEBSITE_PREFIX, serverId);
  if (!payload?.url) return null;
  return (await buildLocalWebsitePreviewServer(payload.url, requestUrl)).server;
}

export function buildLocalOpenApiPreviewServer(
  input: GenerationPipelineInput,
  pipeline: GenerationPipelineResult,
  requestUrl?: string | URL,
  explicitId?: string | null
) {
  const id = explicitId ?? openApiPreviewServerId(input) ?? `local-generated-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const hostedEndpoint = buildMcpEndpoint(id, requestUrl);
  const diagnostics = withHostedEndpoint(pipeline.diagnostics, hostedEndpoint);
  const server = saveLocalGeneratedServer({
    id,
    user_id: localDemoUserId,
    name: pipeline.generated.name,
    description: pipeline.generated.description,
    source_url: pipeline.sourceUrl,
    source_type: input.sourceType,
    category: input.generationMode === "code" ? "Code Mode" : "OpenAPI",
    generated_code: pipeline.generated.generated_code,
    tools_json: pipeline.generated.tools,
    endpoint_map: pipeline.endpointMap,
    runtime_policy: input.runtimePolicy ?? null,
    diagnostics,
    status: "live",
    validation_status: pipeline.validationStatus,
    generation_status: pipeline.generationStatus,
    is_public: input.runtimePolicy ? false : true,
    hosted_endpoint: hostedEndpoint,
    call_count: 0,
    generation_version: 1,
    protocol_version: "2024-11-05",
    created_at: new Date().toISOString(),
  } as McpServer);

  return { server, generated: pipeline.generated, diagnostics };
}

export async function loadLocalOpenApiPreviewServer(serverId: string, requestUrl?: string | URL) {
  const cached = findLocalGeneratedServer(serverId);
  if (cached) return cached;

  const input = decodePayload<GenerationPipelineInput>(OPENAPI_PREFIX, serverId);
  if (!input?.sourceType) return null;
  const pipeline = await runGenerationPipeline(input);
  return buildLocalOpenApiPreviewServer(input, pipeline, requestUrl, serverId).server;
}

export async function loadLocalPreviewServer(serverId: string, requestUrl?: string | URL) {
  const cached = findLocalGeneratedServer(serverId);
  if (cached) return cached;

  const website = await loadLocalWebsitePreviewServer(serverId, requestUrl);
  if (website) return website;

  return loadLocalOpenApiPreviewServer(serverId, requestUrl);
}
