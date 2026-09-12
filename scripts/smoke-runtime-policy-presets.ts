import { evaluateRuntimePermission } from "../lib/runtime/permissions";
import type { McpTool, OpenApiEndpoint, RuntimePermissionPolicy } from "../lib/types";

const guardedPolicy: RuntimePermissionPolicy = {
  allow_http_gets: true,
  blocked_methods: [
    { match: "http_method", pattern: "DELETE" },
    { match: "operation_id", pattern: "delete|remove|destroy|purge|erase|void|refund", regex: true },
    { match: "tool_name", pattern: "delete|remove|destroy|purge|erase|void|refund", regex: true },
  ],
};

const readOnlyPolicy: RuntimePermissionPolicy = {
  allow_http_gets: true,
  read_only: true,
};

function endpoint(overrides: Partial<OpenApiEndpoint>): OpenApiEndpoint {
  return {
    method: "GET",
    path: "/items",
    operation_id: "listItems",
    summary: null,
    description: null,
    operation_kind: "read",
    ...overrides,
  };
}

function tool(overrides: Partial<McpTool>): McpTool {
  return {
    name: "listItems",
    description: "List items.",
    ...overrides,
  };
}

function assertAllowed(label: string, policy: RuntimePermissionPolicy | null, apiEndpoint: OpenApiEndpoint, mcpTool: McpTool) {
  const decision = evaluateRuntimePermission(policy, apiEndpoint, mcpTool);
  if (decision.allowed === false) {
    throw new Error(`${label}: expected allowed, received ${decision.reason}`);
  }
}

function assertDenied(label: string, policy: RuntimePermissionPolicy, apiEndpoint: OpenApiEndpoint, mcpTool: McpTool) {
  const decision = evaluateRuntimePermission(policy, apiEndpoint, mcpTool);
  if (decision.allowed) {
    throw new Error(`${label}: expected denial.`);
  }
}

const listEndpoint = endpoint({});
const listTool = tool({});
const deleteEndpoint = endpoint({
  method: "DELETE",
  path: "/items/{id}",
  operation_id: "deleteItem",
  operation_kind: "destructive",
});
const deleteTool = tool({ name: "deleteItem" });
const postEndpoint = endpoint({
  method: "POST",
  path: "/items",
  operation_id: "createItem",
  operation_kind: "write",
});
const postTool = tool({ name: "createItem" });

assertAllowed("guarded allows reads", guardedPolicy, listEndpoint, listTool);
assertDenied("guarded blocks delete method", guardedPolicy, deleteEndpoint, deleteTool);
assertDenied("guarded blocks destructive operation name", guardedPolicy, { ...deleteEndpoint, method: "POST" }, deleteTool);
assertAllowed("guarded allows non-destructive writes", guardedPolicy, postEndpoint, postTool);

assertAllowed("read-only allows reads", readOnlyPolicy, listEndpoint, listTool);
assertDenied("read-only blocks writes", readOnlyPolicy, postEndpoint, postTool);
assertDenied("read-only blocks deletes", readOnlyPolicy, deleteEndpoint, deleteTool);

assertAllowed("open policy allows delete", null, deleteEndpoint, deleteTool);

console.log("Runtime policy preset smoke passed.");
