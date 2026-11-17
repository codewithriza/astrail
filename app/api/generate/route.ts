import { NextResponse } from "next/server";
import { z } from "zod";
import { checkGenerationAllowance, checkHostedEndpointAllowance, getBillingUsageSummary, hostedEndpointLimitPayload, isHostedEndpointLimitError } from "@/lib/billing/usage";
import { encryptCredential, hasCredentialEncryptionKey, previewSecret } from "@/lib/credentials";
import { emptyDiagnostics, withHostedEndpoint } from "@/lib/diagnostics";
import { runGenerationPipeline } from "@/lib/generation-pipeline";
import { localDemoUserId, saveLocalGeneratedServer } from "@/lib/local-demo";
import { buildLocalOpenApiPreviewServer, openApiPreviewServerId } from "@/lib/local-preview-servers";
import { buildRemoteMcpImport } from "@/lib/mcp-proxy";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";
import { requireTurnstile } from "@/lib/turnstile";
import { buildMcpEndpoint, getRuntimeBaseUrl } from "@/lib/urls";

export const runtime = "nodejs";

const RuntimePermissionPatternSchema = z.union([
  z.string(),
  z.object({
    pattern: z.string().min(1),
    regex: z.boolean().optional(),
    match: z.enum(["sdk_method", "endpoint_id", "tool_name", "operation_id", "method_path", "resource", "tag", "path", "http_method"]).optional(),
    note: z.string().max(240).optional(),
  }),
]);

const RuntimeRolePolicySchema = z.object({
  max_action_level: z.enum(["read", "draft", "write", "send", "destructive"]).optional(),
  allowed_tools: z.array(z.string().min(1).max(256)).max(200).optional(),
  blocked_tools: z.array(z.string().min(1).max(256)).max(200).optional(),
  note: z.string().max(240).optional(),
}).strict();

const RuntimePolicySchema = z.object({
  business_context: z.string().trim().max(4000).optional(),
  allow_http_gets: z.boolean().optional(),
  allowed_methods: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  blocked_methods: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  allowed_resources: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  blocked_resources: z.array(RuntimePermissionPatternSchema).max(200).optional(),
  read_only: z.boolean().optional(),
  roles: z.record(z.string().min(1).max(64), RuntimeRolePolicySchema).optional(),
});

const McpAuthSchema = z.object({
  scheme: z.enum(["bearer", "api_key_header", "api_key_query"]),
  secret: z.string().min(8).max(8192),
  injectionName: z.string().min(1).max(80).optional(),
}).strict();

const GenerateRequestSchema = z.object({
  sourceType: z.enum(["url", "openapi_url", "json_paste", "graphql_url", "graphql_sdl", "mcp_url"]),
  sourceUrl: z.string().url().optional(),
  rawJson: z.string().optional(),
  selectedGroup: z.string().optional(),
  endpointLimit: z.number().int().positive().max(500).optional(),
  generationMode: z.enum(["auto", "static", "dynamic", "code"]).optional(),
  clientPreset: z.enum(["default", "claude", "claude-code", "cursor", "openai"]).optional(),
  filters: z.object({
    tools: z.array(z.string()).optional(),
    noTools: z.array(z.string()).optional(),
    resources: z.array(z.string()).optional(),
    noResources: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    noTags: z.array(z.string()).optional(),
    operations: z.array(z.enum(["read", "write", "destructive"])).optional(),
    noOperations: z.array(z.enum(["read", "write", "destructive"])).optional(),
  }).optional(),
  runtimePolicy: RuntimePolicySchema.optional(),
  runtime_policy: RuntimePolicySchema.optional(),
  mcpAuth: McpAuthSchema.optional(),
  turnstileToken: z.string().nullish(),
});

export async function POST(request: Request) {
  if (!hasServerNeonEnv()) {
    let bodyForFailure: z.infer<typeof GenerateRequestSchema> | null = null;
    try {
      const body = GenerateRequestSchema.parse(await request.json());
      bodyForFailure = body;
      const turnstileError = await requireTurnstile(request, body.turnstileToken, "mcp-generate");
      if (turnstileError) return turnstileError;
      const { turnstileToken: _turnstileToken, ...bodyWithoutChallenge } = body;
      const generationInput = {
        ...bodyWithoutChallenge,
        runtimePolicy: bodyWithoutChallenge.runtimePolicy ?? bodyWithoutChallenge.runtime_policy,
      };
      if (generationInput.sourceType === "mcp_url") {
        const imported = await buildRemoteMcpImport(generationInput.sourceUrl ?? "", generationInput.runtimePolicy, generationInput.mcpAuth);
        const id = `mcp-preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const hostedEndpoint = buildMcpEndpoint(id, request.url);
        const diagnostics = withHostedEndpoint(imported.diagnostics, hostedEndpoint);
        const server = saveLocalGeneratedServer({
          id,
          user_id: localDemoUserId,
          name: imported.generated.name,
          description: imported.generated.description,
          source_url: imported.endpointUrl,
          source_type: "mcp_url",
          category: "MCP Proxy",
          generated_code: imported.generated.generated_code,
          tools_json: imported.generated.tools,
          endpoint_map: imported.endpointMap,
          runtime_policy: generationInput.runtimePolicy ?? null,
          diagnostics,
          status: "live",
          validation_status: "passed",
          generation_status: "completed",
          is_public: false,
          hosted_endpoint: hostedEndpoint,
          call_count: 0,
          generation_version: 1,
          protocol_version: "2024-11-05",
          created_at: new Date().toISOString(),
        } as McpServer);

        return NextResponse.json({
          server,
          generated: imported.generated,
          diagnostics,
          preview: true,
        });
      }
      const pipeline = await runGenerationPipeline(generationInput);
      const selfDescribingId = openApiPreviewServerId(generationInput);
      const localPreview = buildLocalOpenApiPreviewServer(generationInput, pipeline, request.url, selfDescribingId);
      if (!selfDescribingId) {
        localPreview.diagnostics.warnings.push("This raw OpenAPI preview is stored in local process memory until persistent workspace storage is connected. Use a public OpenAPI URL for a self-describing preview endpoint without storage.");
      }

      return NextResponse.json({
        server: localPreview.server,
        generated: localPreview.generated,
        diagnostics: localPreview.diagnostics,
        preview: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      const rawDiagnostics = typeof error === "object" && error && "diagnostics" in error
        ? (error.diagnostics as string[])
        : [];
      const diagnostics = emptyDiagnostics(bodyForFailure?.sourceUrl ?? null);
      diagnostics.errors = [message];
      diagnostics.raw = rawDiagnostics;
      diagnostics.timestamps.failed_at = new Date().toISOString();
      diagnostics.trace = [{
        label: error instanceof Error && error.name === "SpecDiscoveryError" ? "No OpenAPI/Swagger spec found" : "Generation failed",
        status: "failed",
        detail: message,
      }];
      return NextResponse.json({ error: message, diagnostics }, { status: error instanceof Error && error.name === "SpecDiscoveryError" ? 422 : 400 });
    }
  }

  const neon = await createServerNeonClient();
  const { data: userData, error: userError } = await neon.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let bodyForFailure: z.infer<typeof GenerateRequestSchema> | null = null;
  let createdServerId: string | null = null;

  try {
    const body = GenerateRequestSchema.parse(await request.json());
    bodyForFailure = body;
    const turnstileError = await requireTurnstile(request, body.turnstileToken, "mcp-generate");
    if (turnstileError) return turnstileError;
    const { turnstileToken: _turnstileToken, ...bodyWithoutChallenge } = body;
    const runtimePolicy = body.runtimePolicy ?? body.runtime_policy ?? null;
    const generationAllowance = await checkGenerationAllowance(userData.user.id, bodyWithoutChallenge.sourceType);
    if (!generationAllowance.allowed) {
      return NextResponse.json({
        error: "Monthly MCP generation credits or limit reached.",
        billing: generationAllowance.summary,
        billingAction: {
          meter: generationAllowance.meter,
          creditCost: generationAllowance.cost,
        },
      }, { status: 402 });
    }

    const endpointAllowance = await checkHostedEndpointAllowance(userData.user.id);
    if (!endpointAllowance.allowed) {
      if (endpointAllowance.reason === "unavailable") {
        return NextResponse.json({ error: "Hosted endpoint capacity is temporarily unavailable. Retry shortly." }, { status: 503 });
      }
      return NextResponse.json(hostedEndpointLimitPayload(endpointAllowance.summary), { status: 402 });
    }

    if (bodyWithoutChallenge.sourceType === "mcp_url" && bodyWithoutChallenge.mcpAuth && !hasCredentialEncryptionKey()) {
      return NextResponse.json({
        error: "Authenticated MCP import requires CREDENTIAL_ENCRYPTION_KEY. No plaintext credential was stored.",
      }, { status: 503 });
    }

    const proxyImport = bodyWithoutChallenge.sourceType === "mcp_url"
      ? await buildRemoteMcpImport(bodyWithoutChallenge.sourceUrl ?? "", runtimePolicy, bodyWithoutChallenge.mcpAuth)
      : null;
    const pipeline = proxyImport
      ? null
      : await runGenerationPipeline({
        ...bodyWithoutChallenge,
        runtimePolicy: runtimePolicy ?? undefined,
      });
    const generated = proxyImport?.generated ?? pipeline!.generated;
    const db = await createDataClient();

    await db.from("profiles").upsert({
      id: userData.user.id,
      email: userData.user.email ?? "",
    });

    const requestUrl = new URL(request.url);
    const runtimeBaseUrl = getRuntimeBaseUrl(requestUrl);
    const baseInsert = {
      user_id: userData.user.id,
      name: generated.name,
      description: generated.description,
      source_url: proxyImport?.endpointUrl ?? pipeline!.sourceUrl,
      source_type: body.sourceType,
      generated_code: generated.generated_code,
      tools_json: generated.tools,
      hosted_endpoint: `${runtimeBaseUrl}/api/mcp/pending`,
      is_public: false,
    };

    const enrichedInsert = {
      ...baseInsert,
      endpoint_map: proxyImport?.endpointMap ?? pipeline!.endpointMap,
      runtime_policy: runtimePolicy,
      diagnostics: proxyImport?.diagnostics ?? pipeline!.diagnostics,
      status: "live",
      validation_status: proxyImport ? "passed" : pipeline!.validationStatus,
      generation_status: proxyImport ? "completed" : pipeline!.generationStatus,
      generation_version: 1,
      protocol_version: "2024-11-05",
    };

    const insertResult = await db
      .from("mcp_servers")
      .insert(enrichedInsert)
      .select("*")
      .single();

    if (insertResult.error?.message.includes("Could not find") || insertResult.error?.message.includes("column")) {
      return NextResponse.json({
        error: "Astrail's runtime schema is out of date. No incomplete endpoint was created.",
        code: "schema_migration_required",
      }, { status: 503 });
    }

    const { data, error } = insertResult;
    if (error) throw new Error(error.message);
    createdServerId = data.id;

    if (proxyImport && bodyWithoutChallenge.mcpAuth) {
      const auth = bodyWithoutChallenge.mcpAuth;
      const { error: credentialError } = await db.from("api_credentials").insert({
        user_id: userData.user.id,
        server_id: data.id,
        name: "Imported MCP connection",
        provider: "remote_mcp",
        auth_scheme: auth.scheme,
        injection_name: auth.scheme === "bearer" ? null : auth.injectionName ?? (auth.scheme === "api_key_header" ? "x-api-key" : "api_key"),
        scopes: [],
        secret_ciphertext: encryptCredential(auth.secret),
        key_preview: previewSecret(auth.secret),
        updated_at: new Date().toISOString(),
      });
      if (credentialError) {
        await db.from("mcp_servers").delete().eq("id", data.id).eq("user_id", userData.user.id);
        throw new Error(`Could not store the imported MCP credential: ${credentialError.message}`);
      }
    }

    const hostedEndpoint = buildMcpEndpoint(data.id, requestUrl);

    const finalDiagnostics = withHostedEndpoint(proxyImport?.diagnostics ?? pipeline!.diagnostics, hostedEndpoint);

    const { data: updated, error: updateError } = await db
      .from("mcp_servers")
      .update({
        hosted_endpoint: hostedEndpoint,
        diagnostics: finalDiagnostics,
        status: "live",
        validation_status: "passed",
        generation_status: "completed",
        generation_version: 1,
        protocol_version: "2024-11-05",
      })
      .eq("id", data.id)
      .select("*")
      .single();

    if (updateError?.message.includes("Could not find") || updateError?.message.includes("column")) {
      const { data: fallbackUpdated, error: fallbackUpdateError } = await db
        .from("mcp_servers")
        .update({ hosted_endpoint: hostedEndpoint })
        .eq("id", data.id)
        .select("*")
        .single();

      if (fallbackUpdateError) throw new Error(fallbackUpdateError.message);

      createdServerId = null;
      return NextResponse.json({
        server: fallbackUpdated as McpServer,
        generated,
        diagnostics: finalDiagnostics,
      });
    }

    if (updateError) throw new Error(updateError.message);

    createdServerId = null;
    return NextResponse.json({
      server: updated as McpServer,
      generated,
      diagnostics: finalDiagnostics,
    });
  } catch (error) {
    let cleanupFailed = false;
    if (createdServerId) {
      try {
        const { error: cleanupError } = await (await createDataClient()).from("mcp_servers").delete().eq("id", createdServerId).eq("user_id", userData.user.id);
        cleanupFailed = Boolean(cleanupError);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) {
      return NextResponse.json({ error: "Endpoint creation failed and automatic cleanup could not complete." }, { status: 500 });
    }
    if (isHostedEndpointLimitError(error)) {
      const summary = await getBillingUsageSummary(userData.user.id);
      return NextResponse.json(hostedEndpointLimitPayload(summary), { status: 402 });
    }
    const message = error instanceof Error ? error.message : "Generation failed.";
    const rawDiagnostics = typeof error === "object" && error && "diagnostics" in error
      ? (error.diagnostics as string[])
      : [];
    const diagnostics = emptyDiagnostics(bodyForFailure?.sourceUrl ?? null);
    diagnostics.errors = [message];
    diagnostics.raw = rawDiagnostics;
    diagnostics.timestamps.failed_at = new Date().toISOString();
    diagnostics.trace = [
      {
        label: error instanceof Error && error.name === "SpecDiscoveryError"
          ? "No OpenAPI/Swagger spec found"
          : "Generation failed",
        status: "failed",
        detail: message,
      },
    ];
    try {
      if (bodyForFailure) {
        const db = await createDataClient();
        await db.from("mcp_servers").insert({
          user_id: userData.user.id,
          name: "Failed generation",
          description: message,
          source_url: bodyForFailure.sourceUrl ?? null,
          source_type: bodyForFailure.sourceType,
          generated_code: "",
          tools_json: [],
          diagnostics,
          status: "error",
          validation_status: error instanceof Error && error.name === "SpecDiscoveryError" ? "failed" : "pending",
          generation_status: "failed",
          generation_version: 1,
          protocol_version: "2024-11-05",
        });
      }
    } catch {
      // Older schemas may not have diagnostic/status columns. The API response remains the source of truth.
    }
    return NextResponse.json({ error: message, diagnostics }, { status: error instanceof Error && error.name === "SpecDiscoveryError" ? 422 : 400 });
  }
}
