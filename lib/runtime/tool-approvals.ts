import { randomUUID } from "node:crypto";
import { decryptCredential, encryptCredential, hasCredentialEncryptionKey } from "../credentials";
import { createAdminClient, hasServiceRoleKey } from "../neon/server";
import type { McpServer, McpTool } from "../types";
import { redactSensitive } from "./permissions";

export type ToolApprovalStatus = "pending" | "approved" | "executing" | "denied" | "executed" | "expired";

export type ToolApprovalRequest = {
  id: string;
  server_id: string;
  user_id: string;
  tool_name: string;
  arguments_redacted: Record<string, unknown>;
  status: ToolApprovalStatus;
  expires_at: string;
  decided_at: string | null;
  executed_at: string | null;
  created_at: string;
  agent_id?: string | null;
  task_authorization_id?: string | null;
  authorization_decision?: unknown;
  decided_by?: string | null;
  decision_reason?: string | null;
  execution_claim_id?: string | null;
};

type LocalApprovalRequest = ToolApprovalRequest & { arguments: Record<string, unknown> };

const globalApprovals = globalThis as typeof globalThis & {
  __astrailToolApprovals?: Map<string, LocalApprovalRequest>;
};
const localApprovals = globalApprovals.__astrailToolApprovals ?? new Map<string, LocalApprovalRequest>();
globalApprovals.__astrailToolApprovals = localApprovals;

function isLocalServer(server: McpServer) {
  return server.user_id === "local-demo-user" || server.user_id === "local-preview" || server.user_id === "preset";
}

function expiryDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function publicRequest(request: LocalApprovalRequest): ToolApprovalRequest {
  const { arguments: _arguments, ...safe } = request;
  return safe;
}

export async function createToolApprovalRequest(server: McpServer, tool: McpTool, args: Record<string, unknown>, authorization?: { agentId?: string | null; taskAuthorizationId?: string | null; decision?: unknown }) {
  const request: LocalApprovalRequest = {
    id: randomUUID(),
    server_id: server.id,
    user_id: server.user_id,
    tool_name: tool.name,
    arguments: args,
    arguments_redacted: redactSensitive(args),
    status: "pending",
    expires_at: expiryDate(),
    decided_at: null,
    executed_at: null,
    created_at: new Date().toISOString(),
    agent_id: authorization?.agentId ?? null,
    task_authorization_id: authorization?.taskAuthorizationId ?? null,
    authorization_decision: authorization?.decision ?? null,
    decided_by: null,
    decision_reason: null,
    execution_claim_id: null,
  };

  if (isLocalServer(server)) {
    localApprovals.set(request.id, request);
    return publicRequest(request);
  }
  if (!hasServiceRoleKey() || !hasCredentialEncryptionKey()) {
    throw new Error("Approval storage requires the service role and CREDENTIAL_ENCRYPTION_KEY.");
  }

  const { data, error } = await createAdminClient()
    .from("tool_approval_requests")
    .insert({
      id: request.id,
      server_id: request.server_id,
      user_id: request.user_id,
      tool_name: request.tool_name,
      arguments_ciphertext: encryptCredential(JSON.stringify(args)),
      arguments_redacted: request.arguments_redacted,
      status: request.status,
      expires_at: request.expires_at,
      agent_id: request.agent_id,
      task_authorization_id: request.task_authorization_id,
      authorization_decision: request.authorization_decision,
    })
    .select("id,server_id,user_id,tool_name,arguments_redacted,status,expires_at,decided_at,decided_by,decision_reason,execution_claim_id,executed_at,created_at,agent_id,task_authorization_id,authorization_decision")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create approval request.");
  return data as ToolApprovalRequest;
}

export type ApprovalLoadResult =
  | { ok: true; request: ToolApprovalRequest; arguments: Record<string, unknown> }
  | { ok: false; code: "approval_not_found" | "approval_pending" | "approval_denied" | "approval_expired" | "approval_already_executed" | "approval_storage_unavailable" };

export async function loadApprovedToolRequest(server: McpServer, executionId: string): Promise<ApprovalLoadResult> {
  if (isLocalServer(server)) {
    const request = localApprovals.get(executionId);
    if (!request || request.server_id !== server.id || request.user_id !== server.user_id) return { ok: false, code: "approval_not_found" };
    if (Date.parse(request.expires_at) <= Date.now()) {
      request.status = "expired";
      return { ok: false, code: "approval_expired" };
    }
    if (request.status === "pending") return { ok: false, code: "approval_pending" };
    if (request.status === "denied") return { ok: false, code: "approval_denied" };
    if (request.status === "executing" || request.status === "executed") return { ok: false, code: "approval_already_executed" };
    if (request.status !== "approved") return { ok: false, code: "approval_not_found" };
    request.status = "executing";
    request.execution_claim_id = randomUUID();
    return { ok: true, request: publicRequest(request), arguments: request.arguments };
  }

  if (!hasServiceRoleKey() || !hasCredentialEncryptionKey()) return { ok: false, code: "approval_storage_unavailable" };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tool_approval_requests")
    .select("id,server_id,user_id,tool_name,arguments_ciphertext,arguments_redacted,status,expires_at,decided_at,decided_by,decision_reason,execution_claim_id,executed_at,created_at,agent_id,task_authorization_id,authorization_decision")
    .eq("id", executionId)
    .eq("server_id", server.id)
    .eq("user_id", server.user_id)
    .maybeSingle();
  if (error || !data) return { ok: false, code: "approval_not_found" };
  if (Date.parse(data.expires_at) <= Date.now()) {
    await createAdminClient().from("tool_approval_requests").update({ status: "expired" }).eq("id", executionId);
    return { ok: false, code: "approval_expired" };
  }
  if (data.status === "pending") return { ok: false, code: "approval_pending" };
  if (data.status === "denied") return { ok: false, code: "approval_denied" };
  if (data.status === "executing" || data.status === "executed") return { ok: false, code: "approval_already_executed" };
  if (data.status !== "approved") return { ok: false, code: "approval_not_found" };

  // Claim the approval before decrypting or executing it. The status predicate makes
  // concurrent resume attempts one-shot even when they land on different instances.
  const { data: claimed, error: claimError } = await admin
    .from("tool_approval_requests")
    .update({ status: "executing", execution_claim_id: randomUUID() })
    .eq("id", executionId)
    .eq("server_id", server.id)
    .eq("user_id", server.user_id)
    .eq("status", "approved")
    .select("id,server_id,user_id,tool_name,arguments_ciphertext,arguments_redacted,status,expires_at,decided_at,decided_by,decision_reason,execution_claim_id,executed_at,created_at,agent_id,task_authorization_id,authorization_decision")
    .maybeSingle();
  if (claimError || !claimed) return { ok: false, code: "approval_already_executed" };
  try {
    const args = JSON.parse(decryptCredential(claimed.arguments_ciphertext)) as unknown;
    if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, code: "approval_storage_unavailable" };
    const { arguments_ciphertext: _ciphertext, ...request } = claimed;
    return { ok: true, request: request as ToolApprovalRequest, arguments: args as Record<string, unknown> };
  } catch {
    return { ok: false, code: "approval_storage_unavailable" };
  }
}

export async function markToolApprovalExecuted(server: McpServer, executionId: string) {
  if (isLocalServer(server)) {
    const request = localApprovals.get(executionId);
    if (request) {
      request.status = "executed";
      request.executed_at = new Date().toISOString();
    }
    return;
  }
  if (!hasServiceRoleKey()) return;
  await createAdminClient()
    .from("tool_approval_requests")
    .update({ status: "executed", executed_at: new Date().toISOString() })
    .eq("id", executionId)
    .eq("server_id", server.id)
    .eq("user_id", server.user_id)
    .eq("status", "executing");
}

export function decideLocalToolApproval(userId: string, executionId: string, decision: "approved" | "denied", reason?: string | null) {
  const request = localApprovals.get(executionId);
  if (!request || request.user_id !== userId || request.status !== "pending") return null;
  request.status = decision;
  request.decided_at = new Date().toISOString();
  request.decided_by = userId;
  request.decision_reason = reason ?? null;
  return publicRequest(request);
}

export function listLocalToolApprovals(userId?: string) {
  return Array.from(localApprovals.values())
    .filter((request) => !userId || request.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(publicRequest);
}
