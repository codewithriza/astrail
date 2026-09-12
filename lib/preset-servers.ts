import type { McpServer, McpTool } from "@/lib/types";
import { executableConnectorPreset, executableConnectors } from "@/lib/connector-catalog";

function codeFor(name: string, tools: McpTool[], kind: "connector" | "local_bridge") {
  const toolNames = tools.map((tool) => tool.name).join(", ");
  const note = kind === "local_bridge"
    ? "This is a local-bridge template. Astrail does not host Docker sockets or Kubernetes API access from its cloud runtime. Run a local MCP bridge and point your client at that endpoint."
    : "The hosted endpoint executes its verified deterministic endpoint map. Attach a least-privilege provider credential before calling private tools.";
  return `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: ${JSON.stringify(name)}, version: "1.0.0" });

// Curated Astrail ${kind === "local_bridge" ? "local-bridge template" : "connector"} for: ${toolNames}.
// ${note}

server.tool("connector_status", "Confirm this curated connector template is installed.", z.object({}), async () => ({
  content: [{ type: "text", text: ${JSON.stringify(kind === "local_bridge"
    ? "Local-bridge template only. Install a local Docker/Kubernetes MCP bridge; Astrail cloud runtime will not open host sockets or kubeconfigs."
    : "Connector installed. Attach provider credentials to enable hosted API calls.")} }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}

function localBridgePreset(
  id: string,
  name: string,
  category: string,
  description: string,
  tools: McpTool[],
  installHelp: string,
): McpServer {
  return {
    id,
    user_id: "preset",
    name,
    description,
    category,
    source_url: null,
    source_type: "preset",
    generated_code: null,
    tools_json: tools,
    endpoint_map: [],
    diagnostics: [
      "Local-bridge template (non-executable on Astrail cloud).",
      installHelp,
      "CLI: astrail connectors describe " + id,
    ],
    status: "preset",
    validation_status: "passed",
    generation_status: "passed",
    is_public: true,
    hosted_endpoint: `/api/mcp/${id}`,
    call_count: 0,
    generation_version: "local-bridge-v1",
    protocol_version: "2024-11-05",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

export const presetServers: McpServer[] = [
  ...executableConnectors.map(executableConnectorPreset),
  localBridgePreset(
    "preset-docker",
    "Docker Local Bridge Template",
    "DevOps",
    "Local-bridge template for containers, images, and logs. Astrail cloud does not attach to host Docker sockets; run a local MCP bridge.",
    [
      { name: "docker_list_containers", description: "List containers and current status via a local Docker bridge.", input_schema: { type: "object", properties: { all: { type: "boolean" } } } },
      { name: "docker_get_logs", description: "Fetch recent logs for a container via a local Docker bridge.", input_schema: { type: "object", properties: { container_id: { type: "string" }, lines: { type: "number" } }, required: ["container_id"] } },
      { name: "docker_restart_container", description: "Restart a container after approval via a local Docker bridge.", input_schema: { type: "object", properties: { container_id: { type: "string" } }, required: ["container_id"] } },
    ],
    "Install a local Docker MCP server (stdio/HTTP) that can reach the Docker engine, then register that endpoint in your agent client. Do not paste socket paths into Astrail cloud credentials.",
  ),
  localBridgePreset(
    "preset-kubernetes",
    "Kubernetes Local Bridge Template",
    "DevOps",
    "Local-bridge template for pods, deployments, and logs. Astrail cloud does not load arbitrary kubeconfigs; run a local MCP bridge against your cluster.",
    [
      { name: "kubernetes_list_pods", description: "List pods by namespace and labels via a local Kubernetes bridge.", input_schema: { type: "object", properties: { namespace: { type: "string" }, selector: { type: "string" } } } },
      { name: "kubernetes_get_logs", description: "Fetch pod logs via a local Kubernetes bridge.", input_schema: { type: "object", properties: { namespace: { type: "string" }, pod: { type: "string" } }, required: ["pod"] } },
      { name: "kubernetes_rollout_status", description: "Check rollout status for a deployment via a local Kubernetes bridge.", input_schema: { type: "object", properties: { namespace: { type: "string" }, deployment: { type: "string" } }, required: ["deployment"] } },
    ],
    "Install a local Kubernetes MCP server with a least-privilege kubeconfig on your machine or CI runner, then point your agent at that local endpoint.",
  ),
];

export function findPresetServer(id: string) {
  const server = presetServers.find((item) => item.id === id);
  if (!server) return null;

  const kind = server.endpoint_map && server.endpoint_map.length > 0 ? "connector" : "local_bridge";
  return {
    ...server,
    generated_code: codeFor(server.name, server.tools_json ?? [], kind === "connector" ? "connector" : "local_bridge"),
  };
}
