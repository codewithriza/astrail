import { NextResponse } from "next/server";
import { z } from "zod";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createAdminClient, createServerNeonClient, hasServiceRoleKey } from "@/lib/neon/server";
import { createAuditExportManifest } from "@/lib/audit-integrity";

const QuerySchema = z.object({
  q: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9@._:/ -]+$/).optional(),
  server_id: z.string().uuid().optional(),
  status: z.string().min(1).max(80).optional(),
  end_user_id: z.string().min(1).max(256).optional(),
  api_key_id: z.string().uuid().optional(),
  client_name: z.string().min(1).max(120).optional(),
  credential_id: z.string().uuid().optional(),
  tool_name: z.string().min(1).max(240).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  format: z.enum(["csv", "json"]).default("csv"),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
  before: z.string().datetime().optional(),
  before_id: z.string().uuid().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.before) !== Boolean(value.before_id)) {
    context.addIssue({ code: "custom", path: ["before"], message: "before and before_id must be provided together." });
  }
});

function csvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const text = /^\s*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (!hasServerNeonEnv() || !hasServiceRoleKey()) return NextResponse.json({ error: "Audit export requires workspace storage." }, { status: 503 });
  const { data: userData } = await (await createServerNeonClient()).auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid audit export query.", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  let query = createAdminClient().from("tool_call_logs")
    .select("id,server_id,bundle_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,end_user_id,actor_role,agent_id,task_authorization_id,task_id,purpose,authorization_decision,affected_resources,effective_scopes,policy_result,provider_result,approval_id,approval_actor_id,approval_decision,approval_decided_at,approval_reason,execution_claim_id,evidence_sequence,previous_event_hash,event_hash,storage_status,api_key_id,api_key_name,api_key_preview,client_name,credential_refs,arguments_redacted,summary,created_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);
  if (input.server_id) query = query.eq("server_id", input.server_id);
  if (input.q) {
    const pattern = `%${input.q}%`;
    const scalarSearch = ["summary", "end_user_id", "actor_role", "api_key_name", "client_name", "tool_name", "trace_id"]
      .map((column) => `${column}.ilike.${pattern}`);
    const credentialSearch = z.string().uuid().safeParse(input.q).success
      ? [`credential_refs.cs.[{"id":"${input.q}"}]`]
      : [];
    query = query.or([...scalarSearch, ...credentialSearch].join(","));
  }
  if (input.status) query = query.eq("status", input.status);
  if (input.end_user_id) query = query.eq("end_user_id", input.end_user_id);
  if (input.api_key_id) query = query.eq("api_key_id", input.api_key_id);
  if (input.client_name) query = query.eq("client_name", input.client_name);
  if (input.credential_id) query = query.contains("credential_refs", [{ id: input.credential_id }]);
  if (input.tool_name) query = query.eq("tool_name", input.tool_name);
  if (input.from) query = query.gte("created_at", input.from);
  if (input.to) query = query.lte("created_at", input.to);
  if (input.before && input.before_id) {
    query = query.or(`created_at.lt.${input.before},and(created_at.eq.${input.before},id.lt.${input.before_id})`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const hasMore = (data ?? []).length > input.limit;
  const rows = (data ?? []).slice(0, input.limit);
  const nextRow = hasMore ? rows.at(-1) : null;
  const nextBefore = nextRow?.created_at ?? null;
  const nextBeforeId = nextRow?.id ?? null;
  const filename = `astrail-audit-${new Date().toISOString().slice(0, 10)}.${input.format}`;
  const exportedAt = new Date().toISOString();
  const integrity = createAuditExportManifest(rows, { userId: userData.user.id, exportedAt, filters: input });
  if (input.format === "json") {
    return new NextResponse(JSON.stringify({ exported_at: exportedAt, rows, integrity, has_more: hasMore, next_before: nextBefore, next_before_id: nextBeforeId }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
    });
  }
  const columns = ["created_at", "server_id", "bundle_id", "end_user_id", "actor_role", "agent_id", "task_authorization_id", "task_id", "purpose", "authorization_decision", "affected_resources", "effective_scopes", "policy_result", "provider_result", "approval_id", "approval_actor_id", "approval_decision", "approval_decided_at", "approval_reason", "execution_claim_id", "evidence_sequence", "previous_event_hash", "event_hash", "storage_status", "api_key_id", "api_key_name", "api_key_preview", "client_name", "tool_name", "credential_refs", "status", "method", "path", "execution_mode", "upstream_status", "trace_id", "attempt_count", "error_code", "error", "latency_ms", "arguments_redacted", "summary"] as const;
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(
    typeof row[column] === "object" && row[column] !== null ? JSON.stringify(row[column]) : row[column]
  )).join(","))].join("\n");
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "x-astrail-has-more": String(hasMore),
      ...(nextBefore ? { "x-astrail-next-before": nextBefore } : {}),
      ...(nextBeforeId ? { "x-astrail-next-before-id": nextBeforeId } : {}),
      "x-astrail-export-digest": integrity.manifest.rows_sha256,
      "x-astrail-export-signature": integrity.signature ?? "unsigned",
      "x-astrail-signature-status": integrity.manifest.signature_status,
    },
  });
}
