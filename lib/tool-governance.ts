import { toolActionLevel } from "./agent-tool-profile";
import type { McpActionLevel, McpTool, McpToolPolicy } from "./types";

export type ToolGovernanceAssessment = {
  actionLevel: McpActionLevel;
  riskScore: number;
  recommendedPolicy: McpToolPolicy;
  recommendedEnabled: boolean;
  reasons: string[];
  contextComplete: boolean;
};

const POLICY_BY_ACTION: Record<McpActionLevel, McpToolPolicy> = {
  read: "allow",
  draft: "allow",
  write: "approval",
  send: "approval",
  destructive: "block",
};

const SCORE_BY_ACTION: Record<McpActionLevel, number> = {
  read: 10,
  draft: 25,
  write: 55,
  send: 75,
  destructive: 95,
};

function cleanContext(value: unknown, maxLength = 1200) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function assessToolGovernance(tool: McpTool): ToolGovernanceAssessment {
  const actionLevel = toolActionLevel(tool);
  const requiresAuth = Boolean(tool.x_astrail?.requires_auth);
  const complex = Boolean(tool.x_astrail?.complexity?.compressed || (tool.x_astrail?.complexity?.parameter_count ?? 0) > 10);
  const hasBusinessContext = cleanContext(tool.x_astrail?.business_context).length >= 12;
  const hasUsageBoundary = cleanContext(tool.x_astrail?.use_when).length >= 8 && cleanContext(tool.x_astrail?.avoid_when).length >= 8;
  const contextComplete = hasBusinessContext && hasUsageBoundary;
  const reasons: string[] = [];

  if (actionLevel === "destructive") reasons.push("Destructive actions should stay hidden until a human explicitly reviews and enables them.");
  else if (actionLevel === "send") reasons.push("Outward-facing actions can message customers or publish data, so require approval.");
  else if (actionLevel === "write") reasons.push("This changes provider state, so require approval by default.");
  else reasons.push("This is read or draft-only and is safe to expose after reviewing its description.");
  if (requiresAuth) reasons.push("Provider credentials or OAuth scopes are required at execution time.");
  if (complex) reasons.push("The input shape is complex; add business context and edge-case guidance before production use.");
  if (!contextComplete) reasons.push("Add when-to-use and when-not-to-use context so agents choose the tool correctly.");

  return {
    actionLevel,
    riskScore: Math.min(100, SCORE_BY_ACTION[actionLevel] + (requiresAuth ? 5 : 0) + (complex ? 5 : 0)),
    recommendedPolicy: POLICY_BY_ACTION[actionLevel],
    recommendedEnabled: actionLevel !== "destructive",
    reasons,
    contextComplete,
  };
}

export function applyToolGovernanceRecommendation(tool: McpTool): McpTool {
  const assessment = assessToolGovernance(tool);
  return {
    ...tool,
    enabled: assessment.recommendedEnabled,
    policy: assessment.recommendedPolicy,
  };
}

export function agentFacingToolDescription(tool: McpTool, serverBusinessContext?: string | null) {
  const parts = [cleanContext(tool.description, 1600)];
  const profile = tool.x_astrail;
  const businessContext = cleanContext(profile?.business_context);
  const useWhen = cleanContext(profile?.use_when);
  const avoidWhen = cleanContext(profile?.avoid_when);
  const edgeCases = cleanContext(profile?.edge_case_notes);
  const sharedContext = cleanContext(serverBusinessContext, 1600);

  if (sharedContext) parts.push(`Server business context: ${sharedContext}`);
  if (businessContext) parts.push(`Business context: ${businessContext}`);
  if (useWhen) parts.push(`Use when: ${useWhen}`);
  if (avoidWhen) parts.push(`Do not use when: ${avoidWhen}`);
  if (edgeCases) parts.push(`Edge cases: ${edgeCases}`);
  return parts.filter(Boolean).join("\n\n").slice(0, 4000);
}
