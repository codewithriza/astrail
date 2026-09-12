import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { loadSpec } from "@/lib/generate-mcp";
import { normalizeOpenApiSpec } from "@/lib/openapi";
import { fingerprintEndpointMap, schemaSummaryHasChanges, summarizeSchemaChanges } from "@/lib/schema-drift";
import { createAdminClient, hasServiceRoleKey } from "@/lib/neon/server";
import type { McpServer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.ASTRAIL_SCHEMA_WATCH_SECRET ?? process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!hasServiceRoleKey()) return NextResponse.json({ error: "Workspace storage is unavailable." }, { status: 503 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("mcp_servers")
    .select("id,user_id,source_url,source_type,endpoint_map,schema_fingerprint,generation_version")
    .in("source_type", ["url", "openapi_url"])
    .not("source_url", "is", null)
    .order("schema_checked_at", { ascending: true, nullsFirst: true })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const result = { checked: 0, drifted: 0, failed: 0 };
  const checkServer = async (row: (typeof rows)[number]) => {
    const server = row as Pick<McpServer, "id" | "user_id" | "source_url" | "source_type" | "endpoint_map" | "schema_fingerprint" | "generation_version">;
    try {
      const spec = await loadSpec({ sourceType: "openapi_url", sourceUrl: server.source_url ?? undefined });
      const { endpoints } = normalizeOpenApiSpec(spec);
      const fingerprint = fingerprintEndpointMap(endpoints);
      const summary = summarizeSchemaChanges(server.endpoint_map ?? [], endpoints);
      const changed = Boolean(server.schema_fingerprint && server.schema_fingerprint !== fingerprint) || schemaSummaryHasChanges(summary);
      const now = new Date().toISOString();
      const versionWrite = await admin.from("integration_schema_versions").upsert({
        user_id: server.user_id, server_id: server.id, fingerprint, endpoint_count: endpoints.length,
        change_summary: summary, detected_at: now,
      }, { onConflict: "server_id,fingerprint", ignoreDuplicates: true });
      if (versionWrite.error) throw new Error("Could not persist schema version.");
      let serverWriteQuery = admin.from("mcp_servers").update({ schema_fingerprint: fingerprint, schema_checked_at: now, schema_drift_detected: changed })
        .eq("id", server.id).eq("user_id", server.user_id).eq("generation_version", server.generation_version ?? 1);
      serverWriteQuery = server.schema_fingerprint
        ? serverWriteQuery.eq("schema_fingerprint", server.schema_fingerprint)
        : serverWriteQuery.is("schema_fingerprint", null);
      const serverWrite = await serverWriteQuery.select("id").maybeSingle();
      if (serverWrite.error || !serverWrite.data) throw new Error("Could not persist schema status because the integration changed concurrently.");
      result.checked += 1;
      if (changed) result.drifted += 1;
    } catch {
      // Advance the attempt timestamp even when the source is unavailable so a
      // permanently broken integration cannot starve the rest of the queue.
      await admin.from("mcp_servers").update({ schema_checked_at: new Date().toISOString() })
        .eq("id", server.id).eq("user_id", server.user_id);
      result.failed += 1;
    }
  };
  // Keep memory bounded: at most two OpenAPI documents are loaded at once.
  for (let index = 0; index < rows.length; index += 2) {
    await Promise.all(rows.slice(index, index + 2).map(checkServer));
  }
  const status = rows.length > 0 && result.failed === rows.length ? 502 : result.failed > 0 ? 207 : 200;
  return NextResponse.json(result, { status });
}
