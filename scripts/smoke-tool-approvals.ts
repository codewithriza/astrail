import { defaultToolPolicy } from "../lib/agent-tool-profile";
import {
  createToolApprovalRequest,
  decideLocalToolApproval,
  loadApprovedToolRequest,
  markToolApprovalExecuted,
} from "../lib/runtime/tool-approvals";
import type { McpServer, McpTool } from "../lib/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const tool: McpTool = {
    name: "send_payment",
    description: "Send a payment.",
    method: "POST",
    path: "/payments",
    input_schema: { type: "object", properties: { amount: { type: "number" }, access_token: { type: "string" } } },
    policy: "approval",
  };
  const server: McpServer = {
    id: "approval-smoke-server",
    user_id: "local-preview",
    name: "Approval smoke",
    description: "Local approval fixture.",
    source_url: "https://example.com/openapi.json",
    source_type: "openapi_url",
    generated_code: null,
    tools_json: [tool],
    endpoint_map: [],
    is_public: false,
    hosted_endpoint: "/api/mcp/approval-smoke-server",
    call_count: 0,
    created_at: new Date().toISOString(),
  };

  assert(defaultToolPolicy({ method: "GET" }) === "allow", "GET should default to allow.");
  assert(defaultToolPolicy({ method: "POST" }) === "approval", "Writes should default to approval.");
  assert(defaultToolPolicy({ method: "DELETE" }) === "block", "Deletes should default to block.");

  const approval = await createToolApprovalRequest(server, tool, { amount: 42, access_token: "top-secret-token" });
  assert(approval.status === "pending", "Expected pending approval.");
  assert(approval.arguments_redacted.access_token === "[redacted]", "Approval preview must redact sensitive arguments.");

  const pending = await loadApprovedToolRequest(server, approval.id);
  assert(!pending.ok && pending.code === "approval_pending", "Pending approval must not execute.");
  const decided = decideLocalToolApproval(server.user_id, approval.id, "approved");
  assert(decided?.status === "approved", "Expected approved decision.");

  const loaded = await loadApprovedToolRequest(server, approval.id);
  assert(loaded.ok && loaded.arguments.amount === 42, "Approved execution must restore original encrypted arguments.");
  const concurrentClaim = await loadApprovedToolRequest(server, approval.id);
  assert(!concurrentClaim.ok && concurrentClaim.code === "approval_already_executed", "An approval must be atomically claimed before upstream execution.");
  await markToolApprovalExecuted(server, approval.id);
  const replay = await loadApprovedToolRequest(server, approval.id);
  assert(!replay.ok && replay.code === "approval_already_executed", "Approved execution must be one-time.");

  console.log("PASS: per-tool policy defaults and one-time approval state machine.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
