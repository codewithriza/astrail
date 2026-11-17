import type { McpServer, McpTool, OpenApiEndpoint } from "@/lib/types";

export type AgentReadinessCheck = {
  label: string;
  status: "passed" | "warning" | "missing";
  detail: string;
};

export type AgentReadinessReport = {
  score: number;
  grade: "production-ready" | "demo-ready" | "needs-review";
  checks: AgentReadinessCheck[];
  advantages: string[];
  nextActions: string[];
};

function hasSecurityRequirement(endpoint: OpenApiEndpoint) {
  const security = endpoint.security_requirements ?? endpoint.security;
  if (endpoint.requires_auth === true) return true;
  if (!security) return false;
  if (Array.isArray(security)) return security.length > 0;
  if (typeof security === "object") return Object.keys(security).length > 0;
  return Boolean(security);
}

function mappedTools(tools: McpTool[], endpointMap: OpenApiEndpoint[]) {
  return tools.filter((tool) =>
    endpointMap.some((endpoint) =>
      endpoint.tool_name === tool.name ||
      endpoint.operation_id === tool.name ||
      (endpoint.method === tool.method && endpoint.path === tool.path)
    )
  ).length;
}

function allToolsHaveAgentProfiles(tools: McpTool[]) {
  return tools.length > 0 && tools.every((tool) => Boolean(tool.x_astrail && tool.annotations));
}

function toolsWithExamples(tools: McpTool[]) {
  return tools.filter((tool) =>
    tool.x_astrail?.example_arguments &&
    Object.keys(tool.x_astrail.example_arguments).length > 0
  ).length;
}

function compressedComplexTools(tools: McpTool[]) {
  return tools.filter((tool) => tool.x_astrail?.complexity?.compressed).length;
}

function check(label: string, passed: boolean, detail: string, warning = false): AgentReadinessCheck {
  return {
    label,
    status: passed ? "passed" : warning ? "warning" : "missing",
    detail,
  };
}

export function buildAgentReadinessReport(server: McpServer): AgentReadinessReport {
  const tools = server.tools_json ?? [];
  const endpointMap = server.endpoint_map ?? [];
  const mappedToolCount = mappedTools(tools, endpointMap);
  const authRequiredCount = endpointMap.filter(hasSecurityRequirement).length;
  const executableCount = endpointMap.filter((endpoint) =>
    ["GET", "POST"].includes(endpoint.method) &&
    Boolean(endpoint.base_url) &&
    !hasSecurityRequirement(endpoint)
  ).length;
  const exampleCount = toolsWithExamples(tools);
  const compressedCount = compressedComplexTools(tools);

  const checks: AgentReadinessCheck[] = [
    check(
      "MCP surface",
      tools.length > 0,
      tools.length > 0 ? `${tools.length} tools exposed through tools/list.` : "No tools have been generated yet."
    ),
    check(
      "Endpoint map",
      endpointMap.length > 0 && mappedToolCount > 0,
      endpointMap.length > 0
        ? `${mappedToolCount}/${tools.length} tools are mapped to deterministic runtime metadata.`
        : "No endpoint map is stored for tools/call execution."
    ),
    check(
      "Hosted runtime",
      Boolean(server.hosted_endpoint),
      server.hosted_endpoint ? `Hosted at ${server.hosted_endpoint}.` : "No hosted endpoint is attached."
    ),
    check(
      "Safe execution",
      executableCount > 0 || authRequiredCount > 0,
      executableCount > 0
        ? `${executableCount} unauthenticated GET/POST tool(s) can execute through native fetch.`
        : authRequiredCount > 0
          ? `${authRequiredCount} tool(s) correctly stop at auth_required until credentials are configured.`
          : "No deterministic execution path detected.",
      endpointMap.length > 0
    ),
    check(
      "Agent annotations",
      allToolsHaveAgentProfiles(tools),
      allToolsHaveAgentProfiles(tools)
        ? "Every tool includes MCP annotations and Astrail risk/auth metadata."
        : "Some tools are missing risk/auth/example metadata."
    ),
    check(
      "Example arguments",
      exampleCount > 0,
      exampleCount > 0
        ? `${exampleCount} tool(s) include generated example arguments.`
        : "No generated examples are attached to tool metadata.",
      tools.length > 0
    ),
    check(
      "Parameter compression",
      compressedCount > 0 || tools.every((tool) => (tool.x_astrail?.complexity?.parameter_count ?? 0) <= 10),
      compressedCount > 0
        ? `${compressedCount} complex tool(s) use compact body mode instead of huge function signatures.`
        : "No large request schemas detected; tools remain compact.",
      tools.length > 0
    ),
    check(
      "Auth boundary",
      endpointMap.length > 0,
      authRequiredCount > 0
        ? `${authRequiredCount} endpoint(s) declare upstream auth requirements.`
        : "No auth-required operations detected in this endpoint map.",
      false
    ),
  ];

  const score = Math.round((checks.reduce((sum, item) => {
    if (item.status === "passed") return sum + 1;
    if (item.status === "warning") return sum + 0.5;
    return sum;
  }, 0) / checks.length) * 100);

  const grade = score >= 85 ? "production-ready" : score >= 60 ? "demo-ready" : "needs-review";
  const missing = checks.filter((item) => item.status !== "passed");

  return {
    score,
    grade,
    checks,
    advantages: [
      "Hosted MCP endpoint, not just generated source files.",
      "Deterministic endpoint_map runtime avoids eval and arbitrary generated-code execution.",
      "Agent risk/auth/example metadata travels through tools/list and bundles.",
      "Complex OpenAPI request bodies are compressed into usable body objects for agents.",
      "Worker export, credential injection, runtime proof, logs, and bundles compound around the generated server.",
    ],
    nextActions: missing.length === 0
      ? ["Run a live tools/call test and connect credentials for private provider endpoints."]
      : missing.slice(0, 3).map((item) => item.detail),
  };
}
