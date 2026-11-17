import "server-only";

import { getDashboardSessionUser } from "@/lib/dashboard-session";
import { localDemoLogs, localDemoServers } from "@/lib/local-demo";
import { hasServerNeonEnv } from "@/lib/neon/env";
import { createUserDataClient } from "@/lib/neon/server";
import type { McpServer, RuntimeLog } from "@/lib/types";
import { resolveMcpEndpoint } from "@/lib/urls";

export type CredentialSummary = {
  id: string;
  server_id: string | null;
  name: string;
  provider: string | null;
  security_scheme?: string | null;
  auth_scheme: string;
  injection_name: string | null;
  scopes: string[] | null;
  key_preview: string;
  expires_at?: string | null;
  connect_status?: string | null;
  revocation_url?: string | null;
  revocation_status?: string | null;
  revocation_error?: string | null;
  revocation_attempted_at?: string | null;
  end_user_id?: string | null;
  health_status?: string | null;
  health_checked_at?: string | null;
  expected_scopes?: string[] | null;
  consecutive_refresh_failures?: number | null;
  last_refresh_status?: string | null;
  last_refresh_at?: string | null;
  last_refresh_error?: string | null;
  reconnect_reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApprovalSummary = {
  id: string;
  server_id: string;
  tool_name: string;
  status: string;
  expires_at: string;
  created_at: string;
};

export type DashboardControlPlane = {
  servers: McpServer[];
  credentials: CredentialSummary[];
  logs: RuntimeLog[];
  approvals: ApprovalSummary[];
  warnings: string[];
  preview: boolean;
};

export async function loadDashboardControlPlane(): Promise<DashboardControlPlane> {
  if (!hasServerNeonEnv()) {
    return {
      servers: localDemoServers(),
      credentials: [],
      logs: localDemoLogs(),
      approvals: [],
      warnings: ["Credential and approval rows appear after workspace storage is connected."],
      preview: true,
    };
  }

  const user = await getDashboardSessionUser();
  // These are user-owned dashboard reads. Use the signed-in user's JWT so
  // Postgres RLS is the authorization boundary; never sign in as the runtime
  // service identity merely to render a page.
  const admin = createUserDataClient();
  const [serversResult, initialCredentialsResult, logsResult, approvalsResult] = await Promise.all([
    admin.from("mcp_servers").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("api_credentials")
      .select("id,server_id,name,provider,security_scheme,auth_scheme,injection_name,scopes,expected_scopes,key_preview,expires_at,connect_status,end_user_id,revocation_url,revocation_status,revocation_error,revocation_attempted_at,health_status,health_checked_at,consecutive_refresh_failures,last_refresh_status,last_refresh_at,last_refresh_error,reconnect_reason,created_at,updated_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }),
    admin.from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,end_user_id,actor_role,api_key_id,api_key_name,api_key_preview,client_name,credential_refs,bundle_id,arguments_redacted,summary,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100),
    admin.from("tool_approval_requests")
      .select("id,server_id,tool_name,status,expires_at,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
  ]);
  let credentialsResult: { data: unknown[] | null; error: { message: string } | null } = initialCredentialsResult;
  if (credentialsResult.error?.message.includes("column")) {
    credentialsResult = await admin.from("api_credentials")
      .select("id,server_id,name,provider,security_scheme,auth_scheme,injection_name,scopes,key_preview,expires_at,connect_status,end_user_id,created_at,updated_at")
      .eq("user_id", user.id).order("created_at", { ascending: false });
  }
  if (credentialsResult.error?.message.includes("column")) {
    credentialsResult = await admin.from("api_credentials")
      .select("id,server_id,name,provider,auth_scheme,injection_name,scopes,key_preview,created_at,updated_at")
      .eq("user_id", user.id).order("created_at", { ascending: false });
  }
  let completeLogsResult: { data: unknown[] | null; error: { message: string } | null } = logsResult;
  if (completeLogsResult.error?.message.includes("column")) {
    completeLogsResult = await admin.from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,end_user_id,actor_role,arguments_redacted,summary,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  }
  if (completeLogsResult.error?.message.includes("column")) {
    completeLogsResult = await admin.from("tool_call_logs")
      .select("id,server_id,user_id,tool_name,status,method,path,execution_mode,upstream_status,trace_id,attempt_count,error_code,error,latency_ms,created_at")
      .eq("user_id", user.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  }

  const warnings = [
    serversResult.error ? `Integrations: ${serversResult.error.message}` : null,
    credentialsResult.error ? `Connections: ${credentialsResult.error.message}` : null,
    completeLogsResult.error ? `Activity: ${completeLogsResult.error.message}` : null,
    approvalsResult.error ? `Approvals: ${approvalsResult.error.message}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    servers: ((serversResult.data ?? []) as McpServer[]).map((server) => ({
      ...server,
      hosted_endpoint: resolveMcpEndpoint(server.id, server.hosted_endpoint),
    })),
    credentials: (credentialsResult.data ?? []) as CredentialSummary[],
    logs: (completeLogsResult.data ?? []) as RuntimeLog[],
    approvals: (approvalsResult.data ?? []) as ApprovalSummary[],
    warnings,
    preview: false,
  };
}

export function controlPlaneStats(data: DashboardControlPlane) {
  const tools = data.servers.flatMap((server) => server.tools_json ?? []);
  return {
    integrations: data.servers.length,
    liveIntegrations: data.servers.filter((server) => server.status === "live" || server.status === "preset").length,
    connections: data.credentials.length,
    tools: tools.length,
    allow: tools.filter((tool) => (tool.policy ?? "allow") === "allow").length,
    approval: tools.filter((tool) => tool.policy === "approval").length,
    block: tools.filter((tool) => tool.policy === "block").length,
    pendingApprovals: data.approvals.filter((approval) => approval.status === "pending").length,
  };
}
