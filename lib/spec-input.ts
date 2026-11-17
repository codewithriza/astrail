import { buildASTSchema, getIntrospectionQuery, introspectionFromSchema, parse as parseGraphql } from "graphql";
import { parseSpecText } from "./openapi";
import { assertSafeUpstreamUrl, readBoundedResponseText } from "./runtime/network-policy";
import { discoverOpenApiSpec } from "./spec-discovery";
import type { SourceType } from "./types";

const GRAPHQL_TIMEOUT_MS = 15_000;
const MAX_GRAPHQL_SCHEMA_BYTES = 1_000_000;

async function assertSafeGraphqlEndpoint(endpoint: URL) {
  const localFixture = process.env.ASTRAIL_ENABLE_LOCAL_GRAPHQL_FIXTURES === "1"
    && endpoint.protocol === "http:"
    && ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname.toLowerCase());
  if (!localFixture) await assertSafeUpstreamUrl(endpoint);
}

export type LoadedSpecInput = {
  inputUrl: string | null;
  parsedSpec: unknown;
  sourceUrl: string | null;
  discoveryMethod: string | null;
  specSizeBytes: number;
  diagnostics: string[];
};

async function loadGraphqlUrl(sourceUrl: string): Promise<LoadedSpecInput> {
  const endpoint = new URL(sourceUrl);
  await assertSafeGraphqlEndpoint(endpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-astrail-upstream": "graphql-introspection",
    },
    body: JSON.stringify({ query: getIntrospectionQuery({ descriptions: true }) }),
    redirect: "manual",
    signal: AbortSignal.timeout(GRAPHQL_TIMEOUT_MS),
  });
  const text = await readBoundedResponseText(response, MAX_GRAPHQL_SCHEMA_BYTES, "GraphQL introspection response");
  const specSizeBytes = Buffer.byteLength(text, "utf8");
  if (!response.ok) throw new Error(`GraphQL endpoint returned HTTP ${response.status} during introspection.`);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("GraphQL endpoint did not return JSON introspection data.");
  }
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0] as { message?: unknown } | undefined;
    throw new Error(typeof first?.message === "string" ? first.message : "GraphQL introspection was rejected.");
  }

  return {
    inputUrl: endpoint.toString(),
    parsedSpec: { endpoint: endpoint.toString(), data: record.data ?? record },
    sourceUrl: endpoint.toString(),
    discoveryMethod: "graphql_live_introspection",
    specSizeBytes,
    diagnostics: ["Input type: live GraphQL endpoint.", "GraphQL introspection query completed."],
  };
}

async function loadGraphqlSdl(sourceUrl: string, sdl: string): Promise<LoadedSpecInput> {
  const endpoint = new URL(sourceUrl);
  await assertSafeGraphqlEndpoint(endpoint);
  const specSizeBytes = Buffer.byteLength(sdl, "utf8");
  if (specSizeBytes > MAX_GRAPHQL_SCHEMA_BYTES) {
    throw new Error(`GraphQL SDL exceeded ${MAX_GRAPHQL_SCHEMA_BYTES} bytes.`);
  }
  const schema = buildASTSchema(parseGraphql(sdl));
  const introspection = introspectionFromSchema(schema, { descriptions: true });
  return {
    inputUrl: endpoint.toString(),
    parsedSpec: { endpoint: endpoint.toString(), data: introspection },
    sourceUrl: endpoint.toString(),
    discoveryMethod: "graphql_sdl",
    specSizeBytes,
    diagnostics: ["Input type: GraphQL SDL.", "SDL parsed and converted to deterministic introspection metadata."],
  };
}

export async function loadSpecInput(input: {
  sourceType: SourceType;
  sourceUrl?: string;
  rawJson?: string;
}): Promise<LoadedSpecInput> {
  const diagnostics: string[] = [];

  if (input.sourceType === "graphql_url") {
    if (!input.sourceUrl) throw new Error("GraphQL endpoint URL is required.");
    return loadGraphqlUrl(input.sourceUrl);
  }

  if (input.sourceType === "graphql_sdl") {
    if (!input.sourceUrl) throw new Error("GraphQL execution endpoint URL is required for SDL import.");
    if (!input.rawJson?.trim()) throw new Error("GraphQL SDL is required.");
    return loadGraphqlSdl(input.sourceUrl, input.rawJson);
  }

  if (input.sourceType === "json_paste") {
    if (!input.rawJson) throw new Error("Raw OpenAPI, Swagger, or Google Discovery JSON/YAML is required.");
    diagnostics.push("Input type: raw OpenAPI/Swagger/Google Discovery JSON/YAML paste or uploaded file.");
    return {
      inputUrl: null,
      parsedSpec: parseSpecText(input.rawJson),
      sourceUrl: null,
      discoveryMethod: "json_paste",
      specSizeBytes: Buffer.byteLength(input.rawJson, "utf8"),
      diagnostics,
    };
  }

  if (!input.sourceUrl) throw new Error("API docs, OpenAPI, Swagger, or Google Discovery URL is required.");
  const discovery = await discoverOpenApiSpec(input.sourceUrl);
  diagnostics.push(...discovery.diagnostics);

  if (discovery.status !== "found" || !discovery.spec_raw || !discovery.spec_format) {
    const error = new Error("No OpenAPI/Swagger/Google Discovery spec found automatically. Paste a direct spec URL or raw JSON.");
    error.name = "SpecDiscoveryError";
    throw Object.assign(error, { diagnostics });
  }

  return {
    inputUrl: input.sourceUrl,
    parsedSpec: parseSpecText(discovery.spec_raw, discovery.spec_format),
    sourceUrl: discovery.discovered_url ?? input.sourceUrl,
    discoveryMethod: discovery.discovery_method ?? null,
    specSizeBytes: Buffer.byteLength(discovery.spec_raw, "utf8"),
    diagnostics,
  };
}
