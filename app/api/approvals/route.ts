import { NextResponse } from "next/server";
import { listLocalToolApprovals } from "@/lib/runtime/tool-approvals";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createServerNeonClient, createUserDataClient } from "@/lib/neon/server";

export const runtime = "nodejs";

export async function GET() {
  if (!hasServerNeonEnv()) return NextResponse.json({ approvals: listLocalToolApprovals(), preview: true });

  const neon = await createServerNeonClient();
  const { data: userData } = await neon.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createUserDataClient();
  await admin.from("tool_approval_requests").update({ status: "expired" })
    .eq("user_id", userData.user.id).eq("status", "pending").lt("expires_at", new Date().toISOString());
  const { data, error } = await admin.from("tool_approval_requests")
    .select("id,server_id,user_id,tool_name,arguments_redacted,status,expires_at,decided_at,decided_by,decision_reason,execution_claim_id,executed_at,created_at,agent_id,task_authorization_id,authorization_decision")
    .eq("user_id", userData.user.id).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}
