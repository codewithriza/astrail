import { createHash, randomBytes } from "node:crypto";
import type { McpActionLevel, McpTool, OpenApiEndpoint, RuntimePermissionPolicy } from "@/lib/types";
import { endpointActionClass, evaluateRuntimePermission } from "./permissions";
import { oauthRequiredScopes } from "./oauth-security";

export type AgentPolicy = { allowed_tools?: string[]; allowed_actions?: McpActionLevel[]; allowed_resources?: string[]; allowed_scopes?: string[] };
export type TaskAuthorization = AgentPolicy & { id: string; agent_id: string; purpose: string; issuer: string; nonce: string; approval_actions?: McpActionLevel[]; expires_at: string };
export type AuthorizationDimension = { name: string; allowed: boolean; constraint?: string; required?: string[]; granted?: string[] };
export type ComposableDecision = { allowed: boolean; requiresApproval: boolean; action: McpActionLevel; resource: string | null; requiredScopes: string[]; dimensions: AuthorizationDimension[]; missing: string[] };

function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function resourceFor(endpoint: OpenApiEndpoint) { return endpoint.resource ?? endpoint.tags?.[0] ?? endpoint.path ?? null; }
function permits(allowed: string[] | undefined, value: string | null) { return !allowed?.length || Boolean(value && allowed.includes(value)); }

export function createTaskToken() { return `atask_${randomBytes(32).toString("base64url")}`; }
export function hashTaskToken(token: string) { return createHash("sha256").update(token).digest("hex"); }

export function evaluateComposableAuthorization(input: {
  tool: McpTool; endpoint: OpenApiEndpoint; serverPolicy?: RuntimePermissionPolicy | null;
  actorRole?: string | null; agentId: string | null; agentPolicy?: AgentPolicy | null;
  task: TaskAuthorization | null; providerScopes?: unknown; now?: number;
}): ComposableDecision {
  const action = endpointActionClass(input.endpoint, input.tool);
  const resource = resourceFor(input.endpoint);
  const requiredScopes = oauthRequiredScopes(input.endpoint);
  // Credential loading performs the authoritative encrypted-grant scope check
  // immediately before execution. Undefined means that check is delegated;
  // an explicit scope array is evaluated here (useful in tests and previews).
  const providerScopes = input.providerScopes === undefined ? requiredScopes : list(input.providerScopes);
  const missingProviderScopes = requiredScopes.filter((scope) => !providerScopes.includes(scope));
  const task = input.task;
  const dimensions: AuthorizationDimension[] = [];
  const runtime = evaluateRuntimePermission(input.serverPolicy, input.endpoint, input.tool, { actorRole: input.actorRole, actionLevel: action });
  const runtimeConstraint = "reason" in runtime ? runtime.reason : undefined;
  dimensions.push({ name: "server_policy", allowed: runtime.allowed, constraint: runtimeConstraint });
  dimensions.push({ name: "trusted_agent", allowed: Boolean(input.agentId), constraint: input.agentId ? undefined : "API key has no trusted agent_id binding." });
  const ap = input.agentPolicy ?? {};
  const agentAllowed = Boolean(input.agentId) && permits(ap.allowed_tools, input.tool.name) && permits(ap.allowed_actions, action) && permits(ap.allowed_resources, resource) && requiredScopes.every((scope) => !ap.allowed_scopes?.length || ap.allowed_scopes.includes(scope));
  dimensions.push({ name: "agent_policy", allowed: agentAllowed, required: [input.tool.name, action, ...(resource ? [resource] : []), ...requiredScopes] });
  const taskLive = Boolean(task && Date.parse(task.expires_at) > (input.now ?? Date.now()) && task.agent_id === input.agentId);
  const taskAllowed = taskLive && permits(task?.allowed_tools, input.tool.name) && permits(task?.allowed_actions, action) && permits(task?.allowed_resources, resource) && requiredScopes.every((scope) => !task?.allowed_scopes?.length || task.allowed_scopes.includes(scope));
  dimensions.push({ name: "task_authorization", allowed: taskAllowed, constraint: taskLive ? undefined : "Task token is missing, expired, or bound to another agent." });
  dimensions.push({ name: "provider_grant", allowed: missingProviderScopes.length === 0, required: requiredScopes, granted: providerScopes, constraint: missingProviderScopes.length ? `Missing provider scopes: ${missingProviderScopes.join(", ")}` : undefined });
  const requiresApproval = Boolean(taskAllowed && task?.approval_actions?.includes(action));
  const missing = dimensions.filter((item) => !item.allowed).map((item) => `${item.name}: ${item.constraint ?? "constraint not satisfied"}`);
  return { allowed: missing.length === 0, requiresApproval, action, resource, requiredScopes, dimensions, missing };
}
