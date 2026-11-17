import { NextResponse } from "next/server";
import { z } from "zod";
import { checkGenerationAllowance } from "@/lib/billing/usage";
import { runGenerationPipeline } from "@/lib/generation-pipeline";
import { carryOverToolConfiguration, diffToolSchemas, reconciliationPreview, suggestMappingsFromDiff } from "@/lib/runtime/schema-diff";
import { fingerprintEndpointMap } from "@/lib/schema-drift";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createDataClient, createServerNeonClient } from "@/lib/neon/server";
import type { McpServer, SourceType } from "@/lib/types";

export const runtime = "nodejs";

// Spec re-import: regenerate an existing hosted server from its updated source
// contract without minting a new server id or endpoint. The previous tool set
// is snapshotted, the change is diffed for humans, and owner-configured tool
// policies/visibility carry over so a re-import never silently loosens
// approval requirements.

const REIMPORTABLE_SOURCE_TYPES = new Set<SourceType | string>([
  "url",
  "openapi_url",
  "json_paste",
  "graphql_url",
  "graphql_sdl",
]);

const RAW_SPEC_SOURCE_TYPES = new Set<SourceType | string>(["json_paste", "graphql_sdl"]);

const ReimportRequestSchema = z.object({
  spec_raw: z.string().min(1).max(5_000_000).optional(),
  dry_run: z.boolean().optional(),
  approved: z.boolean().optional(),
  auto_apply: z.boolean().optional(),
  action: z.enum(["reconcile","rollback"]).optional(),
  version_id: z.string().uuid().optional(),
  overlay: z.unknown().optional(),
  curated_operation_ids: z.array(z.string().min(1).max(240)).max(500).optional(),
}).strict();

async function loadOwnedServer(id: string) {
  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };

  const db = await createDataClient();
  const { data, error } = await db
    .from("mcp_servers")
    .select("*")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .single();
  if (error || !data) return { error: NextResponse.json({ error: "Server not found." }, { status: 404 }) };
  return { server: data as McpServer, userId: userData.user.id, db };
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ error: "Schema version history requires persistent workspace storage." }, { status: 503 });
  }

  const loaded = await loadOwnedServer(params.id);
  if ("error" in loaded) return loaded.error;

  const { data, error } = await loaded.db
    .from("tool_schema_versions")
    .select("id,version,diff,tool_count,created_at")
    .eq("server_id", loaded.server.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    const migrationMissing = error.message.includes("tool_schema_versions") || error.message.includes("column");
    return NextResponse.json({
      versions: [],
      warning: migrationMissing
        ? "Run the integration-hardening Neon migration to enable schema version history."
        : "Could not load schema version history.",
    });
  }

  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!hasServerNeonEnv()) {
    return NextResponse.json({ error: "Spec re-import requires persistent workspace storage." }, { status: 503 });
  }

  const loaded = await loadOwnedServer(params.id);
  if ("error" in loaded) return loaded.error;
  const { server, userId, db } = loaded;

  const parsed = ReimportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid schema re-import request.", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if(body.action==="rollback"){
    if(!body.version_id)return NextResponse.json({error:"version_id is required for rollback."},{status:400});
    const snapshot=await db.from("tool_schema_versions").select("id,version,tools_json,endpoint_map,field_mappings,runtime_policy").eq("id",body.version_id).eq("server_id",server.id).eq("user_id",userId).maybeSingle();
    if(snapshot.error||!snapshot.data)return NextResponse.json({error:"Schema version not found."},{status:404});
    const fromVersion=Number(server.generation_version)||0;const toVersion=fromVersion+1;
    const restored=await db.from("mcp_servers").update({tools_json:snapshot.data.tools_json,endpoint_map:snapshot.data.endpoint_map,field_mappings:snapshot.data.field_mappings??server.field_mappings,runtime_policy:snapshot.data.runtime_policy??server.runtime_policy,generation_version:toVersion,schema_drift_detected:false}).eq("id",server.id).eq("user_id",userId).select("*").maybeSingle();
    if(restored.error||!restored.data)return NextResponse.json({error:"Rollback failed."},{status:409});
    const diff=diffToolSchemas(Array.isArray(server.tools_json)?server.tools_json:[],Array.isArray(snapshot.data.tools_json)?snapshot.data.tools_json:[]);
    await Promise.all([db.from("schema_reconciliation_events").insert({user_id:userId,server_id:server.id,decision:"rollback",classification:diff.classification,diff,from_version:fromVersion,to_version:toVersion,actor_id:userId}),db.from("owner_notifications").insert({user_id:userId,server_id:server.id,kind:"schema_rollback",title:`${server.name} rolled back`,message:`Restored schema snapshot ${snapshot.data.version}.`})]);
    return NextResponse.json({server:restored.data,rolled_back_to:snapshot.data.version,diff});
  }
  const sourceType = server.source_type ?? "";
  if (!REIMPORTABLE_SOURCE_TYPES.has(sourceType)) {
    return NextResponse.json({
      error: `Re-import is not supported for source type "${sourceType || "unknown"}". Supported: OpenAPI/Swagger URLs, GraphQL URLs, and raw spec pastes.`,
    }, { status: 400 });
  }
  if (RAW_SPEC_SOURCE_TYPES.has(sourceType) && !body.spec_raw) {
    return NextResponse.json({
      error: "This server was created from a pasted spec. Provide the updated spec in spec_raw to re-import.",
    }, { status: 400 });
  }
  if (!RAW_SPEC_SOURCE_TYPES.has(sourceType) && !server.source_url) {
    return NextResponse.json({ error: "This server has no stored source URL to re-import from." }, { status: 400 });
  }

  const generationAllowance = await checkGenerationAllowance(userId, sourceType);
  if (!generationAllowance.allowed) {
    return NextResponse.json({
      error: "Monthly MCP generation credits or limit reached.",
      billing: generationAllowance.summary,
    }, { status: 402 });
  }

  try {
    const pipeline = await runGenerationPipeline({
      sourceType: sourceType as SourceType,
      sourceUrl: server.source_url ?? undefined,
      rawJson: body.spec_raw,
      runtimePolicy: server.runtime_policy ?? undefined,
      overlay: body.overlay,
      curatedOperationIds: body.curated_operation_ids,
    });

    const previousTools = Array.isArray(server.tools_json) ? server.tools_json : [];
    const diff = diffToolSchemas(previousTools, pipeline.generated.tools);
    const nextTools = carryOverToolConfiguration(previousTools, pipeline.generated.tools);
    const preview=reconciliationPreview(previousTools,pipeline.generated.tools,server.field_mappings,server.endpoint_map??[],pipeline.endpointMap);
    const mappingSuggestions=suggestMappingsFromDiff(diff);

    if (body.dry_run) {
      return NextResponse.json({
        dry_run: true,
        diff,
        preview,
        mapping_suggestions: mappingSuggestions,
        tool_count: nextTools.length,
        note: "No changes were written. Re-run without dry_run to apply this re-import.",
      });
    }
    if(body.auto_apply===true&&(!diff.safe_to_auto_apply||preview.scopes.requires_review))return NextResponse.json({error:"Automatic reconciliation is limited to proven-safe additive changes without scope changes.",diff,preview,mapping_suggestions:mappingSuggestions},{status:409});
    if(body.approved!==true&&body.auto_apply!==true)return NextResponse.json({error:"Preview and explicitly approve this reconciliation before applying it.",diff,preview,mapping_suggestions:mappingSuggestions,approval_required:true},{status:409});

    const previousVersion = Number(server.generation_version);
    const snapshotVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
    const warnings: string[] = [];

    const snapshot = await db.from("tool_schema_versions").insert({
      server_id: server.id,
      user_id: userId,
      version: snapshotVersion,
      tools_json: previousTools,
      endpoint_map: server.endpoint_map ?? [],
      diff,
      tool_count: previousTools.length,
      field_mappings: server.field_mappings ?? null,
      runtime_policy: server.runtime_policy ?? null,
    });
    if (snapshot.error) {
      warnings.push("Previous tool schema snapshot was not stored (run the integration-hardening Neon migration to enable rollback history).");
    }

    const updatePayload = {
      name: pipeline.generated.name,
      description: pipeline.generated.description,
      generated_code: pipeline.generated.generated_code,
      tools_json: nextTools,
      endpoint_map: pipeline.endpointMap,
      diagnostics: pipeline.diagnostics,
      validation_status: pipeline.validationStatus,
      generation_status: pipeline.generationStatus,
      generation_version: snapshotVersion + 1,
      schema_fingerprint: fingerprintEndpointMap(pipeline.endpointMap),
      schema_checked_at: new Date().toISOString(),
      schema_drift_detected: false,
      openapi_overlay: body.overlay ?? null,
      curated_operation_ids: body.curated_operation_ids ?? [],
    };
    let updateResult = await db
      .from("mcp_servers")
      .update(updatePayload)
      .eq("id", server.id)
      .eq("user_id", userId)
      .eq("generation_version", server.generation_version ?? 1)
      .select("*")
      .maybeSingle();
    if (updateResult.error?.message.includes("column") || updateResult.error?.message.includes("Could not find")) {
      updateResult = await db
        .from("mcp_servers")
        .update({
          name: updatePayload.name,
          description: updatePayload.description,
          generated_code: updatePayload.generated_code,
          tools_json: updatePayload.tools_json,
          endpoint_map: updatePayload.endpoint_map,
          diagnostics: updatePayload.diagnostics,
          validation_status: updatePayload.validation_status,
          generation_status: updatePayload.generation_status,
          generation_version: updatePayload.generation_version,
        })
        .eq("id", server.id)
        .eq("user_id", userId)
        .eq("generation_version", server.generation_version ?? 1)
        .select("*")
        .maybeSingle();
    }
    if (updateResult.error || !updateResult.data) {
      return NextResponse.json({ error: "Could not apply the re-import because the integration changed concurrently or storage is unavailable." }, { status: updateResult.error ? 400 : 409 });
    }
    await Promise.all([db.from("schema_reconciliation_events").insert({user_id:userId,server_id:server.id,decision:body.auto_apply?"auto_apply":"approved_apply",classification:diff.classification,diff,from_version:snapshotVersion,to_version:snapshotVersion+1,actor_id:userId}),db.from("owner_notifications").insert({user_id:userId,server_id:server.id,kind:"schema_reconciliation",title:`${server.name} schema reconciled`,message:`${diff.classification}: ${diff.summary}`})]);

    return NextResponse.json({
      server: updateResult.data as McpServer,
      diff,
      preview,
      snapshot_version: snapshot.error ? null : snapshotVersion,
      carried_over: {
        policies: true,
        visibility: true,
        note: "Per-tool policies, visibility, and metadata were preserved for tools that still exist in the new contract.",
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-import failed.";
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.name === "SpecDiscoveryError" ? 422 : 400 });
  }
}
